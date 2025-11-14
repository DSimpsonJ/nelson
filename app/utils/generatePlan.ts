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
    planType: "hypertrophy" | "strength" | "recomp" | "fatLoss" | "health";
    goal: string;
  
    trainingDays: number;
    experience: "beginner" | "intermediate" | "advanced";
  
    equipment: "full" | "home" | "minimal";
  
    hydrationTarget: number;   // liters per day
    sleepTarget: number;       // hours per night
  
    coachingStyle: "encouraging" | "direct" | "analytical";
  
    startDate: string;         // ISO timestamp
  
    // 🔹 New, important personalization fields
    weekOneFocus: string;
    dailyHabits: string[];
  
    schedule: {
      day: string;
      focus: string;
      task: string;
    }[];
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
  
  // utils/generatePlan.ts

  export function generatePlan(answers: any): NelsonPlan {
    const rawGoal = (answers.goal ?? "").toString();
  
    // 🔹 Plan type based on goal
    let planType: NelsonPlan["planType"] = "health";
    if (rawGoal === "muscle") planType = "hypertrophy";
    else if (rawGoal === "strength") planType = "strength";
    else if (rawGoal === "fatloss") planType = "fatLoss";
    else if (rawGoal === "recomp") planType = "recomp";
  
    // 🔹 Training days and experience level
    const trainingDays = Number(answers.trainingDays ?? 3);
    let experience: NelsonPlan["experience"] = "beginner";
    if (trainingDays >= 4) experience = "intermediate";
    if (trainingDays >= 5) experience = "advanced";
  
    // 🔹 Equipment
    const equipment = (answers.equipment ?? "full") as NelsonPlan["equipment"];
  
    // 🔹 Hydration and sleep
    const hydrationTarget = Number(answers.hydrationTarget ?? 3); // liters
    const sleepTarget = Number(answers.sleepTarget ?? 7);          // hours
  
    // 🔹 Coaching style
    const coachingStyle = (answers.coaching ?? "encouraging") as NelsonPlan["coachingStyle"];
  
    // 🔹 Human-readable goal text
    const goal =
      rawGoal === "muscle"
        ? "Build muscle"
        : rawGoal === "strength"
        ? "Get stronger"
        : rawGoal === "fatloss"
        ? "Lose fat"
        : "Improve overall health";
  
    // 🔹 Week one focus by plan type
    const focusByGoal: Record<NelsonPlan["planType"], string> = {
      hypertrophy: "Build consistency with progressive overload (add 1–2 reps each session).",
      strength: "Master form and log every major lift to establish baselines.",
      fatLoss: "Lock in daily consistency: protein, hydration, and movement every day.",
      health: "Establish daily movement, sleep rhythm, and hydration as non-negotiables.",
      recomp: "Balance lifting intensity with tight nutrition and recovery.",
    };
  
    const weekOneFocus = focusByGoal[planType];
  
    // 🔹 Base daily habits
    const dailyHabits: string[] = [
      "Log a daily check-in in Nelson before 9 PM.",
      "Hit your protein minimum for the day.",
      "Drink at least 100 oz of water.",
    ];
  
    if (planType === "fatLoss") {
      dailyHabits.push("Take a 10-minute walk after one meal.");
    }
    if (planType === "hypertrophy" || planType === "strength") {
      dailyHabits.push("Do a 5-minute warm-up before each session.");
    }
  
    // 🔹 Weekly schedule
    const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const schedule: NelsonPlan["schedule"] = [];
  
    for (let i = 0; i < trainingDays && i < allDays.length; i++) {
      const dayName = allDays[i];
  
      let focusLabel = "Full Body Foundation";
      if (trainingDays >= 4) {
        focusLabel = i % 2 === 0 ? "Upper Body" : "Lower Body";
      }
      if (planType === "fatLoss") {
        focusLabel = "Conditioning & Steps";
      }
      if (planType === "health") {
        focusLabel = "Movement & Mobility";
      }
  
      schedule.push({
        day: dayName,
        focus: focusLabel,
        task: "Complete your planned session and log it in Nelson.",
      });
    }
  
    return {
      planType,
      goal,
      trainingDays,
      experience,
      equipment,
      hydrationTarget,
      sleepTarget,
      coachingStyle,
      startDate: new Date().toISOString(),
      weekOneFocus,
      dailyHabits,
      schedule,
    };
  }