/**
 * POST /api/generate-weekly-coaching
 * 
 * Generates AI coaching for a specific week based on detected patterns.
 * 
 * Flow:
 * 1. Receive weekId + email (or fixture override)
 * 2. Detect weekly pattern (or use fixture)
 * 3. Check if coaching eligible
 * 4. Build prompt with pattern-specific constraints
 * 5. Call Anthropic API
 * 6. Validate output
 * 7. Retry once if validation fails
 * 8. Store result in Firestore
 * 
 * Returns:
 * - success: true + summary record if generated/skipped
 * - success: false + errors if rejected after retry
 */

import { NextRequest, NextResponse } from 'next/server';
import { doc, setDoc, getDoc, Timestamp, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { deriveWeeklyConstraintsFromPattern, deriveWeeklyConstraints, formatWeeklyConstraintsForPrompt, WeeklyConstraintSnapshot } from '@/app/services/deriveWeeklyConstraints';
import { getOrCreateVulnerabilityMap, formatVulnerabilityForPrompt } from '@/app/services/vulnerabilityMap';
import { deriveProgressionType, ProgressionResult } from '@/app/services/deriveProgressionType';
// Types
import {
  GenerateWeeklyCoachingRequest,
  GenerateWeeklyCoachingResponse,
  WeeklySummaryRecord,
  WeeklyPattern,
  PatternType,
  PatternConstraints,
  MODEL_VERSION,
  MODEL_CONFIG
} from '@/app/types/weeklyCoaching';

// Services
import { validateWeeklyCoaching, getErrorSummary } from '@/app/services/validateWeeklyCoaching';
import { detectWeeklyPattern } from '@/app/services/detectWeeklyPattern';
import { patternFixtures } from '@/app/services/fixtures/weeklyPatterns';
import { getPreviousWeekCalibration, formatCalibrationForPrompt } from '@/app/services/weeklyCalibration';
import { checkLanguageBeforeValidation } from '@/app/services/languageEnforcement';
import { deriveUserConstraints, formatConstraintsForPrompt } from '@/app/services/deriveUserConstraints';
import { detectDayOfWeekPatterns, DayOfWeekAnalysis } from '@/app/services/detectDayOfWeekPatterns';

// Import from your existing Firebase config
import { db } from '@/app/firebase/config';

// DELETE these lines (around 43-57):
// const firebaseConfig = { ... }
// if (!getApps().length) { ... }
// const db = getFirestore();

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ============================================================================
// PATTERN-SPECIFIC CONSTRAINTS
// ============================================================================

const PATTERN_CONSTRAINTS: Record<PatternType, PatternConstraints> = {
  building_momentum: {
    bannedPhrases: [],
    specialInstructions: `
CRITICAL FOR building_momentum:
- NEVER suggest changes unless variance is rising or recovery is declining
- Default orientation should be "Your current approach is working"
- Experiments should be rare for this pattern (< 30% of cases)
- If suggesting an experiment, it must be minor timing adjustments only
    `.trim()
  },

  momentum_plateau: {
    bannedPhrases: ['stuck', 'stagnation', 'stagnant', 'lacking progress', 'not improving'],
    approvedAlternatives: [
      'stable',
      'holding steady', 
      'consistent',
      'unchanged',
      'no upward or downward movement',
      'momentum is steady'
    ],
    specialInstructions: `
CRITICAL FOR momentum_plateau:
- Plateau is a measurement outcome, NOT a failure state
- Use ONLY approved alternatives to describe this pattern:
  * "stable momentum"
  * "holding steady"  
  * "consistent without acceleration"
  * "momentum unchanged"
  * "no upward or downward movement"
- Do NOT search for synonyms - use ONLY these Canon-approved terms
- Frame as neutral mechanical observation, not blockage
- Orientation should normalize plateau as valid signal showing system is working correctly
    `.trim()
  },

  commitment_misaligned: {
    bannedPhrases: [],
    requiredAcknowledgments: ['Exercise effort is not wasted'],
    specialInstructions: `
CRITICAL FOR commitment_misaligned:
- MUST acknowledge that exercise effort has value
- NO moralization of exercise volume vs momentum disconnect
- Explain this as a signal about recovery/foundation, not effort quality
- Frame as load-recovery balance, not virtue measurement
    `.trim()
  },

  gap_disruption: {
    bannedPhrases: ['discipline', 'motivation', 'priority', 'priorities', 'dedication'],
    specialInstructions: `
CRITICAL FOR gap_disruption:
- NEVER attribute gaps to personal qualities (discipline, motivation)
- Treat gaps as system events (life happened)
- NO language suggesting "getting back on track" implies falling off
- Frame as data collection resuming, not redemption
    `.trim()
  },

  recovery_deficit: {
    bannedPhrases: [],
    specialInstructions: `
CRITICAL FOR recovery_deficit:
- Distinguish between sleep quantity and quality patterns
- Avoid generic "sleep more" advice
- Frame as recovery capacity, not rest discipline
- Experiments should address timing/environment, not willpower
    `.trim()
  },

  effort_inconsistent: {
    bannedPhrases: ['not trying', 'half-hearted', 'lack of effort'],
    specialInstructions: `
CRITICAL FOR effort_inconsistent:
- Acknowledge which specific behaviors were consistent
- Frame as attention distribution, not effort failure
- NO "trying harder" language
- Experiments should be about reducing scope, not increasing effort
    `.trim()
  },

  variance_high: {
    bannedPhrases: [],
    specialInstructions: `
CRITICAL FOR variance_high:
- Identify which specific behavior(s) are varying
- Avoid generic "be more consistent" advice
- Frame as signal quality issue, not execution failure
- Experiments should narrow focus to one behavior
    `.trim()
  },

  momentum_decline: {
    bannedPhrases: ['failure', 'failed', 'falling apart', 'lost control', 'gave up'],
    approvedAlternatives: [
      'disrupted',
      'interrupted',
      'affected by circumstances',
      'recoverable drop',
      'temporary decline'
    ],
    specialInstructions: `
CRITICAL FOR momentum_decline:
- Frame decline as disruption to a working system, NOT systemic failure
- Acknowledge the drop without catastrophizing
- Emphasize recoverability: "This is a disruption, not a reset"
- DO NOT suggest major changes - system was working before disruption
- Warn against overcorrection: "Don't blow up what was working"
- Use approved language: "disrupted", "interrupted", "recoverable"
- Experiments should focus on returning to what was working, not new strategies
    `.trim()
  },

  insufficient_data: {
    bannedPhrases: [],
    specialInstructions: 'This pattern should never receive coaching.'
  },

  building_foundation: {
    bannedPhrases: [],
    specialInstructions: 'This pattern should never receive coaching.'
  }
};

// ============================================================================
// FOCUS ELIGIBILITY (Calibration Constraints)
// ============================================================================

function deriveAllowedFocusTypes(calibration: any): string[] {
  if (!calibration) return ['protect', 'hold', 'narrow', 'ignore'];
  
  const { structuralState } = calibration;
  
  // Warning signs = protection only
  if (structuralState === 'warning_signs') {
    return ['protect'];
  }
  
  // Holding = no pushing
  if (structuralState === 'holding') {
    return ['protect', 'hold'];
  }
  
  // Solid or building = full options
  return ['protect', 'hold', 'narrow', 'ignore'];
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================
async function buildSystemPrompt(
  email: string,
  pattern: WeeklyPattern, 
  allowedFocusTypes: string[],
  performanceAcknowledgment: string,
  progressionType: string,
  progressionReason: string,
  dayPatterns?: DayOfWeekAnalysis,
  weekOverWeekChanges?: Array<{ behavior: string; currentAvg: number; previousAvg: number; delta: number; direction: 'up' | 'down' | 'flat' }>,
  dominantLimiter?: string,
  userNotes?: string[], 
  previousErrors?: string[]
): Promise<string> {
  const constraints = PATTERN_CONSTRAINTS[pattern.primaryPattern];

// PHASE 3A: Onboarding context (starting point)
const userConstraints = await deriveUserConstraints(email);
const onboardingContext = formatConstraintsForPrompt(userConstraints);

// PHASE 3B: Weekly snapshot (current reality - OVERRIDES onboarding)
const weeklyConstraints = await deriveWeeklyConstraintsFromPattern(email, pattern);
console.log('[Coaching] Weekly snapshot:', JSON.stringify(weeklyConstraints, null, 2));

// Filter context based on dominant limiter to prevent cross-behavior reasoning
let filteredConstraints = weeklyConstraints;
if (dominantLimiter && weeklyConstraints) {
  if (dominantLimiter === 'nutrition') {
    // Only show nutrition-related data, hide other behaviors
    filteredConstraints = {
      timeCapacity: weeklyConstraints.timeCapacity,
      recoveryMargin: weeklyConstraints.recoveryMargin,
      phaseSignal: weeklyConstraints.phaseSignal,
      dominantLimiter: weeklyConstraints.dominantLimiter,
      nutritionAverage: weeklyConstraints.nutritionAverage,
      derivedFrom: weeklyConstraints.derivedFrom,
      generatedAt: weeklyConstraints.generatedAt
    } as WeeklyConstraintSnapshot;
  }
}

const currentContext = formatWeeklyConstraintsForPrompt(filteredConstraints);
console.log('[Coaching] Current context for prompt:', currentContext);

  const vulnerabilityMap = await getOrCreateVulnerabilityMap(email, {
    recoveryCapacity: userConstraints.recoveryCapacity,
    bodyCompositionPhase: userConstraints.bodyCompositionPhase
  });
  const vulnerabilityContext = formatVulnerabilityForPrompt(vulnerabilityMap);

  return `You are Nelson, an evidence-based personal health coach.

  # BEHAVIORAL DATA THIS WEEK (TRUST THIS FIRST)
  
  ${currentContext}
  
  ${performanceAcknowledgment}
# CONSTRAINT AUTHORITY LOCK (NON-NEGOTIABLE)

PRIMARY CONSTRAINT: ${dominantLimiter}
LARGEST NEGATIVE CHANGE: ${weekOverWeekChanges ? weekOverWeekChanges.filter(c => c.direction === 'down').sort((a, b) => a.delta - b.delta)[0]?.behavior + ' (dropped ' + Math.abs(weekOverWeekChanges.filter(c => c.direction === 'down').sort((a, b) => a.delta - b.delta)[0]?.delta || 0) + ' points)' : 'none detected'}

BACKGROUND CONDITIONS (non-causal state):
${filteredConstraints?.sleepAverage ? `Sleep: ${filteredConstraints.sleepAverage >= 80 ? 'strong' : filteredConstraints.sleepAverage >= 65 ? 'moderate' : 'variable'}` : ''}
${filteredConstraints?.hydrationAverage ? `Hydration: ${filteredConstraints.hydrationAverage >= 80 ? 'strong' : filteredConstraints.hydrationAverage >= 65 ? 'adequate' : 'inconsistent'}` : ''}
${filteredConstraints?.proteinAverage ? `Protein: ${filteredConstraints.proteinAverage >= 80 ? 'strong' : filteredConstraints.proteinAverage >= 65 ? 'moderate' : 'low'}` : ''}

The dominant limiter is binding.

You must:
- Describe the failing behavior directly
- Not introduce other behaviors as causes
- Not explain why the failure is happening
- Not construct cross-behavior causal chains
- Not use phrases like "because," "due to," "drives," "creates," "leads to," "cascades," or similar causal connectors when referencing other behaviors

Focus only on describing the constraint itself.

  # ENCOURAGEMENT FRAMEWORK (CRITICAL)

You are coaching a capable adult conducting a behavioral experiment on themselves.

CORE PRINCIPLES:
1. SOLID = SUCCESS (80% execution is the target, not Elite)
   - ANY behavior at 80%+ all week deserves acknowledgment
   - Frame Solid performance as hitting the target, not falling short
   - Elite (100%) is exceptional and rare, not expected

2. ACKNOWLEDGE EFFORT EVEN WITHOUT SOLID/ELITE
   - If no Solid/Elite exists, acknowledge check-in compliance
   - 5+/7 check-ins = showing up consistently
   - Maintained any behavior despite constraints = resilience

3. FRAME CONSTRAINTS AS DATA, NOT CHARACTER FLAWS
   - "Nutrition dropped 44 points" not "nutrition collapsed into chaos"
   - "Weekend pattern detected" not "weekend chaos"
   - State what happened, not what's wrong with them

4. ASSUME CAPABILITY
   - User is conducting experiment, not failing tests
   - Constraints are solvable puzzles, not catastrophes
   - The behavior needs adjustment, not the person

TONE REQUIREMENTS:
- Lead with what's working (check-ins, maintained behaviors, improvements)
- If NOTHING is Solid/Elite, acknowledge effort: "You showed up 6 out of 7 days"
- Present data as neutral observation, not judgment
- End with capability: "This is recoverable", "Structure will fix this"

FORBIDDEN LANGUAGE (will cause validation rejection):
- Harsh: chaos, collapse, disaster, crisis, terrible, awful, breaking down, falling apart
- Discouraging: still struggling, can't seem to, unable to maintain, keeps failing
- Catastrophizing: out of control, completely off track, nowhere near

REQUIRED ALTERNATIVES:
- "dropped" not "collapsed"
- "inconsistent" not "chaos"  
- "needs reinforcement" not "breaking down"
- "this behavior needs focus" not "you can't seem to"

  ${dayPatterns && dayPatterns.hasSignificantPatterns ? `
    
 # DAY-OF-WEEK PATTERNS (Reveals When Constraints Activate)
    
    Significant day-of-week variations detected:
    ${dayPatterns.patterns.map((p, i) => `${i + 1}. ${p.behavior}: ${p.pattern}
       - Weekday avg: ${p.weekdayAvg}
       - Weekend avg: ${p.weekendAvg}
       - Worst day: ${p.worstDay} (${p.worstDayAvg})
       - Best day: ${p.bestDay} (${p.bestDayAvg})`).join('\n')}
    How to use this data:
    • "Drops on weekends" with 30+ point gap = different constraint operating on weekends vs weekdays
    • Specific worst day (e.g., "Tuesday at 35") = something about that day's structure or demands
    • Small variance (≤10 points) = consistent constraint, not timing-based
    
    Example of good reasoning:
    "Nutrition drops to 42 on weekends while weekdays average 78. That 36-point weekend gap suggests weekday structure (meal prep? routine?) isn't translating to unstructured days."
    
    Example of lazy reasoning:
    "Nutrition is inconsistent throughout the week." (This ignores the clear weekend pattern)
    ` : ''}
    
  ${previousErrors && previousErrors.length > 0 ? `
âš ï¸ VALIDATION ERRORS FROM PREVIOUS ATTEMPT:
${previousErrors.map(err => `- ${err}`).join('\n')}

Your previous output was rejected. Please correct these specific violations and regenerate.
` : ''}


 ${weekOverWeekChanges && weekOverWeekChanges.length > 0 ? `
  # WEEK-OVER-WEEK CHANGES (Reveals Momentum Direction)
  
  Behavior changes from last week to this week:
  ${weekOverWeekChanges.map(c => {
    const arrow = c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→';
    return `- ${c.behavior}: ${c.previousAvg} → ${c.currentAvg} (${c.delta > 0 ? '+' : ''}${c.delta}) ${arrow}`;
  }).join('\n')}
  
  How to use this data:
  • Large deltas (±20+ points) usually reveal the actual constraint, not just "inconsistency"
  • Simultaneous drops across multiple behaviors suggest a common root cause
  • One behavior improving while others decline shows where capacity traded off
  
  Example of good reasoning:
  "Sleep jumped 34 points week-over-week (33 → 67), which opened recovery capacity. But nutrition dropped 33 points in the same window (96 → 63). That's the tradeoff - sleep improved but the structure that was protecting nutrition collapsed."
  
  Example of lazy reasoning:
  "Sleep improved and nutrition was inconsistent." (This hides the actual story in the numbers)
  ` : ''}

# REASONING HIERARCHY (BINDING CONTRACT)

When multiple patterns exist, you MUST reason in this exact order:

0. THE CONSTRAINT IS NOT THE CAUSE
   If nutrition dropped 36 points and notes say "sleep disrupted eating", the constraint is still nutrition.
   Upstream causes (sleep) do not override downstream collapses (nutrition).
   You coach the behavior that failed, not the behavior that explains why it failed.

1. WEEK-OVER-WEEK DELTAS override absolute values
   Direction of change reveals the active constraint. Large negative deltas matter more than static averages.

2. THE LARGEST NEGATIVE CHANGE is the primary constraint
   Improvements do not outweigh collapses. The biggest drop defines the problem to solve.

3. STRUCTURAL PATTERNS outrank transient events
   Repeating failures (weekend drops, same-day misses) are constraints. One-off bad days are noise.

4. USER NOTES are explanatory only
   Notes may explain WHY a pattern exists. Notes may NOT replace, soften, or override numerical evidence.

5. DOMINANT LIMITER is the default anchor
   Begin reasoning from the dominantLimiter in the snapshot. You may shift focus only if numerical evidence clearly contradicts it.

6. FOCUS MUST ALIGN WITH THE CONSTRAINT
   Selecting a focus that contradicts the dominant numerical pattern is incorrect. Do not give "coach-safe" advice that ignores the data.

   7. COACH THE BEHAVIOR THAT FAILED, NOT THE UPSTREAM CAUSE
   If nutrition dropped 36 points due to sleep disruption, the constraint is still nutrition.
   The focus must address nutrition directly (structure, timing, prep) not the upstream trigger.
   Explain the causal chain in Tension, then solve the downstream collapse in Focus.

   8. IMPROVEMENTS DO NOT JUSTIFY FOCUSING ELSEWHERE
   If sleep improved 25 points while nutrition dropped 36 points, the constraint is nutrition.
   Do NOT say "fix nutrition so sleep improves" - sleep is ALREADY improving.
   Say "sleep improved, which should have stabilized nutrition, but nutrition collapsed anyway."
   The behavior that's failing despite improvements elsewhere is the actual constraint.

# USER'S STATED GOAL

This user came to Nelson to: ${userConstraints.primaryDriver}

In Why This Matters, show how fixing the constraint moves them toward THIS SPECIFIC GOAL.
In your Why This Matters section, you MUST include this exact phrase:
"... your goal to ${userConstraints.primaryDriver.toLowerCase()}."

Do not paraphrase. Do not generalize. Copy that phrase verbatim.

   # PRIMARY OBJECTIVE

Your job is to identify the single dominant tension currently limiting this user's momentum.

NOT: "Explain what happened this week"
YES: "Surface the non-obvious constraint this pattern reveals"

Everything else serves this goal.

# NOVELTY SUPPRESSION (CRITICAL)

Prefer reinforcing an existing understanding over introducing a new concept.

Only introduce a new angle if:
- Calibration shows user misunderstood last week
- User notes explicitly reveal a new constraint
- Behavioral data contradicts previous interpretation

If the same constraint is still active, SAY SO. Do not rotate advice for novelty.
Users trust momentum compounding, not concepts rotating.

NOT: "Explain what happened this week"
YES: "Surface the non-obvious constraint this pattern reveals"

Everything else serves this goal.

## Starting Point (Onboarding)
${onboardingContext}

## This User's Constraints
${onboardingContext}

## Category Vulnerability Map
${vulnerabilityContext}

## Previous Week's Calibration
${await (async () => {
  const prevCalibration = await getPreviousWeekCalibration(email, pattern.weekId);
  const calibrationText = formatCalibrationForPrompt(prevCalibration);
  const allowedFocusTypes = deriveAllowedFocusTypes(prevCalibration);
  
  let focusConstraint = '';
  if (allowedFocusTypes.length < 4) {
    focusConstraint = `\n\nâš ï¸ FOCUS CONSTRAINTS (REQUIRED):\nBased on last week's calibration, you MUST use one of these focus types: ${allowedFocusTypes.join(', ')}\n${allowedFocusTypes.length === 1 ? 'YOU MUST USE THIS FOCUS TYPE. No other options are allowed.' : ''}`;
  }
  
  return calibrationText + focusConstraint;
})()}

## User Notes This Week
${userNotes && userNotes.length > 0 ? `
${userNotes.map((note, i) => `${i + 1}. "${note}"`).join('\n')}

Notes provide context. The constraint is determined by behavioral data.
` : 'No notes provided this week.'}

# CATEGORY SEMANTIC DEFINITIONS

ALL categories use this 4-tier grading system:
- **Elite (100 points)**: Perfect execution, requires active constraint management
- **Solid (80 points)**: Hit target, sustainable without recovery debt  
- **Not Great (50 points)**: Partial execution, fragile
- **Off (0 points)**: Missed/avoided, constraint collision

**INTERPRET THROUGH EFFORT COST:**
- Elite = requires extra planning/time/constraint navigation
- Solid = repeatable minimum, no recovery debt
- Not Great = partial effort, ran out of time/capacity
- Off = constraint collision (not discipline failure)

### Foundation Behaviors

**PROTEIN**:
- Off: Below floor due to schedule/access constraints
- Not Great: Partial intake (50-80%), incomplete execution
- Solid: Hit floor, adequate for recovery
- Elite: Exceeded floor with precision, meal prep required

**HYDRATION**:
- Off: Significantly below 64oz, passive miss
- Not Great: Partial (30-50oz), forgot to refill
- Solid: Hit 64oz target
- Elite: Hit target + avoided liquid calories (alcohol, sugary drinks, caloric coffees)

**SLEEP**:
- Off: Missed target by 2+ hours or severe disruption (constraint failure)
- Not Great: Missed by 1 hour or moderate disruption
- Solid: Hit target, adequate continuity
- Elite: Exceeded target, required schedule protection

**NUTRITION PATTERN**:
- Off: Completely abandoned pattern (constraint mismatch)
- Not Great: Followed some meals, mixed execution
- Solid: Followed most meals, reasonable variance
- Elite: Perfect adherence through disruption

**ENERGY BALANCE**:
- Off: Extreme deficit or surplus (dysregulation)
- Not Great: Moderate imbalance, couldn't course-correct
- Solid: Appropriate for goals most days
- Elite: Precise alignment, requires tracking or mastery

**EXERCISE/MOVEMENT**:
- Off: Skipped, commitment not executable
- Not Great: Partial completion, ran out of time/energy
- Solid: Met commitment, repeatable at current level
- Elite: Exceeded commitment, extra time/planning required

**BONUS MOVEMENT** (NEAT - never primary Focus driver):
- Off: Sedentary beyond exercise
- Not Great: Some activity, minimal steps
- Solid: Consistent bonus movement
- Elite: High NEAT day (10k+ steps)

**MINDSET** (signal only, NEVER a coaching target):
- Off: Persistent negative state (load exceeding capacity)
- Not Great: Struggling, approaching capacity limit
- Solid: Neutral to positive, manageable
- Elite: Positive, energized, abundant capacity

# ELITE PERFORMANCE DETECTION (MUST RUN FIRST)

Before generating any output, scan the weekly behavior data:

1. Check each behavior in behaviorGrades for grade: 100 (Elite)
2. If ANY behavior = 100 for ALL 7 days, flag it as STANDOUT WIN
3. The standout win MUST be mentioned in:
   - ACKNOWLEDGMENT section (lead with it)
   - PATTERN section (first sentence)
   - WHY THIS MATTERS section (acknowledge before constraint)

Example Elite behaviors:
- Sleep: 100 all week = "Elite sleep all 7 nights"
- Protein: 100 all week = "Perfect protein consistency"
- Movement: 100 all week = "Exercise every single day"

If Elite performance exists and is NOT acknowledged in all three sections, the output is INVALID.

# FINAL CONSTRAINT CHECK (MANDATORY VALIDATION)

Before generating your Focus, verify:

QUESTION: What was the largest negative week-over-week change?
ANSWER FROM DATA: ${weekOverWeekChanges ? weekOverWeekChanges.filter(c => c.direction === 'down').sort((a, b) => a.delta - b.delta)[0]?.behavior + ' dropped ' + Math.abs(weekOverWeekChanges.filter(c => c.direction === 'down').sort((a, b) => a.delta - b.delta)[0]?.delta || 0) + ' points' : 'none'}

QUESTION: What is the dominant limiter?
ANSWER FROM DATA: ${weeklyConstraints?.dominantLimiter || 'unknown'}

YOUR FOCUS MUST ADDRESS ONE OF THESE TWO BEHAVIORS.

If your Focus mentions sleep but the answers above say "nutrition", you have FAILED the reasoning hierarchy.
If your Focus mentions hydration but the answers above say "nutrition", you have FAILED the reasoning hierarchy.

Regenerate your Focus to address the actual constraint.

# OUTPUT STRUCTURE (REQUIRED)

Target length: 200-300 words total. No character limits per section.

Respond with valid JSON in this exact structure:

{
  "pattern": "string",
  "tension": "string",
  "whyThisMatters": "string",
  "progression": {
    "text": "string",
    "type": "advance" | "stabilize" | "simplify"
  }
}

OUTPUT STRUCTURE:

LEAD WITH DATA, NOT NARRATIVE (CRITICAL):
Pattern MUST show actual behavioral averages, not just narrative from notes.

REQUIRED DATA IN PATTERN:
- Mention at least 2 behavioral category averages with percentages
- Show the pattern in the numbers
- ONLY AFTER stating data → reference notes to explain WHY
- Format: Data (what happened) → Pattern (how it unfolded) → Notes (why)

ANTI-PATTERNS - DO NOT DO THIS:
❌ Do not summarize notes without first stating behavioral data
❌ Do not explain causes that are not visible in the data
❌ Do not use vague terms like "consistency" without specific percentages

## ACKNOWLEDGMENT + PATTERN (Combined: 2-3 sentences)

First sentence: Call out the standout win.
- If Elite performance exists (grade 100 all 7 days), name it specifically
- If no Elite, acknowledge best consistency or improvement

Second sentence: Show the behavioral data with specific averages.
- Check-ins completed, exercise days, momentum score
- At least 2 behavioral category averages (Nutrition X%, Sleep Y%, Hydration Z%)
- Show the pattern: "mid-week dip", "steady all week", "improving trajectory"

Third sentence: Introduce the contrast or limiting factor.
- Reference notes ONLY to explain the data pattern, not replace it
- Elite sleep but flat momentum → nutrition is the gap
- Perfect exercise but low energy → sleep or nutrition issue

REQUIREMENTS:
- FIRST SENTENCE must acknowledge what went well or stayed consistent
- SECOND SENTENCE must include at least 2 behavioral averages with percentages
- If Elite performance exists, name it specifically
- Show contrast using data (effort vs outcome, before vs after, stable vs drifting)
- Use natural language: "every day" not "7/7 days", "all 7 days" not "7/7"
- Anchor to at least TWO specific numbers from evidence (exact values required, phrasing can vary):
${pattern.evidencePoints.map((e, i) => `  ${i + 1}. "${e}"`).join('\n')}
- May include directional observation (momentum up/down, stable/changing) but NOT causality
- NO interpretation yet, just orientation

FORBIDDEN:
❌ "7/7 days" or "x/x" notation - NEVER USE FRACTIONS OR RATIOS
❌ Write "all 7 days" or "every day" or "almost every day" or "most days" or "some days" or "few days" or "on occassion"
❌ "The drop shows you're overreaching"
❌ "Your notes reveal X created a disconnect" (without stating data first)

UNIQUENESS REQUIREMENT:
Do not reuse sentence structure, metaphors, or framing from this user's prior weeks.
Each coaching must feel fresh, not templated.

## 2. THE TENSION (2-3 sentences)

What is actually happening right now.

ROLE: Describe the mechanism creating this limitation in present tense.

REQUIREMENTS:
- Present tense only: "is creating", "is disrupting", "is breaking"
- Use pronouns if Pattern already named specifics: "This pattern" not "Sleep timing"
- Integrate user notes as evidence of HOW the mechanism operates
- Must be specific to THIS user (not generic wellness advice)

FORBIDDEN - OUTCOME LANGUAGE:
❌ "can't", "won't", "unable to", "fails to" + any verb
❌ "preventing", "stopping", "blocking", "holding back"
❌ "keeping you from", "won't translate", "can't overcome"
❌ Any phrase about what this stops or enables (that's Why This Matters)

REQUIRED - MECHANISM LANGUAGE:
- Use present tense action verbs: "is creating", "is disrupting", "breaks"
- Describe HOW the constraint operates, not what it prevents

ANTI-REDUNDANCY:
- Don't repeat specific nouns from Pattern (use pronouns instead)
- Each section introduces NEW information

TEST: Does this sentence describe WHAT'S HAPPENING or WHAT IT PREVENTS? If the latter, rewrite.

## 3. WHY THIS MATTERS (4-5 sentences)

Why THIS limitation matters for YOU specifically.

ROLE: Forward-looking personal consequence ONLY.
- Answer: "What's at stake if this stays unresolved? What unlocks if addressed?"
- NO re-explaining the pattern
- NO re-describing what's happening
- NO re-stating consistency or effort

REQUIREMENTS:
- Must be asymmetric: explain why THIS matters MORE for this user
- Reference user's goal, age, recovery capacity, or vulnerability ONLY if it explains the stakes
- Show both sides: what happens if unresolved + what unlocks if addressed
- Connect to specific numbers from this week

POSITIVITY REQUIREMENTS (CRITICAL):
- Lead with what unlocks when addressed, NOT what fails if unresolved
- Frame as "Address X and Y unlocks" NOT "If X stays broken, you stay stuck"
- Acknowledge capability: "your body can handle this", "you're not limited by recovery"
- Show the user they're closer than they think: "this one thing is the only gap"
- End on forward momentum, not warning.  Be encouraging.

FORBIDDEN:
❌ Re-explaining the specific limitation already named
❌ "You're doing X consistently" (already stated in Pattern)
❌ "The limitation is Y" (already stated in Tension)
❌ Re-describing the mechanism
❌ "Moderate vulnerability zone" or technical backend language
❌ Mentioning or referencing user notes (notes explain mechanism, this section is about stakes)
❌ "This single constraint" / "This one constraint" (overused connector phrase)
❌ "Your body can handle [X]" (becoming templated reassurance - be more specific)
❌ Using "constraint" in coaching output (use: gap, limitation, bottleneck, factor)

ANTI-REDUNDANCY:
- If you used specific phrases in Pattern or Tension (specific foods, timing issues, behavioral patterns),
- Reference indirectly: "If this stays unresolved", "Address it", "This one pattern"
- Focus on consequence and unlock, not re-explaining the mechanism

STAKES-ONLY RULE (CRITICAL):
Why This Matters describes CONSEQUENCES and UNLOCKS, NOT how the limitation operates.
FORBIDDEN MECHANISM WORDS:
- "bottleneck", "leak", "debt", "acting as", "creating", "undermining", "disrupting"
- Any description of HOW the limitation works (that's Tension's job)

REQUIRED FOCUS:
- What happens if unresolved (momentum stays flat, progress stalls)
- What unlocks if addressed (acceleration, compounding, visible results)
- Why THIS user specifically (not generic wellness advice)
TEST: If the sentence could fit in Tension, it doesn't belong here.

LITMUS TEST: Could I delete "Tension" and still feel the stakes? If NO, this section failed.

## 4. WEEKLY PROGRESSION (1-2 sentences)

⚠️ PROGRESSION TYPE: ${progressionType.toUpperCase()}
Reason: ${progressionReason}

The directive for the next 7 days based on your current state.

PROGRESSION TYPES:
- ADVANCE: Move forward (increase intensity/frequency/commitment)
  Examples: "Increase movement to 6 days/week", "Add protein focus at lunch", "Increase sleep target by 30 minutes"
  
- STABILIZE: Hold position (consolidate recent changes, time-boxed for 7 days)
  Examples: "Hold at 5 days/week for one more week", "Maintain current sleep target while body adapts"
  
- SIMPLIFY: Back up (strategic retreat to rebuild foundation, not failure)
  Examples: "Drop to 3 exercise days this week", "Focus only on sleep and hydration, let everything else coast"

REQUIREMENTS:
- Use the progression type provided above (${progressionType.toUpperCase()})
- Give ONE specific, actionable directive
- No hedging ("consider", "try to", "maybe")
- Frame as earned next step or strategic choice, not moral judgment

FORBIDDEN IN PROGRESSION:
- "system", "your system", "the system"
- "pattern", "this pattern", "the pattern"
- "data", "metrics", "score", "momentum score"
- Generic advice without specific behavior/target
- Any meta-language about measurement or analysis

Write as if speaking directly to a person, not analyzing their data.

# PATTERN-SPECIFIC CONSTRAINTS FOR: ${pattern.primaryPattern}

${constraints.specialInstructions}

${constraints.bannedPhrases && constraints.bannedPhrases.length > 0 ? `
BANNED PHRASES (validation will reject if these appear):
${constraints.bannedPhrases.map(p => `- "${p}"`).join('\n')}
` : ''}

${constraints.approvedAlternatives && constraints.approvedAlternatives.length > 0 ? `
USE THESE CANON-APPROVED ALTERNATIVES:
${constraints.approvedAlternatives.map(a => `- "${a}"`).join('\n')}
` : ''}

${constraints.requiredAcknowledgments && constraints.requiredAcknowledgments.length > 0 ? `
REQUIRED ACKNOWLEDGMENTS:
${constraints.requiredAcknowledgments.map(a => `- ${a}`).join('\n')}
` : ''}

# LANGUAGE RULES

MANDATORY TONE RULES:
- Use second-person ("you") as sentence subject, not "data" or "system" or "pattern"
- Make declarative claims, not probabilistic observations
- NO hedge language: "suggests", "signals", "may indicate", "appears", "reflects"
- If a sentence could be pasted into a corporate report, rewrite it
- Consequences must be emotionally recognizable, not theoretically correct

APPROVED ALTERNATIVES FOR BANNED PHRASES:
Instead of "your system" → use "your body", "you", "your recovery"
Instead of "suggests" or "signals" → use "means", "shows", "this is"
Instead of "capacity ceiling" → use "your limit", "what you can handle"

ALLOWED AND ENCOURAGED:
- Capacity, recovery, load, limits, tradeoffs
- Constraint, tension
- "Your body", "your recovery", "what you can handle"

FORBIDDEN:
- "Your system", "the system", "system is", "system was"
- Mentioning age more than once per output (reference it ONLY if it directly explains why this matters more for them)
- Hedge language: "suggests", "signals", "may indicate", "appears", "reflects", "could be"
- Motivational language ("You've got this!", "Keep pushing!")
- Exclamation marks (except in quoted user notes)
- Moral judgment ("You failed", "You need to try harder")
- Generic wellness advice not grounded in THIS user's data
- System/technical language: "infrastructure", "being utilized", "fully utilized"
- Meta-commentary: "Context is inferred from behavior alone"

# VALIDATION CHECKLIST (Critical)

Before submitting output, verify:

❌ Pattern section cites at least TWO specific data points
❌ Tension synthesizes at least TWO context layers (pattern + constraints/vulnerability/notes)
❌ Tension is specific to this user (would NOT apply to most users)
❌ If user notes exist, at least ONE is referenced
❌ If no notes exist, absence is used as signal (not stated as limitation)
❌ WhyThisMatters explains why this matters MORE for this user
✓ Progression is ADVANCE/STABILIZE/SIMPLIFY (not action list)
❌ No banned phrases appear anywhere

FINAL CHECK:
"Did this reframe how the user understands their situation?"
If NO â†’ regenerate with stronger tension identification

# DETECTED PATTERN FOR THIS WEEK

Pattern Type: ${pattern.primaryPattern}

Evidence:
${pattern.evidencePoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}

Week ID: ${pattern.weekId}
Days Analyzed: ${pattern.daysAnalyzed}
Real Check-Ins This Week: ${pattern.realCheckInsThisWeek}

# MANDATORY PRE-GENERATION CHECK

Before generating ANY output:

1. Scan behaviorGrades for ANY grade: 100 across all 7 days
2. If found, write it down: "ELITE: [behavior name]"
3. Verify this Elite behavior is mentioned in:
   - Combined Acknowledgment+Pattern section (first sentence)
   - Why This Matters section (before stating constraint)

If Elite exists but is not mentioned, DO NOT SUBMIT. Regenerate with Elite acknowledgment.

# FINAL VALIDATION: ROLE SEPARATION

Before submitting output, verify:

TENSION section:
- Present tense only
- Describes mechanism, NOT consequence
- No "unlock" or "would" language
- Does NOT repeat pattern description
- Does NOT list what's working

WHY THIS MATTERS section:
- Forward-looking only
- Shows stakes + unlock
- Does NOT re-explain the constraint
- Does NOT re-state consistency
- Provides reassurance and a positive outlook that encourages the user to keep showing up

LITMUS TEST:
- Could I delete Tension and still understand the diagnosis? â†’ Must be NO
- Could I delete Why This Matters and still feel the stakes? â†’ Must be NO

If either answer is YES, sections have overlapped. Regenerate.

Generate tension-first coaching based on this pattern, user context, and semantic definitions.
Respond with ONLY the JSON object, no markdown code blocks, no preamble.`;
}
// ============================================================================
// PERFORMANCE DETECTION
// ============================================================================

/**
 * Detect Solid Week performance (80+ average for a behavior)
 * This is the target, not Elite 7/7
 */
function detectSolidWeekPerformance(weekData: any[]): {
  solidWeek: string[];
  eliteWeek: string[];
} {
  const solidWeek: string[] = [];
  const eliteWeek: string[] = [];
  
  const behaviorNames = [
    { key: 'nutrition_pattern', label: 'Nutrition Pattern' },
    { key: 'energy_balance', label: 'Energy Balance' },
    { key: 'protein', label: 'Protein' },
    { key: 'hydration', label: 'Hydration' },
    { key: 'sleep', label: 'Sleep' },
    { key: 'mindset', label: 'Mindset' },
    { key: 'movement', label: 'Movement' }
  ];
  
  for (const behavior of behaviorNames) {
    // Get all grades for this behavior across the week
    const grades = weekData.map(day => {
      const grade = day.behaviorGrades?.find((b: any) => b.name === behavior.key)?.grade;
      return grade ?? 0;
    }).filter(g => g > 0); // Only count days with actual ratings
    
    if (grades.length < 7) continue; // Need full week
    
    // Calculate average
    const average = grades.reduce((sum, g) => sum + g, 0) / grades.length;
    
    // Check for Elite week (100 all 7 days)
    const allElite = grades.every(g => g === 100);
    
    // Check for Solid week (80+ average)
    const solidAverage = average >= 80;
    
    if (allElite) {
      eliteWeek.push(behavior.label);
    } else if (solidAverage) {
      solidWeek.push(behavior.label);
    }
  }
  
  return { solidWeek, eliteWeek };
}
/**
 * Compare current week to previous week behaviors
 * Returns delta data for each behavior
 */
function compareWeekToWeek(
  currentWeek: Array<{ behaviorGrades: Array<{ name: string; grade: number }> }>,
  previousWeek: Array<{ behaviorGrades: Array<{ name: string; grade: number }> }>
): Array<{ behavior: string; currentAvg: number; previousAvg: number; delta: number; direction: 'up' | 'down' | 'flat' }> {
  const behaviors = ['nutrition_pattern', 'energy_balance', 'protein', 'hydration', 'sleep', 'movement'];
  const comparisons = [];

  for (const behavior of behaviors) {
    // Calculate current week average
    const currentGrades = currentWeek
      .flatMap(day => day.behaviorGrades.filter(b => b.name === behavior))
      .map(b => b.grade);
    const currentAvg = currentGrades.length > 0 
      ? Math.round(currentGrades.reduce((sum, g) => sum + g, 0) / currentGrades.length)
      : 0;

    // Calculate previous week average
    const previousGrades = previousWeek
      .flatMap(day => day.behaviorGrades.filter(b => b.name === behavior))
      .map(b => b.grade);
    const previousAvg = previousGrades.length > 0
      ? Math.round(previousGrades.reduce((sum, g) => sum + g, 0) / previousGrades.length)
      : 0;

    // Calculate delta
    const delta = currentAvg - previousAvg;
    let direction: 'up' | 'down' | 'flat' = 'flat';
    if (delta > 5) direction = 'up';
    if (delta < -5) direction = 'down';

    comparisons.push({
      behavior: behavior.replace('_', ' '),
      currentAvg,
      previousAvg,
      delta,
      direction
    });
  }

  return comparisons;
}
// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body: GenerateWeeklyCoachingRequest = await request.json();
    const { email, weekId, useFixture } = body;

    // Validate input
    if (!email || !weekId) {
      return NextResponse.json<GenerateWeeklyCoachingResponse>(
        { success: false, error: 'Missing required fields: email, weekId' },
        { status: 400 }
      );
    }

    // Get pattern (from fixture or real detection)
    let pattern: WeeklyPattern;
    
    if (useFixture) {
      console.log(`[Coaching] Using fixture: ${useFixture}`);
      pattern = patternFixtures[useFixture];
      if (!pattern) {
        return NextResponse.json<GenerateWeeklyCoachingResponse>(
          { success: false, error: `Invalid fixture: ${useFixture}` },
          { status: 400 }
        );
      }
    } else {
      console.log(`[Coaching] Detecting pattern for ${email}, ${weekId}`);
      pattern = await detectWeeklyPattern(email, weekId);
    }

    console.log(`[Coaching] Pattern: ${pattern.primaryPattern}, canCoach: ${pattern.canCoach}`);
// Fetch week data for performance detection
let performance: { solidWeek: string[]; eliteWeek: string[] } = { solidWeek: [], eliteWeek: [] };
let progressionResult: ProgressionResult = {
  type: 'advance',
  reason: 'Default progression - no data available',
  triggers: []
};
let dayOfWeekPatterns: DayOfWeekAnalysis | undefined;
let weekOverWeekComparison: Array<{ behavior: string; currentAvg: number; previousAvg: number; delta: number; direction: 'up' | 'down' | 'flat' }> | undefined;
let dominantLimiter: string | undefined;
if (!useFixture) {
  const { start, end } = pattern.dateRange;
  const momentumRef = collection(db, 'users', email, 'momentum');
  const q = query(
    momentumRef,
    where('date', '>=', start),
    where('date', '<=', end),
    where('checkinType', '==', 'real'),
    orderBy('date', 'asc')
  );
  const snapshot = await getDocs(q);
  const weekData = snapshot.docs.map(doc => doc.data());
  
  performance = detectSolidWeekPerformance(weekData);
  console.log(`[Coaching] Performance detected - Solid: ${performance.solidWeek.join(', ')}, Elite: ${performance.eliteWeek.join(', ')}`);
// Derive progression type from week data
  // Need previous week data for comparison
  const prevWeekStart = new Date(pattern.dateRange.start);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(pattern.dateRange.start);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
  
  const prevWeekQuery = query(
    momentumRef,
    where('date', '>=', prevWeekStart.toLocaleDateString('en-CA')),
    where('date', '<=', prevWeekEnd.toLocaleDateString('en-CA')),
    where('checkinType', '==', 'real'),
    orderBy('date', 'asc')
  );
  const prevSnapshot = await getDocs(prevWeekQuery);
  const previousWeekData = prevSnapshot.docs.map(doc => doc.data());
  
  try {
    progressionResult = deriveProgressionType(
      weekData as Array<{
        date: string;
        checkinType: 'real' | 'gap_fill';
        exerciseCompleted: boolean;
        behaviorGrades: Array<{ name: string; grade: number }>;
        momentumScore: number;
        dailyScore: number;
      }>,
      previousWeekData as Array<{
        date: string;
        checkinType: 'real' | 'gap_fill';
        exerciseCompleted: boolean;
        behaviorGrades: Array<{ name: string; grade: number }>;
        momentumScore: number;
        dailyScore: number;
      }>
    );
    console.log(`[Coaching] Progression: ${progressionResult.type} - ${progressionResult.reason}`);
    console.log(`[Coaching] Progression triggers:`, progressionResult.triggers);
  } catch (error) {
    console.error('[Coaching] Error deriving progression:', error);
    // Keep default progression on error
  }
  
 // Detect day-of-week patterns
 let dayOfWeekPatterns: DayOfWeekAnalysis | undefined;
 try {
   dayOfWeekPatterns = detectDayOfWeekPatterns(weekData as Array<{
     date: string;
     checkinType: 'real' | 'gap_fill';
     exerciseCompleted: boolean;
     behaviorGrades: Array<{ name: string; grade: number }>;
     momentumScore: number;
     dailyScore: number;
   }>);
   console.log(`[Coaching] Day patterns:`, dayOfWeekPatterns.hasSignificantPatterns ? 'DETECTED' : 'none');
   if (dayOfWeekPatterns.hasSignificantPatterns) {
     console.log('[Coaching] Pattern details:', dayOfWeekPatterns.patterns.map(p => `${p.behavior}: ${p.pattern}`).join(', '));
   }
 } catch (error) {
   console.error('[Coaching] Error detecting day patterns:', error);
 }
// Calculate dominant limiter for validation
const weeklyConstraints = await deriveWeeklyConstraintsFromPattern(email, pattern);
dominantLimiter = weeklyConstraints?.dominantLimiter;
  // Compare to previous week
  if (previousWeekData.length > 0) {
    weekOverWeekComparison = compareWeekToWeek(
      weekData as Array<{ behaviorGrades: Array<{ name: string; grade: number }> }>,
      previousWeekData as Array<{ behaviorGrades: Array<{ name: string; grade: number }> }>
    );
    console.log('[Coaching] Week-over-week changes:', weekOverWeekComparison
      .filter(c => c.direction !== 'flat')
      .map(c => `${c.behavior}: ${c.delta > 0 ? '+' : ''}${c.delta}`)
      .join(', '));
  }
}

// Build acknowledgment text
let performanceAcknowledgment = '';
if (performance.eliteWeek.length > 0) {
  performanceAcknowledgment = `
# âš ï¸ ELITE WEEK DETECTED - MANDATORY ACKNOWLEDGMENT

The following behaviors achieved Elite (100) ALL 7 DAYS:
${performance.eliteWeek.map(b => `- ${b}`).join('\n')}

This is exceptional and rare. You MUST acknowledge this in the ACKNOWLEDGMENT section.
`;
} else if (performance.solidWeek.length > 0) {
  performanceAcknowledgment = `
# âš ï¸ SOLID WEEK DETECTED - MANDATORY ACKNOWLEDGMENT

The following behaviors averaged 80+ (Solid or better) this week:
${performance.solidWeek.map(b => `- ${b}`).join('\n')}

This is the target performance level. You MUST acknowledge this in the ACKNOWLEDGMENT section.
Example: "Sleep stayed Solid or better all week, supporting your recovery."
`;
}

// ============================================================================
// Get calibration for focus eligibility gating
const prevCalibration = await getPreviousWeekCalibration(email, pattern.weekId);
    // Check if coaching eligible
    if (!pattern.canCoach) {
      // Store skipped record
      const skipReason = pattern.primaryPattern === 'insufficient_data' 
        ? 'insufficient_data' 
        : 'building_foundation';

      const summaryRecord: WeeklySummaryRecord = {
        weekId: pattern.weekId,
        patternType: pattern.primaryPattern,
        canCoach: false,
        skipReason,
        evidencePoints: pattern.evidencePoints,
        modelVersion: 'none',
        status: 'skipped',
        generatedAt: Timestamp.now(),
        daysAnalyzed: pattern.daysAnalyzed,
        realCheckInsThisWeek: pattern.realCheckInsThisWeek,
        totalLifetimeCheckIns: pattern.totalLifetimeCheckIns
      };

      await storeWeeklySummary(email, summaryRecord);

      console.log(`[Coaching] Skipped: ${skipReason}`);

      return NextResponse.json<GenerateWeeklyCoachingResponse>({
        success: true,
        summary: summaryRecord
      });
    }

    // Extract user notes from this week's check-ins (if not using fixture)
    let userNotes: string[] = [];
    if (!useFixture) {
      userNotes = await extractUserNotes(email, pattern);
      console.log(`[Coaching] Found ${userNotes.length} user notes this week`);
    }

    // Generate coaching with retry
    const maxAttempts = 3;
    let attempt = 0;
    let validationResult;
    let rawOutput: string = '';
    let previousErrors: string[] = [];

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`[Coaching] Generation attempt ${attempt}/${maxAttempts}`);

      try {
        // Build prompt (include previous errors on retry)

const allowedFocusTypes = deriveAllowedFocusTypes(prevCalibration);
// Default progression for fixtures
const progressionType = progressionResult.type;
const progressionReason = progressionResult.reason;

const systemPrompt = await buildSystemPrompt(
  email,
  pattern,
  allowedFocusTypes,
  performanceAcknowledgment,
  progressionType,
  progressionReason,
  dayOfWeekPatterns,
  weekOverWeekComparison,
  dominantLimiter,  // ADD THIS LINE
  userNotes.length > 0 ? userNotes : undefined,
);
        // Call Anthropic API
        const message = await anthropic.messages.create({
          model: MODEL_CONFIG.model,
          max_tokens: MODEL_CONFIG.max_tokens,
          temperature: MODEL_CONFIG.temperature,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: attempt === 1 
                ? `Generate coaching for this week based on the pattern and evidence provided in the system prompt. Respond with ONLY the JSON object, nothing else.`
                : `The previous output was rejected due to validation errors. Generate a corrected version following all Canon rules. Respond with ONLY the JSON object, nothing else.`
            }
          ]
        });

// Extract text content
const textContent = message.content.find(block => block.type === 'text');
if (!textContent || textContent.type !== 'text') {
  throw new Error('No text content in API response');
}

rawOutput = textContent.text;
console.log(`[Coaching] Received output, length: ${rawOutput.length}`);
console.log('[Coaching] Raw output to check:\n', rawOutput);

// LANGUAGE ENFORCEMENT (runs before validation)
console.log('[DEBUG] About to run language enforcement...');
const languageCheck = checkLanguageBeforeValidation(rawOutput, performance.solidWeek, performance.eliteWeek);
console.log('[DEBUG] Language check passed:', languageCheck.passed);

if (!languageCheck.passed) {
console.error(`\n[LANGUAGE ENFORCEMENT FAILED - ATTEMPT ${attempt}]`);
console.error('Full error:');
console.error(languageCheck.error);
console.error('\n');
previousErrors = [languageCheck.error || 'Language enforcement failure'];
continue; // Skip to next attempt
}

console.log('[DEBUG] Language enforcement passed, proceeding to validation...');

// Get largest drop for validation  
const largestDrop = weekOverWeekComparison 
  ? weekOverWeekComparison
      .filter(c => c.direction === 'down')
      .sort((a, b) => a.delta - b.delta)[0]?.behavior
  : undefined;

// STEP 1: Run standard validation first
validationResult = validateWeeklyCoaching(rawOutput, pattern);

// STEP 2: If standard validation passed, run constraint checks
if (validationResult.valid) {
  if (dominantLimiter) {
    const parsed = JSON.parse(rawOutput.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim());
    const tensionLower = parsed.tension.toLowerCase();
    const focusLower = parsed.progression.text.toLowerCase();
    const whyLower = parsed.whyThisMatters.toLowerCase();
    const limiterLower = dominantLimiter.toLowerCase();
    
    let topicDrift = false;
    let driftError = '';
    
    if (limiterLower.includes('nutrition')) {
      const bannedTopics = ['sleep', 'phone', 'hydration', 'protein', 'mindset', 'movement'];
      
      for (const topic of bannedTopics) {
        if (tensionLower.includes(topic)) {
          console.log(`[Coaching] Tension mentions ${topic} but constraint is nutrition`);
          topicDrift = true;
          driftError = `Tension must describe nutrition only, not ${topic}`;
          break;
        }
        if (focusLower.includes(topic)) {
          console.log(`[Coaching] Focus mentions ${topic} but constraint is nutrition`);
          topicDrift = true;
          driftError = `Focus must address nutrition only, not ${topic}`;
          break;
        }
        if (whyLower.includes(topic)) {
          console.log(`[Coaching] Why mentions ${topic} but constraint is nutrition`);
          topicDrift = true;
          driftError = `Why This Matters must discuss nutrition only, not ${topic}`;
          break;
        }
      }
      
      if (topicDrift) {
        previousErrors = [driftError];
        continue;
      }
      
      const causalityWords = ['because', 'due to', 'leads to', 'creates', 'drives', 'cascades', 'compounds', 'unlocks', 'accelerates'];
      for (const word of causalityWords) {
        if (tensionLower.includes(word)) {
          console.log(`[Coaching] Tension contains explanatory language: ${word}`);
          previousErrors = ['Tension must describe the constraint, not explain why it exists'];
          continue;
        }
      }
    }
  }
  
  console.log(`[Coaching] Validation passed on attempt ${attempt}`);
  break;
}

// STEP 3: If validation failed, store errors for retry
previousErrors = validationResult.errors.map(e => `[${e.rule}] ${e.message}`);
console.log(`[Coaching] Validation failed on attempt ${attempt}:`, 
  getErrorSummary(validationResult.errors));

      } catch (error) {
        console.error(`[Coaching] Error on attempt ${attempt}:`, error);
        if (attempt === maxAttempts) {
          throw error;
        }
      }
    }

    // Check if validation succeeded
    if (!validationResult || !validationResult.valid) {
      // Store rejection
      const summaryRecord: WeeklySummaryRecord = {
        weekId: pattern.weekId,
        patternType: pattern.primaryPattern,
        canCoach: true,
        skipReason: null,
        evidencePoints: pattern.evidencePoints,
        modelVersion: MODEL_VERSION,
        status: 'rejected',
        rejectionReason: validationResult ? getErrorSummary(validationResult.errors) : 'Unknown error',
        rawOutput,
        generatedAt: Timestamp.now(),
        daysAnalyzed: pattern.daysAnalyzed,
        realCheckInsThisWeek: pattern.realCheckInsThisWeek,
        totalLifetimeCheckIns: pattern.totalLifetimeCheckIns
      };

      await storeWeeklySummary(email, summaryRecord);

      console.log(`[Coaching] Rejected after ${maxAttempts} attempts`);

      return NextResponse.json<GenerateWeeklyCoachingResponse>({
        success: false,
        error: 'Validation failed after retry',
        validationErrors: validationResult?.errors
      }, { status: 422 });
    }

    // Store success
    const summaryRecord: WeeklySummaryRecord = {
      weekId: pattern.weekId,
      patternType: pattern.primaryPattern,
      canCoach: true,
      skipReason: null,
      evidencePoints: pattern.evidencePoints,
      modelVersion: MODEL_VERSION,
      status: 'generated',
      coaching: validationResult.coaching!,
      generatedAt: Timestamp.now(),
      daysAnalyzed: pattern.daysAnalyzed,
      realCheckInsThisWeek: pattern.realCheckInsThisWeek,
      totalLifetimeCheckIns: pattern.totalLifetimeCheckIns
    };

    await storeWeeklySummary(email, summaryRecord);

    console.log(`[Coaching] Success: Generated and stored`);

    return NextResponse.json<GenerateWeeklyCoachingResponse>({
      success: true,
      summary: summaryRecord
    });

  } catch (error) {
    console.error('[Coaching] Unexpected error:', error);
    return NextResponse.json<GenerateWeeklyCoachingResponse>(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// NOTES EXTRACTION
// ============================================================================

/**
 * Extract user notes from check-ins for a given week
 * Returns notes from real check-ins only (excludes gap-fill docs)
 */
async function extractUserNotes(email: string, pattern: WeeklyPattern): Promise<string[]> {
  try {
    const { start, end } = pattern.dateRange;
    const notes: string[] = [];
    
    // Query momentum docs in pattern's exact date range
    const momentumRef = collection(db, 'users', email, 'momentum');
    const q = query(
      momentumRef,
      where('date', '>=', start),
      where('date', '<=', end),
      where('checkinType', '==', 'real'),
      orderBy('date', 'asc')
    );
    
    const snapshot = await getDocs(q);
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.note && data.note.trim().length > 0) {
        notes.push(data.note.trim());
      }
    });
    
    console.log(`[Coaching] Found ${notes.length} user notes for ${start} to ${end}`);
    return notes;
    
  } catch (error) {
    console.error('[Coaching] Error extracting notes:', error);
    return [];
  }
}

// ============================================================================
// FIRESTORE STORAGE
// ============================================================================

async function storeWeeklySummary(
  email: string,
  summary: WeeklySummaryRecord
): Promise<void> {
  const summaryRef = doc(db, 'users', email, 'weeklySummaries', summary.weekId);
  await setDoc(summaryRef, summary);
  console.log(`[Coaching] Stored summary: users/${email}/weeklySummaries/${summary.weekId}`);
}