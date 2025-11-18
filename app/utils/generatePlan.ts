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

  hydrationTarget: number; // liters per day
  sleepTarget: number; // hours per night

  coachingStyle: "encouraging" | "direct" | "analytical";

  startDate: string; // ISO timestamp

  // 🔹 Personalized fields surfaced on Plan + Dashboard
  weekOneFocus: string;
  dailyHabits: string[];

  schedule: {
    day: string;
    focus: string;
    task: string;
  }[];
};

/** ---------- Helpers ---------- */

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pickPlanType(goal?: IntakeAnswers["goal"]): NelsonPlan["planType"] {
  switch (goal) {
    case "muscle":
      return "hypertrophy";
    case "strength":
      return "strength";
    case "fatloss":
      return "fatLoss";
    case "health":
      return "health";
    default:
      return "recomp";
  }
}

/**
 * Guardrails so people do not overcommit on day one.
 * We respect commitment but cap it based on current activity.
 */
function pickTrainingDays(
  activity?: IntakeAnswers["activity"],
  commitment?: IntakeAnswers["commitment"]
): NelsonPlan["trainingDays"] {
  const commitMap: Record<
    NonNullable<IntakeAnswers["commitment"]>,
    NelsonPlan["trainingDays"]
  > = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5plus": 5,
  };

  let days: NelsonPlan["trainingDays"] =
    commitMap[commitment ?? "3"] ?? 3;

  if (activity === "none") days = Math.min(days, 3) as NelsonPlan["trainingDays"];
  if (activity === "rare") days = Math.min(days, 3) as NelsonPlan["trainingDays"];
  if (activity === "some") days = Math.min(days, 4) as NelsonPlan["trainingDays"];
  // regular or daily keep requested days

  return days;
}

function pickSleepTarget(sleep?: IntakeAnswers["sleep"]): number {
  switch (sleep) {
    case "poor":
      return 7.5;
    case "ok":
      return 7.5;
    case "good":
      return 8;
    default:
      return 7.5;
  }
}

/**
 * Simple, effective hydration rule:
 *  - 0.035 L per lb, clamped between 2.5 and 5.0 L
 *  - If no weight, default to 3.0 L
 */
function calcHydrationLiters(currentWeight?: number): number {
  if (!currentWeight || currentWeight <= 0) return 3.0;
  const liters = currentWeight * 0.035;
  return Math.max(2.5, Math.min(5.0, Number(liters.toFixed(1))));
}

/** ---------- Main generator ---------- */

export function generatePlan(answers: any): NelsonPlan {
  const intake = answers as IntakeAnswers;
  const rawGoal = (intake.goal ?? "").toString();

  // 🔹 Plan type based on goal
  const planType: NelsonPlan["planType"] = pickPlanType(intake.goal);

  // 🔹 Training days and experience level
  const trainingDays = pickTrainingDays(intake.activity, intake.commitment);
  let experience: NelsonPlan["experience"] = "beginner";
  if (trainingDays >= 4) experience = "intermediate";
  if (trainingDays >= 5) experience = "advanced";

  // 🔹 Equipment
  const equipment = (intake.equipment ?? "full") as NelsonPlan["equipment"];

  // 🔹 Hydration and sleep
  const currentWeight = toNumber(intake.currentWeight);
  const hydrationTarget = calcHydrationLiters(currentWeight); // liters
  const sleepTarget = pickSleepTarget(intake.sleep); // hours

  // 🔹 Coaching style
  const coachingStyle = (intake.coaching ?? "encouraging") as NelsonPlan["coachingStyle"];

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
    hypertrophy:
      "Overnight successes are built over time.  Let's lock in your baseline and progressively build from there.",
    strength:
      "Increase your power one brick at a time.  Master form, log your lifts, and show up consistently.",
    fatLoss:
      "Let’s lock in your daily anchors: nutrition, movement, and hydration. The optimal diet is the one you can adhere to.",
    health:
      "This week is about creating non-negotiables: daily movement, better sleep, and steady hydration.",
    recomp:
      "We’ll balance lifting intensity with clean nutrition and enough recovery to nudge both muscle and fat in the right direction.",
  };

  const weekOneFocus = focusByGoal[planType];

  // 🔹 Standardized daily habits (must match habitReasons keys exactly)
  const HABITS = {
    checkin: "Log your check-in",
    protein: "Hit your protein target",
    water: "Drink 100 oz of water",
    walk: "Go for a 10-minute walk",
    sleep: "Sleep 7+ hours",
  } as const;

  let dailyHabits: string[] = [
    HABITS.checkin,
    HABITS.protein,
    HABITS.water,
  ];

  // Plan-specific extras
  if (planType === "fatLoss") {
    dailyHabits.push(HABITS.walk);
  }

  if (planType === "hypertrophy" || planType === "strength") {
    dailyHabits.push(HABITS.sleep);
  }

  if (planType === "health") {
    dailyHabits = [
      HABITS.water,
      HABITS.walk,
      HABITS.sleep,
      HABITS.checkin,
    ];
  }

  // 🔹 Weekly schedule
  const allDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
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
      task: "Complete your planned session and log it so I can see your progress.",
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