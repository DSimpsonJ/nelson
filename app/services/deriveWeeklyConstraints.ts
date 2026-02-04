/**
 * WEEKLY CONSTRAINT SNAPSHOT
 * 
 * Derives current user constraints from behavioral data (last 7-14 days).
 * This OVERRIDES stale onboarding data with current reality.
 * 
 * Philosophy:
 * - No new questions asked (speed is critical)
 * - Infer from behavior patterns, not self-report
 * - Rolling window (last 14 days max)
 * - Snapshot overwrites onboarding, no blending
 * 
 * This is Phase 3B-lite: accurate constraints, not memory.
 */

import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/app/firebase/config";

// ============================================================================
// TYPES
// ============================================================================

export type TimeCapacity = "low" | "moderate" | "high";
export type RecoveryMargin = "ample" | "tight" | "constrained" | "deficit";
export type PhaseSignal = "building" | "holding" | "overreaching" | "disrupted";
export type DominantLimiter = "time" | "recovery" | "nutrition" | "consistency" | "progression";

export interface WeeklyConstraintSnapshot {
  // Derived constraints (current reality)
  timeCapacity: TimeCapacity;
  recoveryMargin: RecoveryMargin;
  phaseSignal: PhaseSignal;
  dominantLimiter: DominantLimiter;
  
  // Supporting evidence
  trainingFrequency: number; // days with exercise this week
  avgBehaviorScore: number; // average of all foundation behaviors
  sleepConsistency: number; // % of days sleep was Solid or Elite
  sleepAverage: number; // average sleep score
  nutritionAverage: number; // average nutrition score (pattern + energy balance)
  proteinAverage: number; // average protein score
  hydrationAverage: number; // average hydration score
  mindsetAverage: number; // average mindset score
  
  // Metadata
  derivedFrom: string; // date range analyzed
  generatedAt: string;
}

interface CheckInData {
  date: string;
  exerciseCompleted: boolean;
  behaviorGrades: Array<{ name: string; grade: number }>;
  momentumScore?: number;
  dailyScore?: number;
}

// ============================================================================
// RATING CONVERSION
// ============================================================================

const RATING_SCORES: Record<string, number> = {
  'elite': 100,
  'solid': 80,
  'notGreat': 50,
  'off': 0
};

function getRatingScore(rating: string): number {
  return RATING_SCORES[rating] || 0;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Derive weekly constraint snapshot from recent check-ins
 * 
 * @param email - User email
 * @param lookbackDays - How many days to analyze (default 14)
 * @returns Current constraint snapshot
 */
export async function deriveWeeklyConstraints(
  email: string,
  lookbackDays: number = 14
): Promise<WeeklyConstraintSnapshot> {
  
  // 1. Fetch recent check-ins
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  const checkinsRef = collection(db, 'users', email, 'momentum');
  const q = query(
    checkinsRef,
    where('date', '>=', cutoffStr),
    orderBy('date', 'desc'),
    limit(lookbackDays)
  );
  
  const snapshot = await getDocs(q);
  const checkins: CheckInData[] = snapshot.docs.map(doc => doc.data() as CheckInData);
  
  if (checkins.length === 0) {
    // No data - return conservative defaults
    return getDefaultSnapshot();
  }
  
  // 2. Calculate metrics
  const trainingFrequency = checkins.filter(c => 
    c.exerciseCompleted === true
  ).length;
  
  const sleepScores = checkins
  .filter(c => c.behaviorGrades)
  .map(c => {
    const sleepGrade = c.behaviorGrades.find(b => b.name === 'sleep');
    return sleepGrade ? sleepGrade.grade : 0;
  });
  
  const sleepConsistency = sleepScores.filter(s => s >= 80).length / sleepScores.length;
  
  const sleepAverage = sleepScores.length > 0
    ? sleepScores.reduce((sum, grade) => sum + grade, 0) / sleepScores.length
    : 0;
  
  // Calculate nutrition scores (pattern + energy balance)
  const nutritionScores = checkins
    .filter(c => c.behaviorGrades)
    .flatMap(c => c.behaviorGrades.filter(b => 
      b.name === 'nutrition_pattern' || b.name === 'energy_balance'
    ))
    .map(b => b.grade);
  
  const nutritionAverage = nutritionScores.length > 0
    ? nutritionScores.reduce((sum, grade) => sum + grade, 0) / nutritionScores.length
    : 0;
  
  // Calculate protein average
  const proteinScores = checkins
    .filter(c => c.behaviorGrades)
    .map(c => {
      const proteinGrade = c.behaviorGrades.find(b => b.name === 'protein');
      return proteinGrade ? proteinGrade.grade : 0;
    });
  
  const proteinAverage = proteinScores.length > 0
    ? proteinScores.reduce((sum, grade) => sum + grade, 0) / proteinScores.length
    : 0;
  
  // Calculate hydration average
  const hydrationScores = checkins
    .filter(c => c.behaviorGrades)
    .map(c => {
      const hydrationGrade = c.behaviorGrades.find(b => b.name === 'hydration');
      return hydrationGrade ? hydrationGrade.grade : 0;
    });
  
  const hydrationAverage = hydrationScores.length > 0
    ? hydrationScores.reduce((sum, grade) => sum + grade, 0) / hydrationScores.length
    : 0;
  
  // Calculate mindset average
  const mindsetScores = checkins
    .filter(c => c.behaviorGrades)
    .map(c => {
      const mindsetGrade = c.behaviorGrades.find(b => b.name === 'mindset');
      return mindsetGrade ? mindsetGrade.grade : 0;
    });
  
  const mindsetAverage = mindsetScores.length > 0
    ? mindsetScores.reduce((sum, grade) => sum + grade, 0) / mindsetScores.length
    : 0;
  
  // Average of foundation behaviors (excluding mindset and bonus movement)
  const avgBehaviorScore = checkins.reduce((sum, c) => {
    if (!c.behaviorGrades || c.behaviorGrades.length === 0) return sum;
    const grades = c.behaviorGrades.map(b => b.grade);
    const dayAvg = grades.reduce((a, b) => a + b, 0) / grades.length;
    return sum + dayAvg;
  }, 0) / checkins.length;
  
  // Momentum trend (if available)
  const momentumValues = checkins
  .filter(c => c.momentumScore !== undefined)
  .map(c => c.momentumScore!);
  
  const momentumTrend = momentumValues.length >= 2
    ? momentumValues[0] - momentumValues[momentumValues.length - 1]
    : 0;
  
  // 3. Derive constraints
  const timeCapacity = deriveTimeCapacity(trainingFrequency, avgBehaviorScore, checkins.length);
  const recoveryMargin = deriveRecoveryMargin(sleepConsistency, trainingFrequency, avgBehaviorScore);
  const phaseSignal = derivePhaseSignal(momentumTrend, trainingFrequency, avgBehaviorScore);
  const dominantLimiter = deriveDominantLimiter(checkins);
  
  return {
    timeCapacity,
    recoveryMargin,
    phaseSignal,
    dominantLimiter,
    trainingFrequency,
    avgBehaviorScore,
    sleepConsistency,
    sleepAverage,
    nutritionAverage,
    proteinAverage,
    hydrationAverage,
    mindsetAverage,
    derivedFrom: `${cutoffStr} to ${new Date().toISOString().split('T')[0]}`,
    generatedAt: new Date().toISOString()
  };
}
/**
 * Derive weekly constraints using pattern's specific date range
 * This ensures we analyze the SAME dates as pattern detection
 */
export async function deriveWeeklyConstraintsFromPattern(
    email: string,
    pattern: { weekId: string; dateRange: { start: string; end: string } }
  ): Promise<WeeklyConstraintSnapshot> {
    
 // Use pattern's exact date range
 const weekStart = pattern.dateRange.start;
 const weekEnd = pattern.dateRange.end;
    
 const checkinsRef = collection(db, 'users', email, 'momentum');
    const q = query(
      checkinsRef,
      where('date', '>=', weekStart),
      where('date', '<=', weekEnd),
      orderBy('date', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const checkins: CheckInData[] = snapshot.docs.map(doc => doc.data() as CheckInData);
    
    console.log(`[Weekly Constraints] Fetched ${checkins.length} check-ins for ${weekStart} to ${weekEnd}`);
    
    if (checkins.length === 0) {
      return getDefaultSnapshot();
    }
    
    // Calculate metrics (same logic as main function)
    const trainingFrequency = checkins.filter(c => 
      c.exerciseCompleted === true
    ).length;
    
    const sleepScores = checkins
  .filter(c => c.behaviorGrades)
  .map(c => {
    const sleepGrade = c.behaviorGrades.find(b => b.name === 'sleep');
    return sleepGrade ? sleepGrade.grade : 0;
  });
    
    const sleepConsistency = sleepScores.length > 0 
      ? sleepScores.filter(s => s >= 80).length / sleepScores.length
      : 0;
    
    const sleepAverage = sleepScores.length > 0
      ? sleepScores.reduce((sum, grade) => sum + grade, 0) / sleepScores.length
      : 0;
    
    // Calculate nutrition scores (pattern + energy balance)
    const nutritionScores = checkins
      .filter(c => c.behaviorGrades)
      .flatMap(c => c.behaviorGrades.filter(b => 
        b.name === 'nutrition_pattern' || b.name === 'energy_balance'
      ))
      .map(b => b.grade);
    
    const nutritionAverage = nutritionScores.length > 0
      ? nutritionScores.reduce((sum, grade) => sum + grade, 0) / nutritionScores.length
      : 0;
    
    // Calculate protein average
    const proteinScores = checkins
      .filter(c => c.behaviorGrades)
      .map(c => {
        const proteinGrade = c.behaviorGrades.find(b => b.name === 'protein');
        return proteinGrade ? proteinGrade.grade : 0;
      });
    
    const proteinAverage = proteinScores.length > 0
      ? proteinScores.reduce((sum, grade) => sum + grade, 0) / proteinScores.length
      : 0;
    
    // Calculate hydration average
    const hydrationScores = checkins
      .filter(c => c.behaviorGrades)
      .map(c => {
        const hydrationGrade = c.behaviorGrades.find(b => b.name === 'hydration');
        return hydrationGrade ? hydrationGrade.grade : 0;
      });
    
    const hydrationAverage = hydrationScores.length > 0
      ? hydrationScores.reduce((sum, grade) => sum + grade, 0) / hydrationScores.length
      : 0;
    
    // Calculate mindset average
    const mindsetScores = checkins
      .filter(c => c.behaviorGrades)
      .map(c => {
        const mindsetGrade = c.behaviorGrades.find(b => b.name === 'mindset');
        return mindsetGrade ? mindsetGrade.grade : 0;
      });
    
    const mindsetAverage = mindsetScores.length > 0
      ? mindsetScores.reduce((sum, grade) => sum + grade, 0) / mindsetScores.length
      : 0;
    
      const avgBehaviorScore = checkins.reduce((sum, c) => {
        if (!c.behaviorGrades || c.behaviorGrades.length === 0) return sum;
        const grades = c.behaviorGrades.map(b => b.grade);
        const dayAvg = grades.reduce((a, b) => a + b, 0) / grades.length;
        return sum + dayAvg;
      }, 0) / checkins.length;
    
      const momentumValues = checkins
      .filter(c => c.momentumScore !== undefined)
      .map(c => c.momentumScore!);
    
    const momentumTrend = momentumValues.length >= 2
      ? momentumValues[0] - momentumValues[momentumValues.length - 1]
      : 0;
    
    // Derive constraints
    const timeCapacity = deriveTimeCapacity(trainingFrequency, avgBehaviorScore, checkins.length);
    const recoveryMargin = deriveRecoveryMargin(sleepConsistency, trainingFrequency, avgBehaviorScore);
    const phaseSignal = derivePhaseSignal(momentumTrend, trainingFrequency, avgBehaviorScore);
    const dominantLimiter = deriveDominantLimiter(checkins);
    
    return {
      timeCapacity,
      recoveryMargin,
      phaseSignal,
      dominantLimiter,
      trainingFrequency,
      avgBehaviorScore,
      sleepConsistency,
      sleepAverage,
      nutritionAverage,
      proteinAverage,
      hydrationAverage,
      mindsetAverage,
      derivedFrom: `${weekStart} to ${weekEnd}`,
      generatedAt: new Date().toISOString()
    };
  }
// ============================================================================
// INFERENCE LOGIC
// ============================================================================

/**
 * Infer time capacity from training frequency + behavior maintenance
 */
function deriveTimeCapacity(
  trainingFrequency: number,
  avgBehaviorScore: number,
  totalDays: number
): TimeCapacity {
  const trainingRate = trainingFrequency / totalDays;
  
  // High: Training 6-7 days AND maintaining other behaviors
  if (trainingRate >= 0.85 && avgBehaviorScore >= 70) {
    return "high";
  }
  
  // Moderate: Training 4-6 days OR training high but other behaviors struggling
  if (trainingRate >= 0.5 || (trainingRate >= 0.85 && avgBehaviorScore < 70)) {
    return "moderate";
  }
  
  // Low: Training 0-3 days
  return "low";
}

/**
 * Infer recovery margin from sleep consistency + training load
 */
function deriveRecoveryMargin(
  sleepConsistency: number,
  trainingFrequency: number,
  avgBehaviorScore: number
): RecoveryMargin {
  
  // Ample: Sleep solid + training moderate + behaviors solid
  if (sleepConsistency >= 0.85 && trainingFrequency <= 5 && avgBehaviorScore >= 75) {
    return "ample";
  }
  
  // Tight: Sleep solid + training high OR sleep moderate + training moderate
  if ((sleepConsistency >= 0.85 && trainingFrequency >= 6) ||
      (sleepConsistency >= 0.6 && trainingFrequency <= 5)) {
    return "tight";
  }
  
  // Constrained: Sleep struggling + training holding
  if (sleepConsistency < 0.6 && trainingFrequency >= 5) {
    return "constrained";
  }
  
  // Deficit: Sleep failing + high training OR everything declining
  return "deficit";
}

/**
 * Infer current phase from momentum trend + behavior pattern
 */
function derivePhaseSignal(
  momentumTrend: number,
  trainingFrequency: number,
  avgBehaviorScore: number
): PhaseSignal {
  
  // Building: Momentum up + behaviors improving
  if (momentumTrend > 5 && avgBehaviorScore >= 70) {
    return "building";
  }
  
  // Holding: Momentum flat + behaviors consistent
  if (Math.abs(momentumTrend) <= 5 && avgBehaviorScore >= 65) {
    return "holding";
  }
  
  // Overreaching: Momentum declining + effort holding steady
  if (momentumTrend < -5 && trainingFrequency >= 5 && avgBehaviorScore >= 60) {
    return "overreaching";
  }
  
  // Disrupted: Momentum down + effort down
  return "disrupted";
}

/**
 * Identify dominant limiter from weakest category
 */
function deriveDominantLimiter(checkins: CheckInData[]): DominantLimiter {
  
  // Calculate average scores by category from behaviorGrades
  const categoryScores = {
    sleep: 0,
    protein: 0,
    nutrition: 0,
    exercise: 0
  };
  
  const counts = {
    sleep: 0,
    protein: 0,
    nutrition: 0,
    exercise: 0
  };
  
  checkins.forEach(c => {
    if (!c.behaviorGrades) return;
    
    c.behaviorGrades.forEach(b => {
      if (b.name === 'sleep') {
        categoryScores.sleep += b.grade;
        counts.sleep++;
      } else if (b.name === 'protein') {
        categoryScores.protein += b.grade;
        counts.protein++;
      } else if (b.name === 'nutrition_pattern' || b.name === 'energy_balance') {
        categoryScores.nutrition += b.grade;
        counts.nutrition++;
      }
    });
    
    if (c.exerciseCompleted) {
      categoryScores.exercise += 100;
      counts.exercise++;
    }
  });
  
  // Calculate averages
  Object.keys(categoryScores).forEach(key => {
    const k = key as keyof typeof categoryScores;
    if (counts[k] > 0) {
      categoryScores[k] = categoryScores[k] / counts[k];
    }
  });
  
  // Find weakest category
  const weakest = Object.entries(categoryScores).reduce((min, [key, score]) => 
    score < min.score ? { key, score } : min
  , { key: 'sleep', score: categoryScores.sleep });
  
  // Map to limiter
  if (weakest.key === 'sleep' && weakest.score < 65) return "recovery";
  if (weakest.key === 'protein' || weakest.key === 'nutrition') return "nutrition";
  if (weakest.key === 'exercise' && weakest.score < 60) return "consistency";
  
  // All categories solid but momentum flat = progression limiter
  if (Object.values(categoryScores).every(s => s >= 70)) return "progression";
  
  // Default to recovery (most common)
  return "recovery";
}

// ============================================================================
// DEFAULTS
// ============================================================================

function getDefaultSnapshot(): WeeklyConstraintSnapshot {
  return {
    timeCapacity: "moderate",
    recoveryMargin: "tight",
    phaseSignal: "holding",
    dominantLimiter: "recovery",
    trainingFrequency: 0,
    avgBehaviorScore: 0,
    sleepConsistency: 0,
    sleepAverage: 0,
    nutritionAverage: 0,
    proteinAverage: 0,
    hydrationAverage: 0,
    mindsetAverage: 0,
    derivedFrom: "insufficient data",
    generatedAt: new Date().toISOString()
  };
}

// ============================================================================
// FORMATTING FOR PROMPT
// ============================================================================

/**
 * Format snapshot for coaching prompt
 */
export function formatWeeklyConstraintsForPrompt(snapshot: WeeklyConstraintSnapshot): string {
  const lines: string[] = [];
  
  lines.push(`Time capacity: ${snapshot.timeCapacity} (training ${snapshot.trainingFrequency} days recently)`);
  lines.push(`Recovery margin: ${snapshot.recoveryMargin} (sleep ${Math.round(snapshot.sleepConsistency * 100)}% consistent)`);
  lines.push(`Sleep average: ${Math.round(snapshot.sleepAverage)}%`);
  lines.push(`Nutrition average: ${Math.round(snapshot.nutritionAverage)}% (pattern + energy balance combined)`);
  lines.push(`Protein average: ${Math.round(snapshot.proteinAverage)}%`);
  lines.push(`Hydration average: ${Math.round(snapshot.hydrationAverage)}%`);
  lines.push(`Mindset average: ${Math.round(snapshot.mindsetAverage)}%`);
  lines.push(`Current phase: ${snapshot.phaseSignal}`);
  lines.push(`Primary constraint: ${snapshot.dominantLimiter}`);
  
  return lines.join('\n');
}