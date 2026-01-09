/**
 * MILESTONE STATE MANAGEMENT
 * 
 * Manages persistent state for milestone tracking in Firestore.
 * This state tracks "first time only" celebrations and lifetime records.
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export interface MilestoneState {
  hasEverHitSolidMomentum: boolean;
  maxConsecutiveDaysEver: number;
  lastCelebrationDate: string | null;
  celebrationHistory: {
    solid_threshold_crossed?: string; // ISO date when first achieved
    pattern_confirmed_30?: string;
    pattern_maintained_30?: string[]; // array of dates for each 30-day block
  };
}

const DEFAULT_STATE: MilestoneState = {
  hasEverHitSolidMomentum: false,
  maxConsecutiveDaysEver: 0,
  lastCelebrationDate: null,
  celebrationHistory: {},
};

/**
 * Get milestone state for a user
 */
export async function getMilestoneState(email: string): Promise<MilestoneState> {
  const stateRef = doc(db, "users", email, "momentum", "milestone_state");
  const stateSnap = await getDoc(stateRef);
  
  if (!stateSnap.exists()) {
    return DEFAULT_STATE;
  }
  
  return { ...DEFAULT_STATE, ...stateSnap.data() } as MilestoneState;
}

/**
 * Update milestone state with partial updates
 */
export async function updateMilestoneState(
  email: string,
  updates: Partial<MilestoneState>
): Promise<void> {
  const stateRef = doc(db, "users", email, "momentum", "milestone_state");
  const current = await getMilestoneState(email);
  
  const updated: MilestoneState = {
    ...current,
    ...updates,
    celebrationHistory: {
      ...current.celebrationHistory,
      ...updates.celebrationHistory,
    },
  };
  
  await setDoc(stateRef, updated);
}

/**
 * Calculate days since last check-in by looking backwards
 */
export async function getDaysSinceLastCheckin(
  email: string,
  currentDate: string
): Promise<number> {
  const today = new Date(currentDate + "T00:00:00");
  
  // Check up to 30 days back for last check-in
  for (let i = 1; i <= 30; i++) {
    const lookbackDate = new Date(today);
    lookbackDate.setDate(lookbackDate.getDate() - i);
    const lookbackKey = lookbackDate.toLocaleDateString("en-CA");
    
    const momentumRef = doc(db, "users", email, "momentum", lookbackKey);
    const momentumSnap = await getDoc(momentumRef);
    
    if (momentumSnap.exists()) {
      const data = momentumSnap.data();
      // Only count real check-ins, not gap fills
      if (data.checkinType === "real" || data.checkinCompleted === true) {
        return i;
      }
    }
  }
  
  // No check-in found in last 30 days
  return 30;
}