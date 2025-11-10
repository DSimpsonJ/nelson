/** Utility: get today's workout details from the user's plan */
type WorkoutDetails = {
    name: string;
    type?: string;
    focus?: string;
    duration?: number;
    sets?: number;
    reps?: number;
  };
  
  type Plan = {
    schedule?: WorkoutDetails[];
  };
  
  export function getTodaysWorkout(plan?: Plan): WorkoutDetails | null {
    if (!plan || !Array.isArray(plan.schedule) || plan.schedule.length === 0) {
      return null;
    }
  
    const schedule = plan.schedule;
    const todayIndex = new Date().getDay(); // Sunday = 0
    const workout = schedule[todayIndex % schedule.length]; // rotate safely
  
    return workout || null;
  }