// ---------------------------------------------------------------------
// Grade-Based Momentum Scoring
// Elite = 100%, Solid = 80%, Not Great = 60%, Off = 0%
// ---------------------------------------------------------------------

export function calculateDailyMomentumScore(
  behaviorGrades: { name: string; grade: number }[]
) {
  console.log("[Momentum] Behavior grades:", behaviorGrades);
  
  if (behaviorGrades.length === 0) {
    return { score: 0, breakdown: [] };
  }
  
  // Calculate average grade
  const totalGrade = behaviorGrades.reduce((sum, b) => sum + b.grade, 0);
  const averageGrade = Math.round(totalGrade / behaviorGrades.length);
  
  console.log("[Momentum] Average grade:", averageGrade);
  
  return {
    score: averageGrade,
    breakdown: behaviorGrades,
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
  // Movement primary ONLY counts if there's a tracked workout session
  if (sessionData.hasSessionToday && sessionData.todaySession) {
    return sessionData.todaySession.durationMin >= sessionData.targetMinutes;
  }
  // No session = primary not hit
  return false;
      
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