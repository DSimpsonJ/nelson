import { Timestamp } from "firebase/firestore";

type IntakeAnswers = {
  goal: string;
  eatingPattern: string;
  activityLevel: string;
  scheduleLoad: string;
  commitment_sedentary?: string;
  commitment_lightly_active?: string;
  commitment_regularly_active?: string;
  commitment_training_consistently?: string;
  sleepHours: string;
  weightLbs: string;
  goalWeightLbs?: string;
};

export type PrimaryHabit = {
  type: "movement_minutes";
  targetMinutes: number;
  createdAt: any;
  lastChangeAt: any;
  source: "intake" | "manual" | "auto_level";
  suggested?: boolean; // Mark as suggested until user commits
};

export type Plan = {
  primaryHabit: PrimaryHabit;
  hydrationTargetOz: number;
  proteinTargetG: number;
  goal: string;
  eatingPattern: string;
  activityLevel: string;
  scheduleLoad: string;
  sleepHours: string;
};

/**
 * Builds initial plan from intake answers
 * Follows Nelson Blueprint v2.1 logic
 */
export function buildInitialPlanFromIntake(answers: IntakeAnswers): Plan {
  const now = Timestamp.now();
  
  // Extract target minutes from commitment answer
  // The commitment value is already the target (e.g., "10" for 10 minutes)
  const commitmentValue = 
    answers.commitment_sedentary ||
    answers.commitment_lightly_active ||
    answers.commitment_regularly_active ||
    answers.commitment_training_consistently;
  
  const targetMinutes = commitmentValue ? parseInt(commitmentValue, 10) : 10;

  // Calculate hydration target
  // Formula: clamp(80, 120, round(weightLbs * 0.6))
  const weightLbs = parseFloat(answers.weightLbs) || 150;
  const rawHydration = Math.round(weightLbs * 0.6);
  const hydrationTargetOz = Math.max(80, Math.min(120, rawHydration));

  // Calculate protein target
  // Use lower of current/goal weight to avoid over-prescribing for obese users
  // Formula: ~1.75g/kg or 0.8g/lb (reasonable for all goals)
  const goalWeightLbs = parseFloat(answers.goalWeightLbs || "0");
  
  // If no goal weight provided, cap protein at 200g (equivalent to 250lb person)
  const baseWeightForProtein = goalWeightLbs > 0 
    ? Math.min(weightLbs, goalWeightLbs)
    : Math.min(weightLbs, 250);
    
  const proteinTargetG = Math.round(baseWeightForProtein * 0.8);

  // Build primary habit object as a SUGGESTION (not committed yet)
  const primaryHabit: PrimaryHabit = {
    type: "movement_minutes",
    targetMinutes,
    createdAt: now,
    lastChangeAt: now,
    source: "intake",
    suggested: true, // User must approve this on dashboard
  };

  // Build complete plan
  const plan: Plan = {
    primaryHabit,
    hydrationTargetOz,
    proteinTargetG,
    goal: answers.goal || "health",
    eatingPattern: answers.eatingPattern || "mixed",
    activityLevel: answers.activityLevel || "lightly_active",
    scheduleLoad: answers.scheduleLoad || "manageable",
    sleepHours: answers.sleepHours || "6-7",
  };

  return plan;
}

/**
 * Get commitment range options based on activity level
 * Used for UI reference if needed
 */
export function getCommitmentRange(activityLevel: string): {
  min: number;
  max: number;
  options: number[];
} {
  switch (activityLevel) {
    case "sedentary":
      return { min: 2, max: 8, options: [3, 5, 8] };
    case "lightly_active":
      return { min: 5, max: 20, options: [10, 15, 20] };
    case "regularly_active":
      return { min: 10, max: 30, options: [20, 25, 30] };
    case "training_consistently":
      return { min: 15, max: 60, options: [25, 30, 45, 60] };
    default:
      return { min: 5, max: 15, options: [10, 15, 20] };
  }
}