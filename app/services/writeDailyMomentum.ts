/**
 * DAILY MOMENTUM WRITER
 * 
 * Single source of truth for writing daily momentum documents.
 * This is the most critical function in Nelson - everything depends on this being perfect.
 * 
 * Guarantees:
 * - All fields always exist with proper defaults
 * - Idempotent (can be called multiple times safely)
 * - Sanitized input (no undefined/null leaks)
 * - Validated structure before write
 * - Complete momentum calculation
 */

import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { calculateDailyMomentumScore } from "@/app/utils/momentumCalculation";

// ============================================================================
// CANONICAL SCHEMA
// ============================================================================

export interface DailyMomentumDoc {
  date: string; // YYYY-MM-DD
  behaviorRatings?: Record<string, string>;  // User's actual answers (elite/solid/not_great/off)
  behaviorGrades?: { name: string; grade: number }[];  // Computed grades (100/80/50/0)
  // Structured habit data
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
  
  // Scores and metrics
  dailyScore: number;
  rawMomentumScore: number;
  momentumScore: number;
  momentumMessage: string;
  visualState: "solid" | "outline" | "empty";
  
  // Tracking fields
  primaryHabitHit: boolean;
  stackedHabitsCompleted: number;
  totalStackedHabits: number;
  moved: boolean;
  hydrated: boolean;
  slept: boolean;
  nutritionScore: number;
  
  // Streaks
  currentStreak: number;
  lifetimeStreak: number;
  streakSavers: number;

  // First check-in flag
  isFirstCheckIn?: boolean;
  
  // Meta
  checkinType: "real" | "streak_saver";
  createdAt: string;
}

export interface WriteDailyMomentumInput {
  email: string;
  date: string;
  
  // NEW: Behavior grades (replaces checkin)
  behaviorGrades: { name: string; grade: number }[];
  behaviorRatings?: Record<string, string>;  // NEW: Store actual user ratings
  
  // Context
  currentFocus: {
    habitKey: string;
    habit: string;
  };
  habitStack: Array<{
    habitKey: string;
    habit: string;
  }>;
  
  // Optional
  goal?: string;
  accountAgeDays: number;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Build default document with all fields populated
 */
function buildDefaults(input: WriteDailyMomentumInput): Partial<DailyMomentumDoc> {
  return {
    date: input.date,
    
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
    
    checkinType: "real",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Merge with existing document if present (idempotency)
 */
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
  
  // Preserve streak data if it exists
  return {
    ...defaults,
    currentStreak: existing.currentStreak ?? defaults.currentStreak,
    lifetimeStreak: existing.lifetimeStreak ?? defaults.lifetimeStreak,
    streakSavers: existing.streakSavers ?? defaults.streakSavers,
    isFirstCheckIn: existing.isFirstCheckIn ?? false,
  };
}

/**
 * Validate structure - ensure all required fields exist
 */
function validateStructure(doc: Partial<DailyMomentumDoc>): boolean {
  // Critical fields must exist
  if (!doc.date || !doc.primary || !doc.foundations || !doc.checkinType) {
    console.error("[WriteDailyMomentum] Missing critical fields:", doc);
    return false;
  }
  
  // Primary must have habitKey and done
  if (!doc.primary.habitKey || doc.primary.done === undefined) {
    console.error("[WriteDailyMomentum] Invalid primary structure:", doc.primary);
    return false;
  }
  
  return true;
}

/**
 * Calculate streak based on yesterday's momentum
 */
async function calculateStreak(email: string, date: string): Promise<{
  currentStreak: number;
  lifetimeStreak: number;
  streakSavers: number;
}> {
  // Parse today's date
  const today = new Date(date + "T00:00:00");
  
  // Get yesterday's date
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("en-CA");
  
  // Check yesterday's momentum
  const yesterdayRef = doc(db, "users", email, "momentum", yesterdayKey);
  const yesterdaySnap = await getDoc(yesterdayRef);
  
  // Get streak savers from metadata
  const streakRef = doc(db, "users", email, "metadata", "streakData");
  const streakSnap = await getDoc(streakRef);
  const streakSavers = streakSnap.exists() ? (streakSnap.data().streakSavers || 3) : 3;
  
  if (yesterdaySnap.exists()) {
    // Yesterday exists - increment streak
    const yesterdayData = yesterdaySnap.data();
    const currentStreak = (yesterdayData.currentStreak || 0) + 1;
    const lifetimeStreak = Math.max(currentStreak, yesterdayData.lifetimeStreak || 0);
    
    return { currentStreak, lifetimeStreak, streakSavers };
  } else {
    // No yesterday - start fresh at day 1
    return { currentStreak: 1, lifetimeStreak: 1, streakSavers };
  }
}

/**
 * Apply momentum cap based on account age (14-day ramp)
 */
/**
 * Apply momentum cap based on account age (10-day ramp)
 */
function applyMomentumCap(rawScore: number, accountAgeDays: number): { score: number; message: string } {
  let cappedScore: number;
  let message: string;
  
  if (accountAgeDays <= 2) {
    cappedScore = Math.round(rawScore * 0.40);
    message = "Building a foundation";
  } else if (accountAgeDays <= 5) {
    cappedScore = Math.round(rawScore * 0.60);
    message = "Finding your rhythm";
  } else if (accountAgeDays <= 9) {
    cappedScore = Math.round(rawScore * 0.80);
    message = "Momentum is forming";
  } else {
    // Full unlock at day 10
    cappedScore = rawScore;
    if (rawScore >= 80) message = "On fire 🔥🔥";
    else if (rawScore >= 70) message = "Heating up 🔥";
    else if (rawScore >= 50) message = "Gaining traction";
    else if (rawScore >= 30) message = "Resetting your pace";
    else message = "Every day is a fresh start";
  }
  
  return { score: cappedScore, message };
}

/**
 * Calculate all derived fields (momentum score, visual state, etc)
 */
async function calculateDerivedFields(
  input: WriteDailyMomentumInput,
  merged: Partial<DailyMomentumDoc>,
  last7Days: number[]
): Promise<DailyMomentumDoc> {
  
  // Calculate momentum score using behavior grades
  const momentumResult = calculateDailyMomentumScore(input.behaviorGrades);
  const dailyScore = momentumResult.score;
  
  // Calculate 3-day rolling average
  const allScores = [...last7Days, dailyScore].filter(s => s !== undefined);
  const rawMomentumScore = allScores.length > 0
    ? Math.round(allScores.reduce((sum, s) => sum + s, 0) / allScores.length)
    : 0;
  
  // Apply momentum cap based on account age
  const { score: momentumScore, message: momentumMessage } = applyMomentumCap(
    rawMomentumScore,
    input.accountAgeDays
  );
  
  // Calculate streak
  const streakData = await calculateStreak(input.email, input.date);
  
  // Return complete document (simplified - no foundations tracking for now)
  return {
    ...merged,
    date: input.date,
    behaviorRatings: input.behaviorRatings,
    behaviorGrades: input.behaviorGrades,
    primary: {
      habitKey: input.currentFocus.habitKey,
      done: false, // Will be tracked via workout sessions later
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
    rawMomentumScore,
    momentumScore,
    momentumMessage,
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
    
    checkinType: "real",
    createdAt: merged.createdAt || new Date().toISOString(),
  } as DailyMomentumDoc;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Write a complete daily momentum document
 * 
 * This is the ONLY way to write daily momentum docs in the app.
 * All fields are guaranteed to exist with proper defaults.
 */
export async function writeDailyMomentum(
  input: WriteDailyMomentumInput
): Promise<DailyMomentumDoc> {
  console.log("[WriteDailyMomentum] Starting for date:", input.date);
  
  try {
    // 1. Build defaults
    const defaults = buildDefaults(input);
    
    // 2. Merge with existing document
    const merged = await mergeWithExisting(input.email, input.date, defaults);
    
 // 4. Get last 5 days for rolling average
const last7Days: number[] = []; // TODO: rename to lastDays

// Parse the input date to get a proper Date object in local time
const baseDate = new Date(input.date + "T00:00:00");

for (let i = 1; i <= 4; i++) { 
      // Calculate relative to the input date, not "today"
      const lookbackDate = new Date(baseDate);
      lookbackDate.setDate(lookbackDate.getDate() - i);
      const dateKey = lookbackDate.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
      
      const dayRef = doc(db, "users", input.email, "momentum", dateKey);
      const daySnap = await getDoc(dayRef);
      
      if (daySnap.exists() && daySnap.data().dailyScore !== undefined) {
        last7Days.push(daySnap.data().dailyScore);
      }
    }
    
    // 4. Calculate all derived fields
    const finalDoc = await calculateDerivedFields(input, merged, last7Days);
    
    // 5. Validate structure
    if (!validateStructure(finalDoc)) {
      throw new Error("Document validation failed");
    }
    
    // 6. Write to Firestore
    const docRef = doc(db, "users", input.email, "momentum", input.date);
    await setDoc(docRef, finalDoc);
    
    console.log("[WriteDailyMomentum] Success:", finalDoc.date, finalDoc.momentumScore);
    
    return finalDoc;
    
  } catch (error) {
    console.error("[WriteDailyMomentum] Error:", error);
    throw error;
  }
}