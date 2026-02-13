/**
 * WEEKLY PATTERN DETECTION
 * 
 * Analyzes 7 COMPLETED days of user data and returns ONE primary pattern.
 * This is pure logic - no AI involved.
 * The AI's job is to explain the pattern, not detect it.
 * 
 * Philosophy:
 * - Patterns are defined by thresholds, not LLM judgment
 * - One pattern per week (humans can only act on one thing)
 * - Detection order matters (priority hierarchy)
 * - Silence is acceptable for early users
 */

import { collection, query, where, getDocs, orderBy, doc, getDoc, limit } from "firebase/firestore";
import { db } from "@/app/firebase/config";

// Pattern types (in priority order)
export type PatternType = 
  | "insufficient_data"      // < 4 check-ins this week
  | "building_foundation"    // < 10 total check-ins
  | "gap_disruption"         // Recent gap affecting rhythm
  | "commitment_misaligned"  // Exercise high but momentum flat
  | "recovery_deficit"       // Sleep + mindset consistently low
  | "effort_inconsistent"    // Exercise on/off, other behaviors low
  | "variance_high"          // Behavior swings wildly
  | "momentum_decline"
  | "momentum_plateau"       // Consistent check-ins but no movement
  | "building_momentum"      // Momentum trending upward, things working

  export interface WeeklyPattern {
    primaryPattern: PatternType;
    evidencePoints: string[];
    weekId: string;
    dateRange: {
      start: string;  // YYYY-MM-DD
      end: string;    // YYYY-MM-DD
    };
    canCoach: boolean;
    daysAnalyzed: number;
    realCheckInsThisWeek: number;
    totalLifetimeCheckIns: number;
  }

interface DayData {
  date: string;
  checkinType: "real" | "gap_fill";
  exerciseCompleted: boolean;
  behaviorGrades: Array<{ name: string; grade: number }>;
  momentumScore: number;
  dailyScore: number;
  gapResolved?: boolean;
}

/**
 * Detect the primary pattern for a given week
 */
export async function detectWeeklyPattern(
  email: string,
  weekId: string
): Promise<WeeklyPattern> {
  
  // 1. Calculate 7-day window of COMPLETED days
  const today = new Date();
  const todayKey = today.toLocaleDateString("en-CA");
  
  // Check if today has a real check-in
  const todayRef = doc(db, "users", email, "momentum", todayKey);
  const todaySnap = await getDoc(todayRef);
  const todayHasRealCheckin = todaySnap.exists() && todaySnap.data()?.checkinType === "real";
  
  // Window ends at: today (if real check-in), otherwise yesterday
  const windowEnd = todayHasRealCheckin ? today : (() => {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  })();
  
  const windowEndKey = windowEnd.toLocaleDateString("en-CA");
  
  // Window starts 6 days before window end
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - 6);
  const windowStartKey = windowStart.toLocaleDateString("en-CA");
  
  console.log(`[Pattern Detection] Window: ${windowStartKey} to ${windowEndKey} (7 completed days)`);
  // Store date range for constraint derivation
const dateRange = {
  start: windowStartKey,
  end: windowEndKey
};
  // 2. Fetch momentum docs in window
  const momentumRef = collection(db, "users", email, "momentum");
  const q = query(
    momentumRef,
    where("date", ">=", windowStartKey),
    where("date", "<=", windowEndKey),
    orderBy("date", "desc")
  );
  
  const snapshot = await getDocs(q);
  
  // 3. Parse data
  const days: DayData[] = snapshot.docs
    .filter(doc => doc.id.match(/^\d{4}-\d{2}-\d{2}$/))
    .map(doc => {
      const data = doc.data();
      return {
        date: data.date,
        checkinType: data.checkinType || "real",
        exerciseCompleted: data.exerciseCompleted || false,
        behaviorGrades: data.behaviorGrades || [],
        momentumScore: data.momentumScore || 0,
        dailyScore: data.dailyScore || 0,
        gapResolved: data.gapResolved,
      };
    });
  
  const realCheckIns = days.filter(d => d.checkinType === "real");
  
  // 4. Get lifetime total from most recent REAL check-in
  // First try within the window
  let mostRecentReal = snapshot.docs
    .filter(d => d.data().checkinType === "real" && d.data().totalRealCheckIns !== undefined)
    .sort((a, b) => b.id.localeCompare(a.id))[0];
  
  // Fallback: If no totalRealCheckIns in window, search backward globally
  let totalCheckIns = mostRecentReal?.data()?.totalRealCheckIns;
  
  if (!totalCheckIns) {
    console.log("[Pattern Detection] No totalRealCheckIns in window, searching backward...");
    
    // Search last 30 days for most recent real check-in with totalRealCheckIns
    const thirtyDaysAgo = new Date(windowEnd);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const fallbackQuery = query(
      momentumRef,
      where("date", ">=", thirtyDaysAgo.toLocaleDateString("en-CA")),
      where("checkinType", "==", "real"),
      orderBy("date", "desc"),
      limit(10)
    );
    
    const fallbackSnap = await getDocs(fallbackQuery);
    const fallbackReal = fallbackSnap.docs.find(d => d.data().totalRealCheckIns !== undefined);
    totalCheckIns = fallbackReal?.data()?.totalRealCheckIns || 0;
  }
  
  console.log(`[Pattern Detection] Real check-ins this week: ${realCheckIns.length}, Lifetime: ${totalCheckIns}`);
  
  // 5. Run pattern detection (priority order)
  
  // PRIORITY 1: Insufficient data
  if (realCheckIns.length < 4) {
    return {
      primaryPattern: "insufficient_data",
      evidencePoints: [`Only ${realCheckIns.length} check-ins in last 7 days`],
      weekId,
      dateRange,
      canCoach: false,
      daysAnalyzed: 7,
      realCheckInsThisWeek: realCheckIns.length,
      totalLifetimeCheckIns: totalCheckIns
    };
  }
  
  // PRIORITY 2: Building foundation
  if (totalCheckIns < 10) {
    return {
      primaryPattern: "building_foundation",
      evidencePoints: [
        `Total check-ins: ${totalCheckIns}`,
        `Week check-ins: ${realCheckIns.length}/7`
      ],
      weekId,
      dateRange,
      canCoach: false, // Silence is acceptable
      daysAnalyzed: 7,
      realCheckInsThisWeek: realCheckIns.length,
      totalLifetimeCheckIns: totalCheckIns
    };
  }
  
  // PRIORITY 3: Gap disruption (only unresolved gaps)
  const unresolvedGaps = days.filter(d => 
    d.checkinType === "gap_fill" && d.gapResolved === false
  );
  
  if (unresolvedGaps.length > 0) {
    return {
      primaryPattern: "gap_disruption",
      evidencePoints: [
        `${unresolvedGaps.length} unresolved gap${unresolvedGaps.length > 1 ? 's' : ''} in last 7 days`,
        `Real check-ins: ${realCheckIns.length}/7`
      ],
      weekId,
      dateRange,
      canCoach: true,
      daysAnalyzed: 7,
      realCheckInsThisWeek: realCheckIns.length,
      totalLifetimeCheckIns: totalCheckIns
    };
  }
  
 // Count exercise from all days (real + reconciled gaps)
const exerciseDays = days.filter(d => d.exerciseCompleted === true).length;
  // Use current momentum from most recent day, not average
const currentMomentum = days.length > 0 ? days[0].momentumScore : 0;
  
  // Calculate behavior averages
  const behaviorAverages = calculateBehaviorAverages(realCheckIns);
  const sleepAvg = behaviorAverages.sleep || 0;
  const mindsetAvg = behaviorAverages.mindset || 0;
  const recoveryAvg = (sleepAvg + mindsetAvg) / 2;
  // Calculate momentum trend
const momentumTrend = calculateMomentumTrend([...days].reverse());
  
  // Calculate variance
  const variance = calculateBehaviorVariance(realCheckIns);
  
  // PRIORITY 4: Commitment misaligned (exercise high but momentum flat)
  if (exerciseDays >= 5 && currentMomentum < 50) {
    return {
      primaryPattern: "commitment_misaligned",
      evidencePoints: [
        `Exercise: ${exerciseDays}/7 days`,
        `Momentum: ${Math.round(currentMomentum)}%`,
        `Nutrition average: ${Math.round(behaviorAverages.nutrition_quality || 0)}%`,
        `Energy balance average: ${Math.round(behaviorAverages.portion_control || 0)}%`
      ],
      weekId,
      dateRange,
      canCoach: true,
      daysAnalyzed: 7,
      realCheckInsThisWeek: realCheckIns.length,
      totalLifetimeCheckIns: totalCheckIns
    };
  }
  
  // PRIORITY 5: Recovery deficit (sleep + mindset low for 3+ days)
  const lowRecoveryDays = realCheckIns.filter(d => {
    const sleepGrade = d.behaviorGrades.find(b => b.name === "sleep")?.grade || 0;
    const mindsetGrade = d.behaviorGrades.find(b => b.name === "mindset")?.grade || 0;
    return (sleepGrade + mindsetGrade) / 2 < 60;
  }).length;
  
  if (lowRecoveryDays >= 3) {
    return {
      primaryPattern: "recovery_deficit",
      evidencePoints: [
        `Sleep average: ${Math.round(sleepAvg)}%`,
        `Mindset average: ${Math.round(mindsetAvg)}%`,
        `Low recovery days: ${lowRecoveryDays}/7`
      ],
      weekId,
      dateRange,
      canCoach: true,
      daysAnalyzed: 7,
      realCheckInsThisWeek: realCheckIns.length,
      totalLifetimeCheckIns: totalCheckIns
    };
  }
  
  // PRIORITY 6: Effort inconsistent (exercise good but other behaviors lag)
  const nonExerciseBehaviors = ['nutrition_quality', 'portion_control', 'protein', 'hydration', 'sleep', 'mindset'];
  const nonExerciseAvg = nonExerciseBehaviors.reduce((sum, name) => 
    sum + (behaviorAverages[name] || 0), 0
  ) / nonExerciseBehaviors.length;
  
  if (exerciseDays >= 5 && nonExerciseAvg < 60) {
    return {
      primaryPattern: "effort_inconsistent",
      evidencePoints: [
        `Exercise: ${exerciseDays}/7 days`,
        `Other behaviors average: ${Math.round(nonExerciseAvg)}%`,
        `Nutrition: ${Math.round(behaviorAverages.nutrition_quality || 0)}%`,
        `Sleep: ${Math.round(sleepAvg)}%`
      ],
      weekId,
      dateRange,
      canCoach: true,
      daysAnalyzed: 7,
      realCheckInsThisWeek: realCheckIns.length,
      totalLifetimeCheckIns: totalCheckIns
    };
  }
  
  // PRIORITY 7: Variance high (behavior swings wildly)
  if (variance > 25) {
    return {
      primaryPattern: "variance_high",
      evidencePoints: [
        `Behavior variance: ${Math.round(variance)}%`,
        `Check-ins: ${realCheckIns.length}/7`,
        `Daily score range: ${Math.round(Math.min(...realCheckIns.map(d => d.dailyScore)))}-${Math.round(Math.max(...realCheckIns.map(d => d.dailyScore)))}`
      ],
      weekId,
      dateRange,
      canCoach: true,
      daysAnalyzed: 7,
      realCheckInsThisWeek: realCheckIns.length,
      totalLifetimeCheckIns: totalCheckIns
    };
  }
  
 // PRIORITY 8: Momentum decline (recent drop from disruption)
 const recentHigh = Math.max(...days.map(d => d.momentumScore));
 const momentumDrop = recentHigh - currentMomentum;
 
 if (
   momentumDrop >= 15 &&           // Meaningful drop (15+ points)
   currentMomentum < 65 &&         // Now below healthy range
   variance > 20                   // Unstable execution
 ) {
   return {
     primaryPattern: "momentum_decline",
     evidencePoints: [
       `Momentum dropped from ${Math.round(recentHigh)}% to ${Math.round(currentMomentum)}%`,
       `Variance: ${Math.round(variance)}%`,
       `Check-ins: ${realCheckIns.length}/7`
     ],
     weekId,
     dateRange,
     canCoach: true,
     daysAnalyzed: 7,
     realCheckInsThisWeek: realCheckIns.length,
     totalLifetimeCheckIns: totalCheckIns
   };
 }

// Default: momentum_plateau
return {
  primaryPattern: "momentum_plateau",
  evidencePoints: [
    `Check-ins: ${realCheckIns.length}/7`,
    `Momentum: ${Math.round(currentMomentum)}%`,
    `Momentum trend: ${momentumTrend}`,
    `Exercise: ${exerciseDays}/7 days`
  ],
  weekId,
  dateRange,
  canCoach: true,
  daysAnalyzed: 7,
  realCheckInsThisWeek: realCheckIns.length,
  totalLifetimeCheckIns: totalCheckIns
};
}

/**
 * Calculate average grade for each behavior
 */
function calculateBehaviorAverages(days: DayData[]): Record<string, number> {
  const averages: Record<string, number> = {};
  const behaviorNames = ['nutrition_quality', 'portion_control', 'protein', 'hydration', 'sleep', 'mindset', 'movement'];
  
  for (const name of behaviorNames) {
    const grades = days
      .flatMap(d => d.behaviorGrades)
      .filter(b => b.name === name)
      .map(b => b.grade);
    
    if (grades.length > 0) {
      averages[name] = grades.reduce((sum, g) => sum + g, 0) / grades.length;
    }
  }
  
  return averages;
}

/**
 * Calculate variance across all behaviors
 */
function calculateBehaviorVariance(days: DayData[]): number {
  const allGrades = days.flatMap(d => d.behaviorGrades.map(b => b.grade));
  
  if (allGrades.length === 0) return 0;
  
  const mean = allGrades.reduce((sum, g) => sum + g, 0) / allGrades.length;
  const squaredDiffs = allGrades.map(g => Math.pow(g - mean, 2));
  const variance = Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / allGrades.length);
  
  return variance;
}

/**
 * Calculate momentum trend
 */
function calculateMomentumTrend(days: DayData[]): string {
  if (days.length < 3) return "stable";
  
  const firstHalf = days.slice(0, Math.floor(days.length / 2));
  const secondHalf = days.slice(Math.floor(days.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, d) => sum + d.momentumScore, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, d) => sum + d.momentumScore, 0) / secondHalf.length;
  
  const diff = secondAvg - firstAvg;
  
  if (diff > 5) return "upward";
  if (diff < -5) return "downward";
  return "flat";
}