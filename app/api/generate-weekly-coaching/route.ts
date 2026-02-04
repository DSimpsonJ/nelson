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
import { deriveUserConstraints, formatConstraintsForPrompt } from '@/app/services/deriveUserConstraints';
import { deriveWeeklyConstraintsFromPattern, deriveWeeklyConstraints, formatWeeklyConstraintsForPrompt } from '@/app/services/deriveWeeklyConstraints';
import { getOrCreateVulnerabilityMap, formatVulnerabilityForPrompt } from '@/app/services/vulnerabilityMap';
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
const currentContext = formatWeeklyConstraintsForPrompt(weeklyConstraints);
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
  
  ${previousErrors && previousErrors.length > 0 ? `
âš ï¸ VALIDATION ERRORS FROM PREVIOUS ATTEMPT:
${previousErrors.map(err => `- ${err}`).join('\n')}

Your previous output was rejected. Please correct these specific violations and regenerate.
` : ''}

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

CRITICAL: DATA IS TRUTH, NOTES ARE CONTEXT

Users often worry about things that aren't actually constraints. Your job is to coach on DATA, not fears.

DECISION TREE:
1. Identify the constraint from behavioral averages (sleep 54% = constraint, nutrition 81% = solid)
2. Check if ANY notes connect to the actual constraint
3. If yes → integrate those notes to explain the constraint
4. If no → ignore all notes and coach on the data

WHEN TO IGNORE NOTES ENTIRELY:
- Note mentions specific food (ice cream, pizza) BUT nutrition averaged 80+% → Ignore food mention completely
- Note says "I need to exercise more" BUT movement is 6/7 days → Ignore, that's not the problem
- Note says "sleep was bad" BUT sleep averaged 85%+ → Ignore, that's perception not reality
- ANY time a note complains about something the data shows is actually solid

WHEN TO USE NOTES:
- Sleep 54%, note: "morning routine felt rushed" → YES, explains mechanism
- Sleep 54%, note: "energy was low but stayed consistent" → YES, shows impact
- Nutrition 45%, note: "ate ice cream every night" → YES, aligns with data
- ANY time a note explains or deepens what the data already shows

WHERE TO USE NOTES:
- Pattern: Can reference notes briefly if they reveal the pattern
- Tension: PRIMARY location for note integration - use notes to explain the mechanism
- Why This Matters: DO NOT mention notes - focus on stakes and consequences only

IF ALL NOTES CONTRADICT THE DATA:
Proceed as if no notes exist. Do not mention the notes. Coach on the actual constraint shown in behavioral averages.

SPECIFIC FOOD MENTION RULE:
If user mentions a specific food AND that category is 80+%, you MUST acknowledge the disconnect:
"Your notes mention ice cream, but nutrition averaged 81% this week - solid performance. The constraint isn't food choices."
Then coach on the ACTUAL constraint (sleep, consistency, etc).
` : `
No notes provided this week.

This is normal and expected. Do NOT say "context is inferred from behavior alone."
Instead, if the pattern suggests disruption, acknowledge the absence:
"There's no note explaining the weekend dip, but the timing and sleep variance suggest schedule or social disruption rather than loss of intent."

Make the absence of notes informative, not a limitation.
`}

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

# OUTPUT STRUCTURE (REQUIRED)

Target length: 200-300 words total. No character limits per section.

Respond with valid JSON in this exact structure:

{
  "pattern": "string",
  "tension": "string",
  "whyThisMatters": "string",
  "focus": {
    "text": "string",
    "type": "protect" | "hold" | "narrow" | "ignore"
  }
}

OUTPUT STRUCTURE:

LEAD WITH DATA, NOT NARRATIVE (CRITICAL):
Pattern MUST show actual behavioral averages, not just narrative from notes.

REQUIRED DATA IN PATTERN:
- Mention at least 2 behavioral category averages with percentages
  Examples: "Nutrition averaged 73%", "Sleep held at 76%", "Hydration struggled at 67%"
- Show the pattern in the numbers: "mid-week dip then Elite finish", "steady all week", "inconsistent 50-80 range"
- ONLY AFTER stating data → reference notes to explain WHY
- Format: Data (what happened) → Pattern (how it unfolded) → Notes (why)

EXAMPLES OF CORRECT DATA USAGE:
✅ "Nutrition averaged 73% with a mid-week dip (50s on 3 consecutive days) before rebounding to Elite. Your vacation note explains the pattern."
✅ "Sleep held steady at 76% after a rocky start, while hydration struggled at 67% through the same mid-week stretch."
❌ "Your notes reveal vacation eating created a disconnect" (no data, just narrative)
❌ "Momentum is holding steady despite consistent effort" (vague, no specific averages)

## ACKNOWLEDGMENT + PATTERN (Combined: 2-3 sentences)

First sentence: Call out the standout win.
- If Elite performance exists (grade 100 all 7 days), name it specifically
- If no Elite, acknowledge best consistency or improvement

Second sentence: Show the behavioral data with specific averages.
- Check-ins completed, exercise days, momentum score
- At least 2 behavioral category averages (Nutrition X%, Sleep Y%, Hydration Z%)
- Show the pattern: "mid-week dip", "steady all week", "improving trajectory"

Third sentence: Introduce the contrast or constraint.
- Reference notes ONLY to explain the data pattern, not replace it
- Elite sleep but flat momentum → nutrition is the gap
- Perfect exercise but low energy → sleep or nutrition issue

Example:
"Mindset stayed solid at 80% all week, supporting consistency. Nutrition averaged 73% with mid-week struggle (50s for 3 days) before rebounding to Elite, while hydration dipped to 67% through the same stretch. Your notes about vacation eating explain the mid-week pattern."

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

ALLOWED:
✅ "You exercised every day this week"
✅ "Exercise stayed consistent all 7 days"
✅ "Momentum held at 71% despite disruption"
✅ "Nutrition averaged 73%", "Sleep held at 76%"

FORBIDDEN:
❌ "7/7 days" or "x/x" notation
❌ "This means recovery is limiting you"
❌ "The drop shows you're overreaching"
❌ "Your notes reveal X created a disconnect" (without stating data first)

## 2. THE TENSION (2-3 sentences)

What is actually happening right now.

ROLE: Describe the mechanism creating this constraint in present tense.

REQUIREMENTS:
- Present tense only: "is creating", "is disrupting", "is breaking"
- Use pronouns if Pattern already named specifics: "This constraint" not "Sleep timing"
- Integrate user notes as evidence of HOW the mechanism operates
- Must be specific to THIS user (not generic wellness advice)

FORBIDDEN - OUTCOME LANGUAGE:
❌ "can't", "won't", "unable to", "fails to" + any verb
❌ "preventing", "stopping", "blocking", "holding back"
❌ "keeping you from", "won't translate", "can't overcome"
❌ Any phrase about what this stops or enables (that's Why This Matters)

REQUIRED - MECHANISM LANGUAGE:
✅ "is creating a recovery debt that accumulates with each session"
✅ "is disrupting the adaptation cycle"
✅ "breaks the connection between training and recovery"
✅ "operates at inconsistent timing"

ANTI-REDUNDANCY:
- Don't repeat specific nouns from Pattern (use pronouns instead)
- Each section introduces NEW information

EXAMPLES:
✅ "Inconsistent sleep is creating a recovery debt that accumulates faster than your body clears it. Your notes about rushed mornings and low energy reveal the timing disruption."
✅ "This pattern breaks the connection between nutrition timing and energy availability. Evening choices create morning deficits that cascade through the day."

❌ "Sleep disruption is preventing your body from adapting to the training load" (outcome language)
❌ "This creates a debt that exercise consistency can't overcome" (outcome language)

TEST: Does this sentence describe WHAT'S HAPPENING or WHAT IT PREVENTS? If the latter, rewrite.

## 3. WHY THIS MATTERS (4-5 sentences)

Why THIS constraint matters for YOU specifically.

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
❌ Re-explaining the ice cream pattern
❌ "You're doing X consistently" (already stated in Pattern)
❌ "The constraint is Y" (already stated in Tension)
❌ Re-describing the mechanism
❌ "Moderate vulnerability zone" or technical backend language
❌ Mentioning or referencing user notes (notes explain mechanism, this section is about stakes)

ANTI-REDUNDANCY:
- If you used specific phrases in Pattern or Tension (ice cream, evening nutrition, sleep timing),
  do NOT repeat them verbatim here
- Reference indirectly: "If this stays unresolved", "Address it", "This one pattern"
- Focus on consequence and unlock, not re-explaining the mechanism

STAKES-ONLY RULE (CRITICAL):
Why This Matters describes CONSEQUENCES and UNLOCKS, NOT how the constraint operates.
FORBIDDEN MECHANISM WORDS:
- "bottleneck", "leak", "debt", "acting as", "creating", "undermining", "disrupting"
- Any description of HOW the constraint works (that's Tension's job)
REQUIRED FOCUS:
- What happens if unresolved (momentum stays flat, progress stalls)
- What unlocks if addressed (acceleration, compounding, visible results)
- Why THIS user specifically (not generic wellness advice)
TEST: If the sentence could fit in Tension, it doesn't belong here.

REQUIRED PHRASING:
âœ… "If this stays unresolved, [specific consequence]"
âœ… "If you address it, [specific unlock]"
âœ… "This one pattern is holding back [specific thing]"
âœ… Instead of "moderate vulnerability": just state why it matters for their goal

EXAMPLES:
âœ… "Address evening nutrition and your sleep and exercise finally compound into visible progress. Your recovery capacity isn't the constraint - nutrition is. That makes this simple: fix this one pattern and everything else you're doing pays off."
âœ… "Your 6-day exercise rhythm is ready to produce results. The only thing holding it back is this nutrition pattern. Fix it, and momentum accelerates instead of maintaining. You're not stuck because of effort or capacity - just this one constraint."

LITMUS TEST: Could I delete "Tension" and still feel the stakes? If NO, this section failed.

## 4. WEEKLY FOCUS (1-2 sentences)

The lever that addresses the tension.

REQUIREMENTS:
- Must be one of: PROTECT / HOLD / NARROW / IGNORE
${allowedFocusTypes.length < 4 ? `- âš ï¸ CALIBRATION CONSTRAINT: Based on last week's answers, you MUST use one of: ${allowedFocusTypes.join(' OR ')}. Other options are FORBIDDEN and will cause validation failure.` : ''}
- Directly addresses the tension identified above
- States what NOT to change, add, or optimize
- No action lists, no hedging

Examples:
âœ… "Protect your current exercise rhythm. Do not add behaviors or change your approach while sleep stabilizes."
âœ… "Hold exercise steady at 6/7 days. The constraint is sleep timing, not effort volume."
âœ… "Narrow focus to evening sleep prep only. Ignore momentum fluctuations as signals to change strategy."

âŒ "Try to sleep more and keep exercising." (action list)
âŒ "Consider focusing on recovery this week." (hedging)

FORBIDDEN IN FOCUS (will cause validation rejection):
- "system", "your system", "the system"
- "pattern", "this pattern", "the pattern"
- "data", "metrics", "score", "momentum score"
- "reflects","indicates", "shows"
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
Instead of "your system":
  âœ… "your body"
  âœ… "you"
  âœ… "your recovery"
  âœ… "what you're doing"

Instead of "suggests" or "signals":
  âœ… "means"
  âœ… "shows"
  âœ… "this is"

Instead of "capacity ceiling":
  âœ… "your limit"
  âœ… "what you can handle"
  âœ… "your recovery capacity"

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

âœ… Pattern section cites at least TWO specific data points
âœ… Tension synthesizes at least TWO context layers (pattern + constraints/vulnerability/notes)
âœ… Tension is specific to this user (would NOT apply to most users)
âœ… If user notes exist, at least ONE is referenced
âœ… If no notes exist, absence is used as signal (not stated as limitation)
âœ… WhyThisMatters explains why this matters MORE for this user
âœ… Focus is PROTECT/HOLD/NARROW/IGNORE (not action list)
âœ… No banned phrases appear anywhere

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
- âœ… Present tense only
- âœ… Describes mechanism, NOT consequence
- âœ… No "unlock" or "would" language
- âŒ Does NOT repeat pattern description
- âŒ Does NOT list what's working

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

const systemPrompt = await buildSystemPrompt(
  email,
  pattern,
  allowedFocusTypes,
  performanceAcknowledgment,
  userNotes.length > 0 ? userNotes : undefined,
  previousErrors.length > 0 ? previousErrors : undefined
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

      // LANGUAGE ENFORCEMENT (runs before validation)
const languageCheck = checkLanguageBeforeValidation(rawOutput);
if (!languageCheck.passed) {
  console.log(`[Coaching] Language enforcement failed on attempt ${attempt}:`, languageCheck.error);
  previousErrors = [languageCheck.error || 'Language enforcement failure'];
  continue; // Skip to next attempt
}

// Validate output
validationResult = validateWeeklyCoaching(rawOutput, pattern);

        if (validationResult.valid) {
          console.log(`[Coaching] Validation passed on attempt ${attempt}`);
          break;
        }

        // Store errors for retry
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