/**
 * deriveProgressionType.ts
 * 
 * Deterministic logic for weekly progression type selection.
 * Returns ADVANCE, STABILIZE, or SIMPLIFY based on numeric thresholds.
 * 
 * Philosophy:
 * - ADVANCE: Progressive overload on established patterns (earned through consistency)
 * - STABILIZE: Consolidation phase (time-boxed after changes)
 * - SIMPLIFY: Strategic retreat (load management, not failure)
 * 
 * Priority hierarchy:
 * 1. SIMPLIFY (safety override)
 * 2. STABILIZE (cooldown)
 * 3. ADVANCE (default forward push)
 * 
 * Movement Gate (Critical):
 * - Movement is the applied force in Nelson's physics system
 * - Without exercise, momentum cannot increase - only maintain or decline
 * - Progression recommendations must respect this gate
 * - ADVANCE should prioritize movement consistency before other behavior increases
 */

import { WeeklyPattern } from '@/app/types/weeklyCoaching';

// ============================================================================
// TYPES
// ============================================================================

export type ProgressionType = 'advance' | 'stabilize' | 'simplify';

export interface ProgressionResult {
    type: ProgressionType;
    reason: string;
    triggers: string[];
    metadata?: {
      movementDays?: number;
      previousMovementDays?: number;
      momentumChange?: number;
      offRatingCount?: number;
      behaviorAverages?: Record<string, number>;
    };
  }

export interface BehaviorData {
  name: string;
  grade: number; // 0 (Off), 50 (Not Great), 80 (Solid), 100 (Elite)
}

export interface DayData {
  date: string;
  checkinType: 'real' | 'gap_fill';
  exerciseCompleted: boolean; // Binary gate: did you do ANY exercise?
  behaviorGrades: BehaviorData[]; // Includes 'movement' grade (0/50/80/100) = HOW WELL
  momentumScore: number;
  dailyScore: number;
  gapResolved?: boolean;
}

/**
 * CRITICAL: Exercise tracking has TWO separate concepts
 * 
 * 1. exerciseCompleted (boolean) - Binary gate for momentum
 *    - Did you do ANY dedicated exercise today? Yes or No
 *    - This is the "applied force" that allows momentum to increase
 *    - Without this = true, momentum can only maintain or decline
 *    - Asked as first question in check-in: "Did you complete your X minute exercise commitment?"
 * 
 * 2. behaviorGrades.movement (0/50/80/100) - BONUS ACTIVITY (NEAT) rating
 *    - Tracks incidental movement: stairs, parking far away, walking during day, etc.
 *    - Off (0): Sedentary beyond exercise
 *    - Not Great (50): Some activity, minimal steps
 *    - Solid (80): Consistent bonus movement
 *    - Elite (100): High NEAT day (10k+ steps)
 *    - Asked during check-in: "Did you look for extra movement opportunities yesterday?"
 *    - COUNTS FOR PROGRESSION (unlike mindset which is signal only)
 * 
 * The 6 behaviors that count for progression:
 * 1. nutrition_pattern
 * 2. energy_balance
 * 3. protein
 * 4. hydration
 * 5. sleep
 * 6. movement (bonus activity/NEAT)
 * 
 * Mindset is tracked but does NOT count for progression - it's a status check only.
 * 
 * For progression logic:
 * - Count "exercise days" using exerciseCompleted boolean (5 days = 5 true values)
 * - Evaluate "bonus activity" using behaviorGrades.movement average (80%+ = consistent NEAT)
 * - Ignore mindset entirely for progression decisions
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const BEHAVIOR_NAMES = {
  NUTRITION_PATTERN: 'nutrition_pattern',
  ENERGY_BALANCE: 'energy_balance',
  PROTEIN: 'protein',
  HYDRATION: 'hydration',
  SLEEP: 'sleep',
  MINDSET: 'mindset',
  MOVEMENT: 'movement'
} as const;

const FOUNDATION_BEHAVIORS = [
  BEHAVIOR_NAMES.SLEEP,
  BEHAVIOR_NAMES.NUTRITION_PATTERN,
  BEHAVIOR_NAMES.HYDRATION
];

// Behaviors that count for progression (mindset excluded - signal only)
const PROGRESSION_BEHAVIORS = [
  BEHAVIOR_NAMES.NUTRITION_PATTERN,
  BEHAVIOR_NAMES.ENERGY_BALANCE,
  BEHAVIOR_NAMES.PROTEIN,
  BEHAVIOR_NAMES.HYDRATION,
  BEHAVIOR_NAMES.SLEEP,
  BEHAVIOR_NAMES.MOVEMENT // Bonus Activity (NEAT)
];

const THRESHOLDS = {
  SOLID: 80,
  NOT_GREAT: 50,
  OFF: 0,
  
  // SIMPLIFY triggers
  MAX_OFF_RATINGS_PER_WEEK: 3,
  MOMENTUM_DECLINE_THRESHOLD: 15,
  FOUNDATION_BEHAVIOR_FLOOR: 50,
  MOVEMENT_DROP_THRESHOLD: 3, // dropped below 3 days
  
  // ADVANCE triggers
  ADVANCE_BEHAVIOR_AVERAGE: 80, // Solid+
  ADVANCE_DAYS_REQUIRED: 14,
  MOVEMENT_CONSISTENCY_WEEKS: 2,
  MOVEMENT_ADVANCE_THRESHOLD: 5, // 5+ days for 2 weeks
  CROSS_BEHAVIOR_SOLID_COUNT: 5, // 5+ behaviors must be Solid+
  
  // STABILIZE triggers
  BEHAVIOR_JUMP_THRESHOLD: 15, // percentage point increase week-over-week
  STABILIZE_DURATION_DAYS: 7,
  STABILIZE_EXIT_SOLID_DAYS: 5
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate average grade for a specific behavior over date range
 */
function calculateBehaviorAverage(
  weekData: DayData[],
  behaviorKey: string
): number {
  const grades = weekData
    .map(day => {
      const behavior = day.behaviorGrades?.find(b => b.name === behaviorKey);
      return behavior?.grade ?? null;
    })
    .filter((g): g is number => g !== null);
  
  if (grades.length === 0) return 0;
  
  return grades.reduce((sum, g) => sum + g, 0) / grades.length;
}

/**
 * Count Off (0) ratings across all behaviors for the week
 */
function countOffRatings(weekData: DayData[]): number {
  let count = 0;
  
  for (const day of weekData) {
    for (const behavior of day.behaviorGrades || []) {
      if (behavior.grade === THRESHOLDS.OFF) {
        count++;
      }
    }
  }
  
  return count;
}

/**
 * Check if a specific behavior has ANY Off (0) ratings in the period
 */
function hasOffRating(
  weekData: DayData[],
  behaviorKey: string
): boolean {
  for (const day of weekData) {
    const behavior = day.behaviorGrades?.find(b => b.name === behaviorKey);
    if (behavior && behavior.grade === THRESHOLDS.OFF) {
      return true;
    }
  }
  return false;
}

/**
 * Count exercise days (exerciseCompleted = true) in the week
 * Exercise is binary: you either did your commitment or you didn't
 * The behaviorGrades.movement field is about bonus activity (NEAT), not exercise
 */
function countMovementDays(weekData: DayData[]): number {
  let count = 0;
  
  for (const day of weekData) {
    if (day.exerciseCompleted === true) {
      count++;
    }
  }
  
  return count;
}

/**
 * Calculate momentum change week-over-week
 */
function calculateMomentumChange(
  currentWeek: DayData[],
  previousWeek: DayData[]
): number {
  const currentMomentum = currentWeek[currentWeek.length - 1]?.momentumScore ?? 0;
  const previousMomentum = previousWeek[previousWeek.length - 1]?.momentumScore ?? 0;
  
  return currentMomentum - previousMomentum;
}

/**
 * Calculate behavior averages for all 7 behaviors
 */
function calculateAllBehaviorAverages(
  weekData: DayData[]
): Record<string, number> {
  return {
    [BEHAVIOR_NAMES.NUTRITION_PATTERN]: calculateBehaviorAverage(weekData, BEHAVIOR_NAMES.NUTRITION_PATTERN),
    [BEHAVIOR_NAMES.ENERGY_BALANCE]: calculateBehaviorAverage(weekData, BEHAVIOR_NAMES.ENERGY_BALANCE),
    [BEHAVIOR_NAMES.PROTEIN]: calculateBehaviorAverage(weekData, BEHAVIOR_NAMES.PROTEIN),
    [BEHAVIOR_NAMES.HYDRATION]: calculateBehaviorAverage(weekData, BEHAVIOR_NAMES.HYDRATION),
    [BEHAVIOR_NAMES.SLEEP]: calculateBehaviorAverage(weekData, BEHAVIOR_NAMES.SLEEP),
    [BEHAVIOR_NAMES.MINDSET]: calculateBehaviorAverage(weekData, BEHAVIOR_NAMES.MINDSET),
    [BEHAVIOR_NAMES.MOVEMENT]: calculateBehaviorAverage(weekData, BEHAVIOR_NAMES.MOVEMENT)
  };
}

/**
 * Check if behavior jumped significantly week-over-week
 */
function detectBehaviorJump(
  currentWeek: DayData[],
  previousWeek: DayData[],
  behaviorKey: string
): boolean {
  const currentAvg = calculateBehaviorAverage(currentWeek, behaviorKey);
  const previousAvg = calculateBehaviorAverage(previousWeek, behaviorKey);
  
  const change = currentAvg - previousAvg;
  return change >= THRESHOLDS.BEHAVIOR_JUMP_THRESHOLD;
}

// ============================================================================
// SIMPLIFY CHECKS
// ============================================================================

function checkSimplifyTriggers(
  currentWeek: DayData[],
  previousWeek: DayData[],
  behaviorAverages: Record<string, number>
): { triggered: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Trigger 1: ≥3 Off ratings in the week
  const offCount = countOffRatings(currentWeek);
  if (offCount >= THRESHOLDS.MAX_OFF_RATINGS_PER_WEEK) {
    reasons.push(`${offCount} Off ratings this week (threshold: ${THRESHOLDS.MAX_OFF_RATINGS_PER_WEEK})`);
  }
  
  // Trigger 2: Momentum decline ≥15 points
  const momentumChange = calculateMomentumChange(currentWeek, previousWeek);
  if (momentumChange <= -THRESHOLDS.MOMENTUM_DECLINE_THRESHOLD) {
    reasons.push(`Momentum declined ${Math.abs(momentumChange).toFixed(1)} points (threshold: ${THRESHOLDS.MOMENTUM_DECLINE_THRESHOLD})`);
  }
  
  // Trigger 3: Any foundation behavior averaging <50% for the week
  for (const behaviorKey of FOUNDATION_BEHAVIORS) {
    const avg = behaviorAverages[behaviorKey];
    if (avg < THRESHOLDS.FOUNDATION_BEHAVIOR_FLOOR) {
      reasons.push(`${behaviorKey} averaged ${avg.toFixed(0)}% (floor: ${THRESHOLDS.FOUNDATION_BEHAVIOR_FLOOR}%)`);
    }
  }
  
  // Trigger 4: Movement dropped from 5+ days to <3 days
  const currentMovementDays = countMovementDays(currentWeek);
  const previousMovementDays = countMovementDays(previousWeek);
  
  if (
    previousMovementDays >= THRESHOLDS.MOVEMENT_ADVANCE_THRESHOLD &&
    currentMovementDays < THRESHOLDS.MOVEMENT_DROP_THRESHOLD
  ) {
    reasons.push(`Movement dropped from ${previousMovementDays} to ${currentMovementDays} days`);
  }
  
  return {
    triggered: reasons.length > 0,
    reasons
  };
}

// ============================================================================
// STABILIZE CHECKS
// ============================================================================

function checkStabilizeTriggers(
  currentWeek: DayData[],
  previousWeek: DayData[]
): { triggered: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Trigger 1: Movement commitment increased
  // (This requires checking user profile data - movement commitment level)
  // For now, we detect movement jump as proxy
  const currentMovementDays = countMovementDays(currentWeek);
  const previousMovementDays = countMovementDays(previousWeek);
  
  if (
    currentMovementDays >= previousMovementDays + 2 &&
    currentMovementDays >= THRESHOLDS.MOVEMENT_ADVANCE_THRESHOLD
  ) {
    reasons.push(`Movement increased from ${previousMovementDays} to ${currentMovementDays} days (likely level-up)`);
  }
  
  // Trigger 2: Any behavior jumped >15 percentage points
  const behaviorKeys = Object.values(BEHAVIOR_NAMES);
  
  for (const behaviorKey of behaviorKeys) {
    if (detectBehaviorJump(currentWeek, previousWeek, behaviorKey)) {
      const currentAvg = calculateBehaviorAverage(currentWeek, behaviorKey);
      const previousAvg = calculateBehaviorAverage(previousWeek, behaviorKey);
      const change = currentAvg - previousAvg;
      
      reasons.push(`${behaviorKey} jumped ${change.toFixed(0)} points (${previousAvg.toFixed(0)}% → ${currentAvg.toFixed(0)}%)`);
    }
  }
  
  return {
    triggered: reasons.length > 0,
    reasons
  };
}

// ============================================================================
// ADVANCE CHECKS
// ============================================================================

function checkAdvanceTriggers(
  currentWeek: DayData[],
  previousWeek: DayData[],
  behaviorAverages: Record<string, number>
): { triggered: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // PRIORITY 1: Exercise days (binary gate - did exercise yes/no)
  // 5+ days for 2 consecutive weeks = earned level-up
  const currentMovementDays = countMovementDays(currentWeek);
  const previousMovementDays = countMovementDays(previousWeek);
  
  if (
    currentMovementDays >= THRESHOLDS.MOVEMENT_ADVANCE_THRESHOLD &&
    previousMovementDays >= THRESHOLDS.MOVEMENT_ADVANCE_THRESHOLD
  ) {
    reasons.push(`Exercised ${currentMovementDays} days this week, ${previousMovementDays} days last week (earned level-up)`);
  }
  
  // PRIORITY 2: All progression behaviors averaging ≥80% (Solid) with no Off ratings
  // Includes bonus activity, excludes mindset (signal only)
  const twoWeekData = [...previousWeek, ...currentWeek];
  
  for (const behaviorKey of PROGRESSION_BEHAVIORS) {
    const currentAvg = behaviorAverages[behaviorKey];
    
    if (currentAvg >= THRESHOLDS.ADVANCE_BEHAVIOR_AVERAGE) {
      const hasOff = hasOffRating(twoWeekData, behaviorKey);
      
      if (!hasOff) {
        reasons.push(`${behaviorKey} averaged ${currentAvg.toFixed(0)}% with no Off ratings (ready to increase)`);
      }
    }
  }
  
  // PRIORITY 3: Strong foundation (5+ behaviors Solid+) with exercise consistency
  // Count only progression behaviors (excludes mindset)
  const solidBehaviors = PROGRESSION_BEHAVIORS.filter(
    key => behaviorAverages[key] >= THRESHOLDS.SOLID
  );
  
  const exerciseDaysConsistent = currentMovementDays >= 4; // At least 4 days of exercise
  
  if (
    solidBehaviors.length >= THRESHOLDS.CROSS_BEHAVIOR_SOLID_COUNT &&
    exerciseDaysConsistent // Exercise day gate requirement
  ) {
    const allBehaviorsHaveNoLongOffStreak = PROGRESSION_BEHAVIORS.every(
      behaviorKey => !hasOffRating(currentWeek, behaviorKey)
    );
    
    if (allBehaviorsHaveNoLongOffStreak) {
      reasons.push(`${solidBehaviors.length} behaviors averaging Solid+ with ${currentMovementDays} exercise days (foundation ready for increase)`);
    }
  }
  
  return {
    triggered: reasons.length > 0,
    reasons
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Derive progression type based on weekly behavioral data
 * 
 * Priority hierarchy:
 * 1. SIMPLIFY (safety override)
 * 2. STABILIZE (cooldown)
 * 3. ADVANCE (default forward push)
 */
export function deriveProgressionType(
  currentWeek: DayData[],
  previousWeek: DayData[]
): ProgressionResult {
  // Calculate all behavior averages for current week
  const behaviorAverages = calculateAllBehaviorAverages(currentWeek);
  
  // Gather metadata for debugging
  const metadata = {
    movementDays: countMovementDays(currentWeek),
    previousMovementDays: countMovementDays(previousWeek),
    momentumChange: calculateMomentumChange(currentWeek, previousWeek),
    offRatingCount: countOffRatings(currentWeek),
    behaviorAverages
  };
  
  const allTriggers: string[] = [];
  
  // Check SIMPLIFY (priority 1)
  const simplifyCheck = checkSimplifyTriggers(currentWeek, previousWeek, behaviorAverages);
  if (simplifyCheck.triggered) {
    return {
      type: 'simplify',
      reason: simplifyCheck.reasons[0], // Primary reason
      triggers: simplifyCheck.reasons,
      metadata
    };
  }
  allTriggers.push(...simplifyCheck.reasons.map(r => `[SIMPLIFY not triggered] ${r}`));
  
  // Check STABILIZE (priority 2)
  const stabilizeCheck = checkStabilizeTriggers(currentWeek, previousWeek);
  if (stabilizeCheck.triggered) {
    return {
      type: 'stabilize',
      reason: stabilizeCheck.reasons[0],
      triggers: stabilizeCheck.reasons,
      metadata
    };
  }
  allTriggers.push(...stabilizeCheck.reasons.map(r => `[STABILIZE not triggered] ${r}`));
  
  // Check ADVANCE (priority 3 - default)
  const advanceCheck = checkAdvanceTriggers(currentWeek, previousWeek, behaviorAverages);
  if (advanceCheck.triggered) {
    return {
      type: 'advance',
      reason: advanceCheck.reasons[0],
      triggers: advanceCheck.reasons,
      metadata
    };
  }
  allTriggers.push(...advanceCheck.reasons.map(r => `[ADVANCE not triggered] ${r}`));
  
  // Default fallback: ADVANCE with generic reason
  // (This should rarely happen - most weeks should trigger something)
  return {
    type: 'advance',
    reason: 'Maintain forward momentum with current approach',
    triggers: ['No specific triggers - default ADVANCE'],
    metadata
  };
}