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

${previousErrors && previousErrors.length > 0 ? `
⚠️ VALIDATION ERRORS FROM PREVIOUS ATTEMPT:
${previousErrors.map(err => `- ${err}`).join('\n')}

Your previous output was rejected. Please correct these specific violations and regenerate.
` : ''}

# PRIMARY OBJECTIVE

Your job is to identify the single dominant tension currently limiting this user's momentum.

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

## Current Reality (Last 14 Days) - TRUST THIS OVER ONBOARDING
${currentContext}

CRITICAL: Current reality overrides onboarding assumptions.
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
    focusConstraint = `\n\n⚠️ FOCUS CONSTRAINTS (REQUIRED):\nBased on last week's calibration, you MUST use one of these focus types: ${allowedFocusTypes.join(', ')}\n${allowedFocusTypes.length === 1 ? 'YOU MUST USE THIS FOCUS TYPE. No other options are allowed.' : ''}`;
  }
  
  return calibrationText + focusConstraint;
})()}

## User Notes This Week
${userNotes && userNotes.length > 0 ? `
${userNotes.map((note, i) => `${i + 1}. "${note}"`).join('\n')}

Use at least ONE note to sharpen the Tension or consequence.
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

## 1. THE PATTERN (3-4 sentences)

What happened this week, grounded in data.

REQUIREMENTS:
- Anchor to at least TWO specific numbers from evidence (exact values required, phrasing can vary):
${pattern.evidencePoints.map((e, i) => `  ${i + 1}. "${e}"`).join('\n')}
- Show contrast (effort vs outcome, before vs after, stable vs drifting)
- Use actual numbers from this week
- NO interpretation yet, just orientation
- May include directional observation (momentum up/down, stable/changing) but NOT causality


ALLOWED:
✅ "Momentum held at 71% despite disruption"
✅ "Exercise stayed consistent at 7/7 while sleep dropped to 4/7"

FORBIDDEN:
❌ "This means recovery is limiting you"
❌ "The drop shows you're overreaching"

## 2. THE TENSION (4-5 sentences)

The non-obvious constraint this pattern reveals.

REQUIREMENTS - MUST SYNTHESIZE AT LEAST TWO OF:
1. Pattern data (momentum increase or drop, variance, exercise consistency, nutrition fluctiation, etc.)
2. Vulnerability map (which categories matter most for THIS user)
3. User constraints (age, recovery capacity, time availability, body comp phase)
4. User notes (if available, must reference verbatim or paraphrased)
- Must name a specific risk or consequence (not just describe the pattern)
- Must take a clear stance (not "this could indicate" but "this means")
- Use plain language ("you'll quit" not "adherence may decline")

COUNTERINTUITIVE REQUIREMENT:
The tension must NOT be predictable from the pattern name alone.
- If pattern = plateau, don't just say "don't push harder"
- Identify WHY the plateau is happening for THIS user specifically
- Connect to user notes, constraints, or vulnerability patterns

VALIDATION:
- If this tension could apply to most users → REJECT and regenerate
- Must be specific to THIS user's situation
- Must be non-obvious (not visible on dashboard alone)

VALIDATION KILL-SWITCH:
- If this tension could be written WITHOUT reading user notes or vulnerability map → REJECT and regenerate.
- The tension must require THIS user's specific context to be valid.
❌ "Sleep was low this week." (obvious from dashboard)
❌ "Recovery is important for everyone." (not specific to this user)

## 3. WHY THIS MATTERS FOR YOU (4-6 sentences)

Personalized consequence if this tension is ignored.

ANTI-EXAMPLES (what NOT to write):
❌ "At your age, recovery is important." (generic age reference, no specificity)
❌ "Sleep is critical for fat loss." (true for everyone, not personalized)
❌ "Your body needs time to recover." (obvious, adds no insight)

REQUIREMENTS:
- First sentence states what happens if ignored (with timeline)
- Connect to user's specific vulnerability (high/medium/low categories)
- Reference age/recovery/phase ONLY if it explains why this matters MORE for them
- Must cite at least ONE specific number from this week's data
- Capacity language must be embodied in lived experience
- Every abstract tradeoff must end in a concrete consequence

EMBODIMENT TEST:
❌ "Reduced recovery capacity limits adaptation"
✅ "You won't bounce back between sessions, so fatigue stacks"

❌ "Your system is operating at capacity"
✅ "You're working harder during the day but undoing progress at night"

## 4. WEEKLY FOCUS (1-2 sentences)

The lever that addresses the tension.

REQUIREMENTS:
- Must be one of: PROTECT / HOLD / NARROW / IGNORE
${allowedFocusTypes.length < 4 ? `- ⚠️ CALIBRATION CONSTRAINT: Based on last week's answers, you MUST use one of: ${allowedFocusTypes.join(' OR ')}. Other options are FORBIDDEN and will cause validation failure.` : ''}
- Directly addresses the tension identified above
- States what NOT to change, add, or optimize
- No action lists, no hedging

Examples:
✅ "Protect your current exercise rhythm. Do not add behaviors or change your approach while sleep stabilizes."
✅ "Hold exercise steady at 6/7 days. The constraint is sleep timing, not effort volume."
✅ "Narrow focus to evening sleep prep only. Ignore momentum fluctuations as signals to change strategy."

❌ "Try to sleep more and keep exercising." (action list)
❌ "Consider focusing on recovery this week." (hedging)

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
  ✅ "your body"
  ✅ "you"
  ✅ "your recovery"
  ✅ "what you're doing"

Instead of "suggests" or "signals":
  ✅ "means"
  ✅ "shows"
  ✅ "this is"

Instead of "capacity ceiling":
  ✅ "your limit"
  ✅ "what you can handle"
  ✅ "your recovery capacity"

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

✅ Pattern section cites at least TWO specific data points
✅ Tension synthesizes at least TWO context layers (pattern + constraints/vulnerability/notes)
✅ Tension is specific to this user (would NOT apply to most users)
✅ If user notes exist, at least ONE is referenced
✅ If no notes exist, absence is used as signal (not stated as limitation)
✅ WhyThisMatters explains why this matters MORE for this user
✅ Focus is PROTECT/HOLD/NARROW/IGNORE (not action list)
✅ No banned phrases appear anywhere

FINAL CHECK:
"Did this reframe how the user understands their situation?"
If NO → regenerate with stronger tension identification

# DETECTED PATTERN FOR THIS WEEK

Pattern Type: ${pattern.primaryPattern}

Evidence:
${pattern.evidencePoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}

Week ID: ${pattern.weekId}
Days Analyzed: ${pattern.daysAnalyzed}
Real Check-Ins This Week: ${pattern.realCheckInsThisWeek}

Generate tension-first coaching based on this pattern, user context, and semantic definitions.
Respond with ONLY the JSON object, no markdown code blocks, no preamble.`;
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