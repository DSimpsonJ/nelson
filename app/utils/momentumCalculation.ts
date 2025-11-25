// ---------------------------------------------------------------------
// Momentum Weighting System (Primary = 60%, Remaining split 66/34)
// Donnie's Version: Rewards doing more good things, not just stacks
// ---------------------------------------------------------------------

type HabitResult = {
  name: string;
  hit: boolean;    // true if user did the habit today
};

export function calculateDailyMomentumScore({
  primaryResult,
  stackedResults,
  genericResults
}: {
  primaryResult: HabitResult;
  stackedResults: HabitResult[];
  genericResults: HabitResult[];
}) {
  // ----- CONFIG ------------------------------------------------------

  const PRIMARY_WEIGHT = 60;       // fixed
  const REMAINING = 40;            // % to distribute among secondaries

  // Stacked habits get 66% of the secondary weight
  const STACK_PORTION = REMAINING * 0.66;     // ≈ 26.4%
  const GENERIC_PORTION = REMAINING * 0.34;   // ≈ 13.6%

  // Avoid division-by-zero
  const numStacks = stackedResults.length || 1;
  const numGenerics = genericResults.length || 1;

  // ----- PER-HABIT WEIGHTS -------------------------------------------

  const stackWeightPerHabit = STACK_PORTION / numStacks;
  const genericWeightPerHabit = GENERIC_PORTION / numGenerics;

  // ----- SCORING ------------------------------------------------------

  let score = 0;

  console.log("[Momentum] Primary:", primaryResult);
  console.log("[Momentum] Stacked:", stackedResults);
  console.log("[Momentum] Generic:", genericResults);

  // Primary (always binary)
  if (primaryResult.hit) score += PRIMARY_WEIGHT;

  // Stacked habits
  for (const habit of stackedResults) {
    if (habit.hit) score += stackWeightPerHabit;
  }

  // Generic behaviors
  for (const habit of genericResults) {
    if (habit.hit) score += genericWeightPerHabit;
  }

  // Clamp score to 0–100 range
  score = Math.round(Math.min(100, Math.max(0, score)));

  // Return detailed scoring breakdown
  return {
    score,
    weights: {
      primary: PRIMARY_WEIGHT,
      stacked: {
        total: STACK_PORTION,
        perHabit: stackWeightPerHabit
      },
      generics: {
        total: GENERIC_PORTION,
        perHabit: genericWeightPerHabit
      }
    }
  };
}
export function determinePrimaryHabitHit({
  habitKey,
  checkinData,
  sessionData,
  nutritionScore
}: {
  habitKey: string;
  checkinData: {
    proteinHit: string;
    hydrationHit: string;
    movedToday: string;
    sleepHit: string;
  };
  sessionData: {
    hasSessionToday: boolean;
    todaySession?: { durationMin: number };
    targetMinutes: number;
  };
  nutritionScore: number;
}): boolean {
  const habitType = getHabitType(habitKey);
  
  switch (habitType) {
    case "movement":
      // Check if they have a session that meets target
      if (sessionData.hasSessionToday && sessionData.todaySession) {
        return sessionData.todaySession.durationMin >= sessionData.targetMinutes;
      }
      // Fallback to check-in "moved today"
      return checkinData.movedToday === "yes";
      
    case "hydration":
      return checkinData.hydrationHit === "yes";
      
    case "protein":
      return checkinData.proteinHit === "yes";
      
    case "sleep":
      return checkinData.sleepHit === "yes";
      
    case "eating_pattern":
      return nutritionScore >= 9;
      
    default:
      return false;
  }
}

function getHabitType(habitKey: string): string {
  if (habitKey.includes("walk_") || habitKey.includes("movement_")) return "movement";
  if (habitKey.includes("protein_")) return "protein";
  if (habitKey.includes("hydration_")) return "hydration";
  if (habitKey.includes("sleep_")) return "sleep";
  if (habitKey === "no_late_eating") return "eating_pattern";
  if (habitKey === "vegetables_3_servings") return "vegetables";
  return "custom";
}
export function applyMomentumCap(
  rawScore: number,
  accountAgeDays: number
): {
  score: number;
  message: string;
} {
  // ===== UNLOCK RAMP (First 14 days only) =====
  let cappedScore = rawScore;

  if (accountAgeDays <= 3) {
    // Day 1-3: 20-30%
    cappedScore = Math.min(rawScore, 20 + (accountAgeDays - 1) * 5);
  } else if (accountAgeDays <= 7) {
    // Day 4-7: 35-50%
    cappedScore = Math.min(rawScore, 35 + (accountAgeDays - 4) * 5);
  } else if (accountAgeDays <= 14) {
    // Day 8-14: 55-65%
    const unlockMap: Record<number, number> = {
      8: 55, 9: 57, 10: 59, 11: 61, 12: 63, 13: 64, 14: 65
    };
    cappedScore = Math.min(rawScore, unlockMap[accountAgeDays] || 65);
  }
  // Day 15+: no cap, full range unlocked

  // ===== MESSAGING (Context-aware) =====
  let message: string;

  if (accountAgeDays <= 14) {
    // NEW USER MESSAGING
    if (cappedScore < 40) {
      message = "Building a foundation";
    } else if (cappedScore < 60) {
      message = "Finding your rhythm";
    } else if (cappedScore < 80) {
      message = "Momentum is forming";
    } else {
      message = "Breakthrough progress";
    }
  } else {
    // VETERAN MESSAGING (Day 15+)
    if (cappedScore < 40) {
      message = "Resetting your pace";
    } else if (cappedScore < 60) {
      message = "Gaining traction";
    } else if (cappedScore < 80) {
      message = "Heating up 🔥";
    } else {
      message = "On fire 🔥🔥";
    }
  }

  return { score: cappedScore, message };
}