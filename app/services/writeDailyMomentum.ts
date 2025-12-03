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
import { calculateDailyMomentumScore, determinePrimaryHabitHit } from "@/app/utils/momentumCalculation";
import { getDayVisualState } from "@/app/utils/history/getDayVisualState";
import { getLocalDateOffset, parseLocalDate } from "@/app/utils/date";

// getHabitType helper - inline since it's not exported
function getHabitType(habitKey: string): string {
  if (habitKey.includes("walk_") || habitKey.includes("movement_")) return "movement";
  if (habitKey.includes("protein_")) return "protein";
  if (habitKey.includes("hydration_")) return "hydration";
  if (habitKey.includes("sleep_")) return "sleep";
  if (habitKey === "no_late_eating") return "eating_pattern";
  return "custom";
}

// calculateNutritionScore helper - inline
function calculateNutritionScore(energyBalance: string, eatingPattern: string, goal: string): number {
  let score = 0;
  
  if (goal === "fat_loss") {
    if (energyBalance === "light") score += 6;
    else if (energyBalance === "normal") score += 6;
    else if (energyBalance === "heavy") score += 3;
    
    if (eatingPattern === "meals") score += 6;
    else if (eatingPattern === "mixed") score += 3;
  }
  
  return score;
}

// ============================================================================
// CANONICAL SCHEMA
// ============================================================================

export interface DailyMomentumDoc {
  date: string; // YYYY-MM-DD
  
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
  
  // Meta
  checkinType: "real" | "streak_saver";
  createdAt: string;
}

export interface WriteDailyMomentumInput {
  email: string;
  date: string;
  
  // Check-in form data
  checkin: {
    headspace: string;
    proteinHit: string;
    hydrationHit: string;
    movedToday: string;
    sleepHit: string;
    energyBalance: string;
    eatingPattern: string;
    primaryHabitDuration?: string;
    note?: string;
  };
  
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
  sessionData?: {
    hasSessionToday: boolean;
    todaySession?: { durationMin: number };
    targetMinutes: number;
  } | undefined;
  
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
 * Sanitize user input - convert to proper types, handle edge cases
 */
function sanitizeInput(input: WriteDailyMomentumInput) {
  return {
    ...input,
    checkin: {
      ...input.checkin,
      proteinHit: (input.checkin.proteinHit === "yes" ? "yes" : "no") as "yes" | "no",
      hydrationHit: (input.checkin.hydrationHit === "yes" ? "yes" : "no") as "yes" | "no",
      movedToday: (input.checkin.movedToday === "yes" ? "yes" : "no") as "yes" | "no",
      sleepHit: (input.checkin.sleepHit === "yes" ? "yes" : "no") as "yes" | "no",
      note: input.checkin.note?.trim() || "",
    },
    habitStack: input.habitStack || [],
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
 * Calculate all derived fields (momentum score, visual state, etc)
 */
async function calculateDerivedFields(
  input: WriteDailyMomentumInput,
  merged: Partial<DailyMomentumDoc>,
  last7Days: number[]
): Promise<DailyMomentumDoc> {
  const sanitized = sanitizeInput(input);
  
  // Basic boolean conversions
  const moved = sanitized.checkin.movedToday === "yes";
  const hydrated = sanitized.checkin.hydrationHit === "yes";
  const slept = sanitized.checkin.sleepHit === "yes";
  const proteinHit = sanitized.checkin.proteinHit === "yes";
  
  // Calculate nutrition score
  const nutritionScore = calculateNutritionScore(
    sanitized.checkin.energyBalance,
    sanitized.checkin.eatingPattern,
    sanitized.goal || "fat_loss"
  );
  
  // Determine if primary habit was hit
  const primaryHabitHit = determinePrimaryHabitHit({
    habitKey: sanitized.currentFocus.habitKey,
    checkinData: {
      proteinHit: sanitized.checkin.proteinHit,
      hydrationHit: sanitized.checkin.hydrationHit,
      movedToday: sanitized.checkin.movedToday,
      sleepHit: sanitized.checkin.sleepHit,
    },
    sessionData: sanitized.sessionData || {
      hasSessionToday: false,
      todaySession: undefined,
      targetMinutes: 0,
    },
    nutritionScore,
  });
  
  // Build primary result
  const primaryResult = {
    name: sanitized.currentFocus.habitKey,
    hit: primaryHabitHit,
  };
  
  // Build stacked results
  const stackedResults = sanitized.habitStack.map(h => {
    let hit = false;
    const habitType = getHabitType(h.habitKey);
    
    switch (habitType) {
      case "movement":
        hit = moved;
        break;
      case "hydration":
        hit = hydrated;
        break;
      case "protein":
        hit = proteinHit;
        break;
      case "sleep":
        hit = slept;
        break;
      case "eating_pattern":
        hit = nutritionScore >= 9;
        break;
      default:
        hit = false;
    }
    
    return { name: h.habit, hit };
  });
  
  // Build stack object for storage
  const stackObj = stackedResults.reduce((acc, s) => {
    acc[s.name] = { done: s.hit };
    return acc;
  }, {} as Record<string, { done: boolean }>);
  
  // Count stack completions
  const stackedHabitsCompleted = stackedResults.filter(s => s.hit).length;
  const totalStackedHabits = stackedResults.length;
  
  // Build generic behaviors (exclude primary and stack)
  const genericResults = [];
  const primaryType = getHabitType(sanitized.currentFocus.habitKey);
  const stackTypes = sanitized.habitStack.map(h => getHabitType(h.habitKey));
  
  if (primaryType !== "hydration" && !stackTypes.includes("hydration")) {
    genericResults.push({ name: "Hydration", hit: hydrated });
  }
  if (primaryType !== "movement" && !stackTypes.includes("movement")) {
    genericResults.push({ name: "Bonus Movement", hit: moved });
  }
  if (primaryType !== "protein" && !stackTypes.includes("protein")) {
    genericResults.push({ name: "Protein", hit: proteinHit });
  }
  if (primaryType !== "sleep" && !stackTypes.includes("sleep")) {
    genericResults.push({ name: "Sleep", hit: slept });
  }
  genericResults.push({ name: "Nutrition", hit: nutritionScore >= 9 });
  
  // Calculate momentum score
  const momentumResult = calculateDailyMomentumScore({
    primaryResult,
    stackedResults,
    genericResults,
  });
  
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
  
  // Calculate visual state
  const visualState = getDayVisualState(primaryHabitHit, {
    nutrition: nutritionScore >= 9,
    sleep: slept,
    hydration: hydrated,
    movement: moved,
  });
  
  // Return complete document
  return {
    ...merged,
    date: sanitized.date,
    
    primary: {
      habitKey: sanitized.currentFocus.habitKey,
      done: primaryHabitHit,
    },
    
    stack: stackObj,
    
    foundations: {
      protein: proteinHit,
      hydration: hydrated,
      sleep: slept,
      nutrition: nutritionScore >= 9,
      movement: moved,
    },
    
    dailyScore,
    rawMomentumScore,
    momentumScore,
    momentumMessage,
    visualState,
    
    primaryHabitHit,
    stackedHabitsCompleted,
    totalStackedHabits,
    moved,
    hydrated,
    slept,
    nutritionScore,
    
    currentStreak: merged.currentStreak || 0,
    lifetimeStreak: merged.lifetimeStreak || 0,
    streakSavers: merged.streakSavers || 0,
    
    checkinType: "real",
    createdAt: merged.createdAt || new Date().toISOString(),
  } as DailyMomentumDoc;
}

/**
 * Apply momentum cap based on account age (14-day ramp)
 */
function applyMomentumCap(rawScore: number, accountAgeDays: number): { score: number; message: string } {
  // Import from your existing momentum utils or inline it here
  // For now, simplified version:
  if (accountAgeDays <= 3) {
    const cap = Math.min(rawScore, 30);
    return { score: cap, message: "Building a foundation" };
  } else if (accountAgeDays <= 7) {
    const cap = Math.min(rawScore, 50);
    return { score: cap, message: "Finding your rhythm" };
  } else if (accountAgeDays <= 14) {
    const cap = Math.min(rawScore, 65);
    return { score: cap, message: "Momentum is forming" };
  } else {
    // Full unlock - context-aware messaging
    if (rawScore >= 80) return { score: rawScore, message: "On fire 🔥🔥" };
    if (rawScore >= 70) return { score: rawScore, message: "Heating up 🔥" };
    if (rawScore >= 50) return { score: rawScore, message: "Gaining traction" };
    if (rawScore >= 30) return { score: rawScore, message: "Resetting your pace" };
    return { score: rawScore, message: "Every day is a fresh start" };
  }
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
    
    // 2. Sanitize input
    const sanitized = sanitizeInput(input);
    
    // 3. Merge with existing document
    const merged = await mergeWithExisting(input.email, input.date, defaults);
    
    // 4. Get last 7 days for rolling average
const last7Days: number[] = [];

// Parse the input date to get a proper Date object in local time
const baseDate = new Date(input.date + "T00:00:00"); // Force local midnight

for (let i = 1; i <= 6; i++) {
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
    
    // 5. Calculate all derived fields
    const finalDoc = await calculateDerivedFields(sanitized, merged, last7Days);
    
    // 6. Validate structure
    if (!validateStructure(finalDoc)) {
      throw new Error("Document validation failed");
    }
    
    // 7. Write to Firestore
    const docRef = doc(db, "users", input.email, "momentum", input.date);
    await setDoc(docRef, finalDoc);
    
    console.log("[WriteDailyMomentum] Success:", finalDoc.date, finalDoc.momentumScore);
    
    return finalDoc;
    
  } catch (error) {
    console.error("[WriteDailyMomentum] Error:", error);
    throw error;
  }
}