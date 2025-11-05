// utils/generatePlan.ts

export type IntakeAnswers = {
    name?: string;
    activity?: "none" | "rare" | "some" | "regular" | "daily";
    goal?: "muscle" | "strength" | "fatloss" | "health";
    mindset?: "start" | "rebuild" | "structure" | "push";
    equipment?: "full" | "home" | "minimal";
    commitment?: "2" | "3" | "4" | "5plus";
    sleep?: "poor" | "ok" | "good";
    coaching?: "encouraging" | "direct" | "analytical";
    currentWeight?: number | string;
    goalWeight?: number | string;
  };
  
  export type NelsonPlan = {
    planType: "hypertrophy" | "strength" | "recomp" | "health";
    trainingDays: 2 | 3 | 4 | 5;
    equipment: "full" | "home" | "minimal";
    goal: string;
    hydrationTarget: number;   // liters per day
    sleepTarget: number;       // hours per night
    coachingStyle: "encouraging" | "direct" | "analytical";
    startDate: string;         // ISO
  };
  
  function toNumber(v: unknown): number | undefined {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  
  function pickPlanType(goal?: IntakeAnswers["goal"]): NelsonPlan["planType"] {
    switch (goal) {
      case "muscle": return "hypertrophy";
      case "strength": return "strength";
      case "fatloss": return "recomp";
      case "health": return "health";
      default: return "recomp";
    }
  }
  
  function pickTrainingDays(activity?: IntakeAnswers["activity"], commitment?: IntakeAnswers["commitment"]): NelsonPlan["trainingDays"] {
    // Guardrails so people do not overcommit on day one
    const commitMap: Record<NonNullable<IntakeAnswers["commitment"]>, NelsonPlan["trainingDays"]> = {
      "2": 2, "3": 3, "4": 4, "5plus": 5,
    };
    let days: NelsonPlan["trainingDays"] = commitMap[commitment ?? "3"] ?? 3;
  
    if (activity === "none") days = Math.min(days, 3) as NelsonPlan["trainingDays"];
    if (activity === "rare") days = Math.min(days, 3) as NelsonPlan["trainingDays"];
    if (activity === "some") days = Math.min(days, 4) as NelsonPlan["trainingDays"];
    // regular or daily keep requested days
    return days;
  }
  
  function pickSleepTarget(sleep?: IntakeAnswers["sleep"]): number {
    switch (sleep) {
      case "poor": return 7.5;
      case "ok": return 7.5;
      case "good": return 8;
      default: return 7.5;
    }
  }
  
  function calcHydrationLiters(currentWeight?: number): number {
    // Simple, effective rule of thumb: 0.035 L per lb, capped to a sensible range
    // If no weight, default to 3.0 L
    if (!currentWeight || currentWeight <= 0) return 3.0;
    const liters = currentWeight * 0.035;
    // clamp to 2.5 - 5.0 L for safety
    return Math.max(2.5, Math.min(5.0, Number(liters.toFixed(1))));
  }
  
  export function generatePlan(answers: IntakeAnswers): NelsonPlan {
    const planType = pickPlanType(answers.goal);
    const trainingDays = pickTrainingDays(answers.activity, answers.commitment);
    const equipment = answers.equipment ?? "full";
    const sleepTarget = pickSleepTarget(answers.sleep);
    const currentWeight = toNumber(answers.currentWeight);
    const hydrationTarget = calcHydrationLiters(currentWeight);
  
    return {
      planType,
      trainingDays,
      equipment,
      goal:
        answers.goal === "muscle" ? "Build muscle" :
        answers.goal === "strength" ? "Get stronger" :
        answers.goal === "fatloss" ? "Lose fat" :
        "Improve overall health",
      hydrationTarget,
      sleepTarget,
      coachingStyle: answers.coaching ?? "encouraging",
      startDate: new Date().toISOString(),
    };
  }