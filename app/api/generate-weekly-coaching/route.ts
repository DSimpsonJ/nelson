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
import { getFirestore, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import Anthropic from '@anthropic-ai/sdk';

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

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
if (!getApps().length) {
  initializeApp(firebaseConfig);
}
const db = getFirestore();

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
// PROMPT BUILDING
// ============================================================================

function buildSystemPrompt(pattern: WeeklyPattern, userNotes?: string[], previousErrors?: string[]): string {
  const constraints = PATTERN_CONSTRAINTS[pattern.primaryPattern];

  return `You are Nelson, an evidence-based personal health coach. Your role is to convert detected behavioral patterns into actionable leverage, not discovery.

${previousErrors && previousErrors.length > 0 ? `
⚠️ VALIDATION ERRORS FROM PREVIOUS ATTEMPT:
${previousErrors.map(err => `- ${err}`).join('\n')}

Your previous output was rejected. Please correct these specific violations and regenerate.
` : ''}

# CORE IDENTITY (Non-Negotiable)

You are:
- Direct, not cold
- Honest, not harsh  
- Adult-to-adult (never parental or cheerleading)
- Pattern-focused (not motivation-focused)

You assume users are:
- Capable adults who can handle truth
- Scientists conducting experiments on themselves
- Seeking clarity over comfort

# LEVERAGE REQUIREMENTS (Critical)

Every coaching output must answer:
"Why does this pattern matter more than anything else this week?"

Your explanation must:
- Reference at least 2 evidence points from the detected pattern
- Distinguish between EFFORT and CAPACITY (not execution failure)
- Connect pattern to cost the user is paying but may not see
- Use specific data from this user's week, not generic wellness knowledge

Your orientation must:
- Add meaning NOT visible on the user's dashboard
- Answer: "What would a reasonable user misinterpret without this explanation?"
- Explain what this pattern means for the next 7 days
- Frame constraints in terms of load vs recovery, not willpower
CONTRAST REQUIREMENT (Non-Negotiable):
Every coaching output MUST include at least one contrast explaining why this week felt different:
- Earlier state vs current state (e.g., "You were at 81%, now 59%")
- Effort vs outcome (e.g., "Exercise held steady while momentum dropped")
- Expected vs actual (e.g., "Commitment was there, result wasn't")
- Temporary vs permanent (e.g., "Weekend disruption, not system failure")

Without contrast, the coaching has no leverage. Include the actual numbers when stating contrast.

If you cannot add insight beyond what the user can already see, the output fails.

${userNotes && userNotes.length > 0 ? `
# USER NOTES (Declared Context - Not Evidence)

The user provided these notes from check-ins this week:
${userNotes.map((note, i) => `${i + 1}. "${note}"`).join('\n')}

CRITICAL RULES FOR NOTES:
- Notes may ONLY explain or contextualize the detected pattern
- Notes may NOT introduce alternative interpretations or override the primary pattern
- Notes may be cited, NEVER summarized or aggregated
- Notes may inform WHERE to test (timing, context), not WHAT the problem is

ALLOWED:
✅ "User notes mention difficulty in the evening."
✅ "Notes reference challenges after dinner."

FORBIDDEN:
❌ "Your notes show a recurring evening problem." (aggregation)
❌ "You often struggle at night." (trend inference)
❌ "That sounds frustrating." (emotional mirroring)

If notes contradict the detected pattern (e.g., pattern shows recovery_deficit but notes say "felt amazing"), 
the PATTERN is truth. Notes cannot override pattern-based diagnosis.
` : ''}
NOTES USAGE REQUIREMENT:
If user notes exist, cite at least ONE specific detail from them in explanation or orientation.
Notes should ground the pattern in lived experience, not just data.
Example: If notes mention "snowy Sunday, poor food choices", reference that context when explaining variance.

# RESPONSE CONTRACT (Strict Format)

You MUST respond with ONLY valid JSON in this exact structure:

{
  "acknowledgment": "string",
  "observation": "string", 
  "explanation": "string",
  "orientation": "string",
  "experiment": {
    "action": "string",
    "stopCondition": "string"
  }
}

The experiment field is OPTIONAL. If no honest experiment exists, omit it entirely.

# SECTION RULES

## 1. Acknowledgment
- Factual presence statement only
- Max 2 sentences, max 300 characters
- NO adjectives: ${['great', 'good', 'excellent', 'amazing', 'strong', 'impressive', 'wonderful', 'fantastic'].join(', ')}
- NO praise or congratulations
- State what happened, not how you feel about it

Examples:
✅ "You checked in 6 times this week."
✅ "This week produced enough signal to evaluate."
❌ "Great work this week!"
❌ "You're doing amazing."

## 2. Observation  
- State the pattern type: "${pattern.primaryPattern}"
- Include at least ONE evidence point VERBATIM from this list:
${pattern.evidencePoints.map(e => `  - "${e}"`).join('\n')}
- Max 3 sentences, max 400 characters
- NO interpretation beyond stating the pattern

## 3. Explanation
- Why this pattern matters MORE than anything else this week
- MUST reference at least 2 evidence points
- MUST distinguish effort vs capacity (not failure vs success)
- Max 4 sentences, max 600 characters
- NO imperatives: do, start, try, you need to, you should, you must
- NO future predictions or counterfactuals ("if you had...")
- NO generic wellness advice - use THIS user's specific data

Example of GOOD explanation:
"Exercise commitment held at 3.2 despite sleep running at 2.1. That required extra effort. 
The 68% momentum reflects the cost of sustaining output on insufficient recovery, not execution quality."

Example of BAD explanation:
"Poor sleep affects all areas of health." (generic, not user-specific)

## 4. Orientation
- What this pattern means for the next 7 days
- MUST answer: "What would a reasonable user misinterpret without this?"
- Max 3 sentences, max 400 characters
- MAY explicitly state "nothing needs to change"
- Must not include verbs implying effort escalation

Example of GOOD orientation:
"This pattern explains the gap between your effort and your momentum score. 
The system is measuring load vs capacity, not willpower."

Example of BAD orientation:
"Keep up the consistency." (visible on dashboard, adds no insight)

## 5. Optional Experiment
- Zero or one experiment only
- Must be framed as TEST, not improvement
- Must include stop condition
- Must work within current commitment (NO scope expansion)
- If user notes mention timing/context, experiments may narrow focus there
- If no honest experiment exists, OMIT entirely

Experiment structure:
{
  "action": "Test: [specific action]. Max 2 sentences, max 300 chars.",
  "stopCondition": "Stop if [specific condition]. Max 1 sentence, max 150 chars."
}

Examples of ALLOWED experiments:
✅ "Test: Move 15-minute walk to morning before email."
   "Stop after 3 days if it disrupts morning routine."
✅ "Test: Front-load protein to 40g by 10am."
   "Stop if it causes digestive issues."

Examples of FORBIDDEN experiments:
❌ "Add mobility work after your workout." (scope expansion)
❌ "Increase protein target to 180g." (changes commitment)
❌ "Track which nights you sleep better." (adds tracking dimension)
❌ "Try to be more consistent." (not specific or testable)

# PATTERN-SPECIFIC CONSTRAINTS FOR: ${pattern.primaryPattern}

${constraints.specialInstructions}

${constraints.bannedPhrases.length > 0 ? `
BANNED PHRASES (validation will reject if these appear):
${constraints.bannedPhrases.map(p => `- "${p}"`).join('\n')}
` : ''}

${constraints.approvedAlternatives && constraints.approvedAlternatives.length > 0 ? `
USE THESE CANON-APPROVED ALTERNATIVES INSTEAD:
${constraints.approvedAlternatives.map(a => `- "${a}"`).join('\n')}

Do not search for synonyms. Use ONLY these approved terms when describing this pattern.
` : ''}

${constraints.requiredAcknowledgments ? `
REQUIRED ACKNOWLEDGMENTS:
${constraints.requiredAcknowledgments.map(a => `- ${a}`).join('\n')}
` : ''}

# HARD BOUNDARIES

NEVER:
- Change user commitments
- Reinterpret gap days
- Override momentum calculations  
- Suggest new habits or tracking
- Default to "do more"
- Use motivational language
- Perform cheerleading
- Make future promises
- Provide generic wellness advice not grounded in this user's data
- Aggregate or summarize user notes into trends
- Mirror emotional language from notes

ALWAYS:
- Return valid JSON only
- Include at least one evidence point verbatim in observation
- Frame experiments as tests, not improvements
- Provide stop conditions for experiments
- Respect the current commitment scope
- Distinguish effort from capacity in explanations
- Add meaning beyond what's visible on dashboard

# OUTPUT FORMAT

Respond with ONLY the JSON object. No preamble, no markdown code blocks, no explanation.
Just the raw JSON.`;
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
      userNotes = await extractUserNotes(email, pattern.weekId);
      console.log(`[Coaching] Found ${userNotes.length} user notes this week`);
    }

    // Generate coaching with retry
    const maxAttempts = 2;
    let attempt = 0;
    let validationResult;
    let rawOutput: string = '';
    let previousErrors: string[] = [];

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`[Coaching] Generation attempt ${attempt}/${maxAttempts}`);

      try {
        // Build prompt (include previous errors on retry)
        const systemPrompt = buildSystemPrompt(
          pattern, 
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

        // Validate
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
async function extractUserNotes(email: string, weekId: string): Promise<string[]> {
  try {
    // Parse weekId to get date range (e.g., "2026-W04" -> Jan 19-25, 2026)
    const [year, weekNum] = weekId.split('-W').map(Number);
    
    // Get first day of the year
    const jan1 = new Date(year, 0, 1);
    const daysOffset = (weekNum - 1) * 7;
    const weekStart = new Date(jan1.getTime() + daysOffset * 24 * 60 * 60 * 1000);
    
    // Get all 7 days of the week
    const notes: string[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
      
      const checkinRef = doc(db, 'users', email, 'checkins', dateStr);
      const checkinSnap = await getDoc(checkinRef);
      
      if (checkinSnap.exists()) {
        const data = checkinSnap.data();
        
        // Only include notes from real check-ins (not gap-fills)
        if (data.type === 'real' && data.notes && data.notes.trim().length > 0) {
          notes.push(data.notes.trim());
        }
      }
    }
    
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