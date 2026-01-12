/**
 * DAILY MOMENTUM WRITER
 * 
 * Single source of truth for writing daily momentum documents.
 * This is the most critical function in Nelson - everything depends on this being perfect.
 * 
 * UPDATED: Now uses Newtonian momentum calculation (physics-based with streak inertia)
 * UPDATED: Tracks totalRealCheckIns for ramp caps (not accountAgeDays)
 * UPDATED: Derives exerciseCompleted from user declaration and session data
 */

import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { calculateNewtonianMomentum, calculateDailyScore } from './newtonianMomentum';
import { 
  resolveReward, 
  isSolidDay,
  RewardResult,
  RewardContext 
} from './rewardEngine';
import { 
  getMilestoneState, 
  updateMilestoneState, 
  getDaysSinceLastCheckin 
} from './milestoneState';

// ============================================================================
// CANONICAL SCHEMA
// ============================================================================

export interface DailyMomentumDoc {
  date: string; // YYYY-MM-DD
  accountAgeDays: number;
  totalRealCheckIns: number;
  checkinCompleted: boolean;
  missed?: boolean;
  behaviorRatings?: Record<string, string>;
  behaviorGrades?: { name: string; grade: number }[];
  note?: string;
  
  
  primary: {
    habitKey: string;
    done: boolean;
  };
  
  stack: Record<string, { done: boolean }>;
  
  foundations: {
    protein: boolean;
    hydration: boolean;
    sleep: boolean;
    nutrition: boolean;
    movement: boolean;
  };
  
  dailyScore: number;
  rawMomentumScore: number;
  momentumScore: number;
  momentumTrend: 'up' | 'down' | 'stable';
  momentumDelta: number;
  momentumMessage: string;
  visualState: "solid" | "outline" | "empty";
  
  primaryHabitHit: boolean;
  stackedHabitsCompleted: number;
  totalStackedHabits: number;
  moved: boolean;
  hydrated: boolean;
  slept: boolean;
  nutritionScore: number;
  
  currentStreak: number;
  lifetimeStreak: number;
  streakSavers: number;
  
  exerciseCompleted: boolean;
  exerciseTargetMinutes?: number;
  
  isFirstCheckIn?: boolean;
  checkinType?: "real" | "streak_saver" | "gap_fill";
  createdAt: string;
}

export interface WriteDailyMomentumInput {
  email: string;
  date: string;
  behaviorGrades: { name: string; grade: number }[];
  behaviorRatings?: Record<string, string>;

  currentFocus: {
    habitKey: string;
    habit: string;
  };
  habitStack: Array<{
    habitKey: string;
    habit: string;
  }>;
  
  goal?: string;
  accountAgeDays: number;
  exerciseDeclared?: boolean;
  note?: string;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function buildDefaults(input: WriteDailyMomentumInput): Partial<DailyMomentumDoc> {
  return {
    date: input.date,
    accountAgeDays: input.accountAgeDays,
    totalRealCheckIns: 0,
    
    primary: {
      habitKey: input.currentFocus.habitKey,
      done: false,
    },
    
    stack: {},
    
    foundations: {
      protein: false,
      hydration: false,
      sleep: false,
      nutrition: false,
      movement: false,
    },
    
    dailyScore: 0,
    rawMomentumScore: 0,
    momentumScore: 0,
    momentumTrend: 'stable',
    momentumDelta: 0,
    momentumMessage: "",
    visualState: "empty",
    
    primaryHabitHit: false,
    stackedHabitsCompleted: 0,
    totalStackedHabits: 0,
    moved: false,
    hydrated: false,
    slept: false,
    nutritionScore: 0,
    
    currentStreak: 0,
    lifetimeStreak: 0,
    streakSavers: 0,
    
    exerciseCompleted: false,
    
    checkinType: "real",
    createdAt: new Date().toISOString(),
  };
}

async function mergeWithExisting(
  email: string,
  date: string,
  defaults: Partial<DailyMomentumDoc>
): Promise<Partial<DailyMomentumDoc>> {
  const docRef = doc(db, "users", email, "momentum", date);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return defaults;
  }
  
  const existing = docSnap.data();
  
  return {
    ...defaults,
    currentStreak: existing.currentStreak ?? defaults.currentStreak,
    lifetimeStreak: existing.lifetimeStreak ?? defaults.lifetimeStreak,
    streakSavers: existing.streakSavers ?? defaults.streakSavers,
    totalRealCheckIns: existing.totalRealCheckIns ?? defaults.totalRealCheckIns,
    isFirstCheckIn: existing.isFirstCheckIn ?? false,
  };
}

function validateStructure(doc: Partial<DailyMomentumDoc>): boolean {
  if (!doc.date || !doc.primary || !doc.foundations || !doc.checkinType) {
    console.error("[WriteDailyMomentum] Missing critical fields:", doc);
    return false;
  }
  
  if (!doc.primary.habitKey || doc.primary.done === undefined) {
    console.error("[WriteDailyMomentum] Invalid primary structure:", doc.primary);
    return false;
  }
  
  return true;
}

async function calculateStreak(email: string, date: string): Promise<{
  currentStreak: number;
  lifetimeStreak: number;
  streakSavers: number;
}> {
  const today = new Date(date + "T00:00:00");
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("en-CA");
  
  const yesterdayRef = doc(db, "users", email, "momentum", yesterdayKey);
  const yesterdaySnap = await getDoc(yesterdayRef);
  
  const streakRef = doc(db, "users", email, "metadata", "streakData");
  const streakSnap = await getDoc(streakRef);
  const streakSavers = streakSnap.exists() ? (streakSnap.data().streakSavers || 3) : 3;
  
  if (yesterdaySnap.exists()) {
    const yesterdayData = yesterdaySnap.data();
    const currentStreak = (yesterdayData.currentStreak || 0) + 1;
    const lifetimeStreak = Math.max(currentStreak, yesterdayData.lifetimeStreak || 0);
    
    return { currentStreak, lifetimeStreak, streakSavers };
  } else {
    return { currentStreak: 1, lifetimeStreak: 1, streakSavers };
  }
}

function applyRampCap(score: number, checkInCount: number): { score: number; message: string } {
  if (checkInCount <= 2) {
    return {
      score: Math.min(score, 30),
      message: "Building a foundation"
    };
  }
  if (checkInCount <= 5) {
    return {
      score: Math.min(score, 60),
      message: "Finding your rhythm"
    };
  }
  if (checkInCount <= 9) {
    return {
      score: Math.min(score, 80),
      message: "Momentum is forming"
    };
  }
  
  return { score, message: "" };
}

async function deriveExerciseCompleted(
  email: string,
  checkInDate: string,
  exerciseDeclared?: boolean
): Promise<{ completed: boolean; targetMinutes: number }> {
  // Step 1: Get target from currentFocus
  const focusRef = doc(db, "users", email, "momentum", "currentFocus");
  const focusSnap = await getDoc(focusRef);
  
  const targetMinutes = focusSnap.exists() && focusSnap.data().target
    ? focusSnap.data().target
    : 10;
  
  // Step 2: Check session data for the check-in date
  const sessionsRef = collection(db, "users", email, "sessions");
  const sessionsQuery = query(sessionsRef, where("date", "==", checkInDate));
  const sessionsSnap = await getDocs(sessionsQuery);
  
  const sessionCompleted = sessionsSnap.docs.some(doc => {
    const data = doc.data();
    return data.durationMin >= targetMinutes;
  });
  
  // Step 3: Resolve completion (user declaration OR session data)
  // If exerciseDeclared is undefined (old code paths), default to false
  const completed = exerciseDeclared === true || sessionCompleted === true;
  
  return { completed, targetMinutes };
}

async function calculateDerivedFields(
  input: WriteDailyMomentumInput,
  merged: Partial<DailyMomentumDoc>,
  last4Days: number[]
): Promise<DailyMomentumDoc> {
  
  // 1. Calculate today's daily score
  const dailyScore = calculateDailyScore(input.behaviorGrades);
  
  // 2. Get yesterday's momentum and totalRealCheckIns
  const baseDate = new Date(input.date + "T00:00:00");
  const yesterday = new Date(baseDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("en-CA");
  
  const yesterdayRef = doc(db, "users", input.email, "momentum", yesterdayKey);
  const yesterdaySnap = await getDoc(yesterdayRef);
  
  let previousMomentum: number | undefined;
  let previousTotalCheckIns = 0;
  
  if (yesterdaySnap.exists()) {
    const yesterdayData = yesterdaySnap.data();
    
    // Use rawMomentumScore if it's a real check-in
    // Use momentumScore (already decayed) if it's a gap-fill
    if (yesterdayData.checkinType === "gap_fill") {
      previousMomentum = yesterdayData.momentumScore;
    } else {
      previousMomentum = yesterdayData.rawMomentumScore;
    }
    
    // Get totalRealCheckIns from yesterday
    previousTotalCheckIns = yesterdayData.totalRealCheckIns || 0;
    
    // If yesterday was a gap-fill, search backwards for last real check-in
    if (yesterdayData.checkinType === "gap_fill" && previousTotalCheckIns === 0) {
      // Search backwards up to 30 days to find last real check-in
      for (let i = 2; i <= 30; i++) {
        const lookbackDate = new Date(baseDate);
        lookbackDate.setDate(lookbackDate.getDate() - i);
        const lookbackKey = lookbackDate.toLocaleDateString("en-CA");
        
        const lookbackRef = doc(db, "users", input.email, "momentum", lookbackKey);
        const lookbackSnap = await getDoc(lookbackRef);
        
        if (lookbackSnap.exists()) {
          const lookbackData = lookbackSnap.data();
          if (lookbackData.checkinType === "real" && lookbackData.totalRealCheckIns) {
            previousTotalCheckIns = lookbackData.totalRealCheckIns;
            console.log(`[WriteDailyMomentum] Found last real check-in at ${lookbackKey}: totalRealCheckIns = ${previousTotalCheckIns}`);
            break;
          }
        }
      }
    }
  }
  
  // Increment totalRealCheckIns (this is a real check-in)
  const totalRealCheckIns = previousTotalCheckIns + 1;
  
  // 3. Derive exercise completion
  const { completed: exerciseCompleted, targetMinutes: exerciseTargetMinutes } = 
    await deriveExerciseCompleted(input.email, input.date, input.exerciseDeclared);
  
  // 4. Calculate streak (needed for dampening calculation)
  const streakData = await calculateStreak(input.email, input.date);
  
  // 5. Calculate Newtonian momentum
  const momentumResult = calculateNewtonianMomentum({
    todayScore: dailyScore,
    last4Days: last4Days,
    currentStreak: streakData.currentStreak,
    previousMomentum: previousMomentum,
    totalRealCheckIns: totalRealCheckIns,
    exerciseCompleted: exerciseCompleted
  });
  
  // 6. Apply ramp cap if under 10 check-ins
  let finalMomentumScore = momentumResult.proposedScore;
  let finalMessage = momentumResult.message;
  
  if (totalRealCheckIns <= 9) {
    const { score: cappedScore, message: rampMessage } = applyRampCap(
      momentumResult.proposedScore,
      totalRealCheckIns
    );
    finalMomentumScore = cappedScore;
    if (rampMessage) {
      finalMessage = rampMessage;
    }
  }
  
// Calculate delta - use last REAL momentum, not gap day
let previousRealMomentum = 0;
if (yesterdaySnap.exists()) {
  const yesterdayData = yesterdaySnap.data();
  // If yesterday was a gap-fill, search backwards for last real check-in
  if (yesterdayData.checkinType === "gap_fill") {
    for (let i = 2; i <= 30; i++) {
      const lookbackDate = new Date(baseDate);
      lookbackDate.setDate(lookbackDate.getDate() - i);
      const lookbackKey = lookbackDate.toLocaleDateString("en-CA");
      const lookbackRef = doc(db, "users", input.email, "momentum", lookbackKey);
      const lookbackSnap = await getDoc(lookbackRef);
      if (lookbackSnap.exists() && lookbackSnap.data().checkinType === "real") {
        previousRealMomentum = lookbackSnap.data().momentumScore ?? 0;
        break;
      }
    }
  } else {
    previousRealMomentum = yesterdayData.momentumScore ?? 0;
  }
}

const actualDelta = finalMomentumScore - previousRealMomentum;

let actualTrend: 'up' | 'down' | 'stable' = 'stable';
if (actualDelta > 2) actualTrend = 'up';
if (actualDelta < -2) actualTrend = 'down';
  
  // 7. Return complete document
  return {
    ...merged,
    date: input.date,
    accountAgeDays: input.accountAgeDays,
    totalRealCheckIns: totalRealCheckIns,
    checkinCompleted: true,
    behaviorRatings: input.behaviorRatings || {}, 
    behaviorGrades: input.behaviorGrades,
    
    primary: {
      habitKey: input.currentFocus.habitKey,
      done: false,
    },
    
    stack: {},
    
    foundations: {
      protein: false,
      hydration: false,
      sleep: false,
      nutrition: false,
      movement: false,
    },
    
    dailyScore,
rawMomentumScore: momentumResult.rawScore,
momentumScore: finalMomentumScore,
momentumTrend: actualTrend,
momentumDelta: actualDelta,
momentumMessage: finalMessage,
visualState: "solid",
    
    primaryHabitHit: false,
    stackedHabitsCompleted: 0,
    totalStackedHabits: 0,
    moved: false,
    hydrated: false,
    slept: false,
    nutritionScore: 0,
    
    currentStreak: streakData.currentStreak,
    lifetimeStreak: streakData.lifetimeStreak,
    streakSavers: streakData.streakSavers,
    
    exerciseCompleted,
    exerciseTargetMinutes,
    note: input.note,
    
    checkinType: "real",
    createdAt: merged.createdAt || new Date().toISOString(),
  } as DailyMomentumDoc;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function writeDailyMomentum(
  input: WriteDailyMomentumInput
): Promise<{ doc: DailyMomentumDoc; reward: RewardResult }> {
  console.log("[WriteDailyMomentum] Starting for date:", input.date);
  
  try {
    const defaults = buildDefaults(input);
    const merged = await mergeWithExisting(input.email, input.date, defaults);
    
    // Get last 4 days for rolling average
    const last4Days: number[] = [];
    const baseDate = new Date(input.date + "T00:00:00");
    
    for (let i = 1; i <= 4; i++) { 
      const lookbackDate = new Date(baseDate);
      lookbackDate.setDate(lookbackDate.getDate() - i);
      const dateKey = lookbackDate.toLocaleDateString("en-CA");
      
      const dayRef = doc(db, "users", input.email, "momentum", dateKey);
      const daySnap = await getDoc(dayRef);
      
      if (daySnap.exists() && daySnap.data().dailyScore !== undefined) {
        last4Days.unshift(daySnap.data().dailyScore);
      }
    }
    
    const finalDoc = await calculateDerivedFields(input, merged, last4Days);
    
    if (!validateStructure(finalDoc)) {
      throw new Error("Document validation failed");
    }
    
    const docRef = doc(db, "users", input.email, "momentum", input.date);
await setDoc(docRef, finalDoc);

// ===== REWARD ENGINE INTEGRATION =====

// Get milestone state
const milestoneState = await getMilestoneState(input.email);

// Calculate days since last check-in
const daysSinceLastCheckin = await getDaysSinceLastCheckin(input.email, input.date);

// Calculate if this is a solid day
const isSolid = isSolidDay(
  input.behaviorRatings || {},
  finalDoc.exerciseCompleted
);

// Get previous momentum for reward context
const yesterday = new Date(input.date + "T00:00:00");
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayKey = yesterday.toLocaleDateString("en-CA");
const yesterdayRef = doc(db, "users", input.email, "momentum", yesterdayKey);
const yesterdaySnap = await getDoc(yesterdayRef);

const previousMomentum = yesterdaySnap.exists() 
  ? (yesterdaySnap.data().momentumScore || 0)
  : 0;

// Build reward context
const rewardContext: RewardContext = {
  momentum: finalDoc.momentumScore,
  previousMomentum: previousMomentum,
  consecutiveDays: finalDoc.currentStreak,
  maxConsecutiveDaysEver: milestoneState.maxConsecutiveDaysEver,
  hasEverHitSolidMomentum: milestoneState.hasEverHitSolidMomentum,
  daysSinceLastCheckin,
  isSolidDay: isSolid,
};

// Resolve reward
const reward = resolveReward(rewardContext);

// Update milestone state if needed
if (reward.stateUpdates) {
  await updateMilestoneState(input.email, reward.stateUpdates);
  
  console.log("[WriteDailyMomentum] Milestone state updated:", reward.stateUpdates);
}

console.log(
  "[WriteDailyMomentum] Success:", 
  finalDoc.date, 
  `${finalDoc.momentumScore}% ${finalDoc.momentumTrend === 'up' ? '↑' : finalDoc.momentumTrend === 'down' ? '↓' : '→'}`,
  `(Check-in #${finalDoc.totalRealCheckIns})`,
  `Exercise: ${finalDoc.exerciseCompleted ? 'Yes' : 'No'}`,
  reward.event ? `Reward: ${reward.event}` : 'No reward'
);

return { doc: finalDoc, reward };
    
  } catch (error) {
    console.error("[WriteDailyMomentum] Error:", error);
    throw error;
  }
}