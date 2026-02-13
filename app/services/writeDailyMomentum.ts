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
import { findLastRealCheckin, getLastRealValue } from "@/app/utils/findLastRealCheckin";
// Helper to check if this completes a solid week
async function checkSolidWeek(
  email: string, 
  todayDate: string, 
  todayRatings: Record<string, string>,
  todayExerciseCompleted: boolean
): Promise<boolean> {
  // Check if today is solid
  const requiredBehaviors = [
    'nutrition_quality',
    'portion_control',
    'protein',
    'hydration',
    'sleep',
    'mindset',
    'movement'
  ];
  
  const todayIsSolid = requiredBehaviors.every(id => {
    const rating = todayRatings[id];
    return rating === 'elite' || rating === 'solid';
  }) && todayExerciseCompleted;
  
  if (!todayIsSolid) return false;
  
  // Check previous 6 days
  const today = new Date(todayDate + "T00:00:00");
  
  for (let i = 1; i <= 6; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateKey = checkDate.toLocaleDateString("en-CA");
    
    const dayRef = doc(db, "users", email, "momentum", dateKey);
    const daySnap = await getDoc(dayRef);
    
    if (!daySnap.exists()) return false;
    
    const dayData = daySnap.data();
    
    // Skip gap-fill days
    if (dayData.checkinType === "gap_fill") return false;
    
    // Check if day was solid
    const dayIsSolid = requiredBehaviors.every(id => {
      const rating = dayData.behaviorRatings?.[id];
      return rating === 'elite' || rating === 'solid';
    }) && dayData.exerciseCompleted;
    
    if (!dayIsSolid) return false;
  }
  
  return true;
}
// ============================================================================
// CANONICAL SCHEMA
// ============================================================================

export interface DailyMomentumDoc {
  date: string; // YYYY-MM-DD
  accountAgeDays: number;
  totalRealCheckIns: number;
  checkinCompleted: boolean;
  missed?: boolean;
  gapResolved?: boolean;              // Gap reconciliation status
  gapExerciseCompleted?: boolean;     // User's answer for gap day exercise
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
    
    previousTotalCheckIns = yesterdayData.totalRealCheckIns || 0;

    // If yesterday was a gap-fill, search backwards for last real check-in
    if (yesterdayData.checkinType === "gap_fill" && previousTotalCheckIns === 0) {
      previousTotalCheckIns = await getLastRealValue(
        input.email,
        yesterdayKey,
        "totalRealCheckIns",
        0
      );
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
  // Apply exercise gate - momentum can't increase without exercise
if (input.exerciseDeclared === false) {
  const yesterdayMomentum = yesterdaySnap.exists() 
    ? (yesterdaySnap.data().momentumScore || 0) 
    : 0;
  
  if (finalMomentumScore > yesterdayMomentum) {
    finalMomentumScore = yesterdayMomentum;
  }
}
// Calculate delta - use last REAL momentum, not gap day
let previousRealMomentum = 0;
if (yesterdaySnap.exists()) {
  const yesterdayData = yesterdaySnap.data();
  
  if (yesterdayData.checkinType === "gap_fill") {
    // Search backwards for last real momentum value
    previousRealMomentum = await getLastRealValue(
      input.email,
      yesterdayKey,
      "momentumScore",
      0
    );
  } else {
    previousRealMomentum = yesterdayData.momentumScore ?? 0;
  }
}

const actualDelta = finalMomentumScore - previousRealMomentum;

let actualTrend: 'up' | 'down' | 'stable' = 'stable';
if (actualDelta > 2) actualTrend = 'up';
if (actualDelta < -2) actualTrend = 'down';
  
  // 7. Return complete document
  const finalDocBase = {
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
    
    
    dailyScore,
    rawMomentumScore: momentumResult.rawScore,
    momentumScore: finalMomentumScore,
    momentumTrend: actualTrend,
    momentumDelta: actualDelta,
    momentumMessage: finalMessage,
    visualState: "solid" as const,
    
    currentStreak: streakData.currentStreak,
    lifetimeStreak: streakData.lifetimeStreak,
    streakSavers: streakData.streakSavers,
    
    exerciseCompleted,
    exerciseTargetMinutes,
    
    checkinType: "real" as const,
    createdAt: merged.createdAt || new Date().toISOString(),
  };

  // Conditionally add note only if it exists and has content
  const finalDoc = {
    ...finalDocBase,
    ...(input.note && input.note.trim() !== "" ? { note: input.note } : {})
  } as DailyMomentumDoc;

  return finalDoc;
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
      
      // Skip gap-fill days - they don't participate in velocity calculation
      if (daySnap.exists() && daySnap.data().checkinType !== "gap_fill" && daySnap.data().dailyScore !== undefined) {
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

// Get milestone state for first-time momentum tracking
const milestoneState = await getMilestoneState(input.email);

// Calculate if this is a perfect day (all behaviors elite + exercise)
const isPerfectDay = input.behaviorRatings 
  ? Object.values(input.behaviorRatings).every(rating => rating === 'elite') && finalDoc.exerciseCompleted
  : false;

// Calculate if this completes a solid week (7 consecutive days, all behaviors solid+ each day)
const isSolidWeek = await checkSolidWeek(input.email, input.date, input.behaviorRatings || {}, finalDoc.exerciseCompleted);

// Build reward context
const rewardContext: RewardContext = {
  totalRealCheckIns: finalDoc.totalRealCheckIns,
  momentum: finalDoc.momentumScore,
  hasEverHit80Momentum: milestoneState.hasEverHit80Momentum || false,
  hasEverHit90Momentum: milestoneState.hasEverHit90Momentum || false,
  hasEverHit100Momentum: milestoneState.hasEverHit100Momentum || false,
  isPerfectDay,
  isSolidWeek,
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