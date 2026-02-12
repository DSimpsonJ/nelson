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
import { deriveWeeklyConstraintsFromPattern, WeeklyConstraintSnapshot } from '@/app/services/deriveWeeklyConstraints';
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
import { getPreviousWeekCalibration } from '@/app/services/weeklyCalibration';
import { checkLanguageBeforeValidation } from '@/app/services/languageEnforcement';
import { detectDayOfWeekPatterns, DayOfWeekAnalysis } from '@/app/services/detectDayOfWeekPatterns';
import { buildScopedSystemPrompt } from '@/app/services/buildScopedSystemPrompt';
import { validateConstraintAlignment } from '@/app/services/validateConstraintAlignment';
import { detectCelebrations, CelebrationResult } from '@/app/services/celebrationTriggers';

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
let celebrationResult: CelebrationResult | undefined;
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
  
  celebrationResult = detectCelebrations(
    weekData as Array<{ behaviorGrades: Array<{ name: string; grade: number }> }>
  );
  if (celebrationResult.hasCelebrations) {
    console.log('[Coaching] Celebrations detected:',
      celebrationResult.celebrations.map(c => `${c.behavior} (tier ${c.tier}: ${c.tierLabel}, ${c.average}%)`).join(', ')
    );
  }
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

// Build acknowledgment from celebration result
const performanceAcknowledgment = celebrationResult ? celebrationResult.promptText : '';

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
 // Build SCOPED prompt (data filtered to constraint behavior only)
 const constraints = PATTERN_CONSTRAINTS[pattern.primaryPattern];

 const systemPrompt = await buildScopedSystemPrompt({
   email,
   pattern,
   weeklyConstraints: await deriveWeeklyConstraintsFromPattern(email, pattern),
   performanceAcknowledgment,
   progressionType: progressionResult.type,
   progressionReason: progressionResult.reason,
   dominantLimiter: dominantLimiter || 'nutrition',
   dayPatterns: dayOfWeekPatterns,
   weekOverWeekChanges: weekOverWeekComparison,
   userNotes: userNotes.length > 0 ? userNotes : undefined,
   previousErrors: previousErrors.length > 0 ? previousErrors : undefined,
   patternConstraints: constraints,
 });

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
         ? 'Generate coaching for this week. Respond with ONLY the JSON object.'
         : 'Previous output was rejected. Fix the issues listed above. Respond with ONLY the JSON object.'
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

 // ============================================================
 // VALIDATION ORDER: Constraint → Language → Structure
 // ============================================================

 // STEP 1: CONSTRAINT ALIGNMENT (runs FIRST, fails FAST)
 if (dominantLimiter && dominantLimiter !== 'progression') {
   const constraintCheck = validateConstraintAlignment(rawOutput, dominantLimiter);

   if (!constraintCheck.passed) {
     console.log(`[Coaching] CONSTRAINT DRIFT on attempt ${attempt}: ${constraintCheck.error}`);
     previousErrors = [constraintCheck.error];
     continue; // Retry immediately
   }
   console.log('[Coaching] Constraint alignment: PASSED');
 }

 // STEP 2: LANGUAGE ENFORCEMENT
 const languageCheck = checkLanguageBeforeValidation(
   rawOutput,
   performance.solidWeek,
   performance.eliteWeek
 );

 if (!languageCheck.passed) {
   console.log(`[Coaching] LANGUAGE ENFORCEMENT failed on attempt ${attempt}`);
   previousErrors = [languageCheck.error || 'Language enforcement failure'];
   continue;
 }
 console.log('[Coaching] Language enforcement: PASSED');

 // STEP 3: STRUCTURAL VALIDATION
 validationResult = validateWeeklyCoaching(rawOutput, pattern);

 if (!validationResult.valid) {
   previousErrors = validationResult.errors.map(e => `[${e.rule}] ${e.message}`);
   console.log(`[Coaching] STRUCTURAL validation failed on attempt ${attempt}:`,
     getErrorSummary(validationResult.errors));
   continue;
 }

 // ALL CHECKS PASSED
 console.log(`[Coaching] All validation passed on attempt ${attempt}`);
 break;

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