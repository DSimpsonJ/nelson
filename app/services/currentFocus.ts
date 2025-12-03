/**
 * CURRENT FOCUS SERVICE
 * 
 * Single source of truth for managing the user's primary habit focus.
 * This is a critical piece - if currentFocus becomes inconsistent, 
 * eligibility checking, level-ups, and momentum tracking all break.
 * 
 * Five core functions:
 * 1. getCurrentFocus() - Read current focus
 * 2. setCurrentFocus() - Write complete focus (raw)
 * 3. updateLevel() - Handle level-ups
 * 4. switchPrimaryFocus() - Move to new habit
 * 5. ensureFocusIsValid() - Validate and repair if needed
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { isGrowthHabit, getNextLevel as getNextLevelMinutes, extractMinutes } from "@/app/utils/habitConfig";
import { getLocalDate } from "@/app/utils/date";

// ============================================================================
// CANONICAL INTERFACE
// ============================================================================

export interface CurrentFocus {
    habitKey: string;           // e.g., "movement"
    habit: string;              // e.g., "Walk 10 minutes"
    level?: number;             // Current level (1-based index) - optional for legacy
    target?: number;            // Target value (e.g., 10 minutes) - optional for legacy
    startedAt: string;          // Date focus began (YYYY-MM-DD)
    lastLevelUpAt?: string | null;  // Last level-up date or null - optional for legacy
    consecutiveDays?: number;   // Legacy - can be removed later
    eligibleForLevelUp?: boolean;  // Legacy - can be removed later
  }

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * 1. GET CURRENT FOCUS
 * 
 * Load the user's current primary habit focus.
 * Returns null if not set (user needs to complete onboarding).
 */
export async function getCurrentFocus(email: string): Promise<CurrentFocus | null> {
  const focusRef = doc(db, "users", email, "momentum", "currentFocus");
  const focusSnap = await getDoc(focusRef);
  
  if (!focusSnap.exists()) {
    return null;
  }
  
  const data = focusSnap.data();
  
  // Validate shape
  if (!data.habitKey || !data.habit || data.level === undefined) {
    console.error("[CurrentFocus] Malformed focus document:", data);
    return null;
  }
  
  return {
    habitKey: data.habitKey,
    habit: data.habit,
    level: data.level,
    target: data.target,
    startedAt: data.startedAt,
    lastLevelUpAt: data.lastLevelUpAt || null,
    consecutiveDays: data.consecutiveDays,
    eligibleForLevelUp: data.eligibleForLevelUp,
  };
}

/**
 * 2. SET CURRENT FOCUS (Raw Write)
 * 
 * Overwrite the entire currentFocus document.
 * Use this for initial setup or when you have a complete focus object.
 */
export async function setCurrentFocus(email: string, focus: CurrentFocus): Promise<void> {
  const focusRef = doc(db, "users", email, "momentum", "currentFocus");
  
  // Validate before writing
  if (!isGrowthHabit(focus.habitKey)) {
    throw new Error(`Cannot set ${focus.habitKey} as primary - not a growth habit`);
  }
  
  await setDoc(focusRef, {
    habitKey: focus.habitKey,
    habit: focus.habit,
    level: focus.level,
    target: focus.target,
    startedAt: focus.startedAt,
    lastLevelUpAt: focus.lastLevelUpAt,
    consecutiveDays: focus.consecutiveDays || 0,
    eligibleForLevelUp: focus.eligibleForLevelUp || false,
  });
  
  console.log("[CurrentFocus] Set focus:", focus.habitKey, "level", focus.level);
}

/**
 * 3. UPDATE LEVEL (Level-Up Handler)
 * 
 * Called when user accepts a level-up.
 * Increments level, updates target, sets lastLevelUpAt.
 */
export async function updateLevel(email: string): Promise<CurrentFocus> {
    const currentFocus = await getCurrentFocus(email);
    
    if (!currentFocus) {
      throw new Error("Cannot update level - no current focus");
    }
    
    // SAFETY: Ensure all required fields exist (auto-repair legacy data)
    if (!currentFocus.level || !currentFocus.target) {
      console.warn("[CurrentFocus] Missing fields detected, auto-repairing...");
      await ensureFocusIsValid(email);
      
      // Re-fetch after repair
      const repairedFocus = await getCurrentFocus(email);
      if (!repairedFocus || !repairedFocus.level || !repairedFocus.target) {
        throw new Error("Cannot update level - focus repair failed");
      }
      
      // Use repaired focus
return updateLevelInternal(email, repairedFocus as Required<CurrentFocus>);
}
    
return updateLevelInternal(email, currentFocus as Required<CurrentFocus>);
}
  
  // Internal function that assumes valid focus
  async function updateLevelInternal(email: string, currentFocus: Required<CurrentFocus>): Promise<CurrentFocus> {
    // Get next level minutes
    const nextMinutes = getNextLevelMinutes(currentFocus.habitKey);
    
    if (nextMinutes === null) {
      throw new Error(`No next level available for ${currentFocus.habitKey}`);
    }
    
    const today = getLocalDate();
    
    // Build new habitKey (e.g., walk_12min -> walk_15min)
    const nextHabitKey = `walk_${nextMinutes}min`;
    const nextHabit = `Walk ${nextMinutes} minutes`;
    
    const updatedFocus: CurrentFocus = {
      ...currentFocus,
      habitKey: nextHabitKey,
      habit: nextHabit,
      level: currentFocus.level + 1,
      target: nextMinutes,
      lastLevelUpAt: today,
      consecutiveDays: 0,
      eligibleForLevelUp: false,
    };
    
    await setCurrentFocus(email, updatedFocus as Required<CurrentFocus>);
    
    console.log("[CurrentFocus] Leveled up:", updatedFocus.habitKey, "to level", updatedFocus.level);
    
    return updatedFocus;
  }

/**
 * 4. SWITCH PRIMARY FOCUS
 * 
 * Called when user chooses "Choose Different" habit.
 * Moves current focus to stack, creates new focus at level 1.
 */
export async function switchPrimaryFocus(
  email: string, 
  newHabitKey: string,
  moveToStack: (email: string, habit: CurrentFocus) => Promise<void>
): Promise<CurrentFocus> {
  
  // Validate new habit is a growth habit
  if (!isGrowthHabit(newHabitKey)) {
    throw new Error(`Cannot switch to ${newHabitKey} - not a growth habit`);
  }
  
  // Get current focus to move to stack
  const currentFocus = await getCurrentFocus(email);
  
  if (currentFocus) {
    // Move current to stack
    await moveToStack(email, currentFocus);
  }
  
  const today = getLocalDate();
  
  // For movement habits, start at walk_10min (level 1)
  const startHabitKey = "walk_10min";
  const startHabit = "Walk 10 minutes";
  
  // Create new focus starting at level 1
  const newFocus: CurrentFocus = {
    habitKey: startHabitKey,
    habit: startHabit,
    level: 1,
    target: 10,
    startedAt: today,
    lastLevelUpAt: null,
    consecutiveDays: 0,
    eligibleForLevelUp: false,
  };
  
  await setCurrentFocus(email, newFocus);
  
  console.log("[CurrentFocus] Switched to:", startHabitKey);
  
  return newFocus;
}

/**
 * 5. ENSURE FOCUS IS VALID
 * 
 * Run before critical operations (check-in, eligibility checks).
 * Validates and repairs focus if needed.
 * Returns true if valid, false if missing/unfixable.
 */
export async function ensureFocusIsValid(email: string): Promise<boolean> {
    const currentFocus = await getCurrentFocus(email);
    
    // No focus at all - user needs onboarding
    if (!currentFocus) {
      console.warn("[CurrentFocus] No focus document found");
      return false;
    }
    
    let needsRepair = false;
    const repairs: string[] = [];
    
    // Check 1: Is habitKey a growth habit?
    if (!isGrowthHabit(currentFocus.habitKey)) {
      console.error("[CurrentFocus] habitKey is not a growth habit:", currentFocus.habitKey);
      return false; // Can't auto-fix this
    }
    
    // Check 2: Can we extract minutes from habitKey?
    const currentMinutes = extractMinutes(currentFocus.habitKey);
    if (currentMinutes === null) {
      console.error("[CurrentFocus] Cannot extract minutes from habitKey:", currentFocus.habitKey);
      return false; // Can't auto-fix this
    }
    
    // AUTO-REPAIR: Missing level field (legacy data)
    if (currentFocus.level === undefined || currentFocus.level === null) {
      // Calculate level from habitKey
      const ladder = [10, 12, 15, 20, 25, 30];
      const levelIndex = ladder.indexOf(currentMinutes as any);
      currentFocus.level = levelIndex >= 0 ? levelIndex + 1 : 1;
      repairs.push(`level missing → ${currentFocus.level}`);
      needsRepair = true;
    }
    
    // AUTO-REPAIR: Missing target field (legacy data)
    if (currentFocus.target === undefined || currentFocus.target === null) {
      currentFocus.target = currentMinutes;
      repairs.push(`target missing → ${currentMinutes}`);
      needsRepair = true;
    }
    
    // AUTO-REPAIR: Missing lastLevelUpAt field (legacy data)
    if (currentFocus.lastLevelUpAt === undefined) {
      currentFocus.lastLevelUpAt = null;
      repairs.push(`lastLevelUpAt missing → null`);
      needsRepair = true;
    }
    
    // Check 3: Does target match habitKey?
    if (currentFocus.target !== currentMinutes) {
      repairs.push(`target ${currentFocus.target} → ${currentMinutes}`);
      currentFocus.target = currentMinutes;
      needsRepair = true;
    }
    
    // Check 4: Does habit description match?
    const expectedHabit = `Walk ${currentMinutes} minutes`;
    if (currentFocus.habit !== expectedHabit) {
      repairs.push(`habit description updated`);
      currentFocus.habit = expectedHabit;
      needsRepair = true;
    }
    
    // Apply repairs if needed
    if (needsRepair) {
      console.warn("[CurrentFocus] Auto-repaired focus:", repairs.join(", "));
      await setCurrentFocus(email, currentFocus as Required<CurrentFocus>);
    }
    
    return true;
  }

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the habit name for display from habitKey
 */
export function getHabitName(habitKey: string): string {
  const minutes = extractMinutes(habitKey);
  if (minutes) {
    return `Walk ${minutes} minutes`;
  }
  return habitKey;
}

/**
 * Check if user is at max level for their current habit
 */
export async function isAtMaxLevel(email: string): Promise<boolean> {
  const currentFocus = await getCurrentFocus(email);
  if (!currentFocus) return false;
  
  const nextLevel = getNextLevelMinutes(currentFocus.habitKey);
  return nextLevel === null;
}