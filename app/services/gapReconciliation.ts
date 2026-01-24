/**
 * GAP RECONCILIATION
 * 
 * Handles single-day gap reconciliation when user returns.
 * Allows user to declare if they completed exercise on the missed day.
 * 
 * Rules:
 * - Only for exactly 1 consecutive gap day
 * - Only asked once per gap
 * - Only affects decay, not momentum increase
 * - Best outcome is neutral (no decay)
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

interface GapReconciliationCheck {
  needsReconciliation: boolean;
  gapDate?: string;
  gapMomentum?: number;
}

/**
 * Check if user has exactly one unresolved gap day (yesterday)
 */
export async function checkForUnresolvedGap(
  email: string,
  todayDate: string
): Promise<GapReconciliationCheck> {
  
  const today = new Date(todayDate + "T00:00:00");
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("en-CA");
  
  // Check yesterday's doc
  const yesterdayRef = doc(db, "users", email, "momentum", yesterdayKey);
  const yesterdaySnap = await getDoc(yesterdayRef);
  
  if (!yesterdaySnap.exists()) {
    return { needsReconciliation: false };
  }
  
  const yesterdayData = yesterdaySnap.data();
  
  // Only reconcile if:
  // 1. It's a gap-fill day
  // 2. Not yet resolved
  // 3. Exactly one day gap (check day before yesterday doesn't exist or isn't a gap)
  if (
    yesterdayData.checkinType === "gap_fill" &&
    yesterdayData.gapResolved === false
  ) {
    // Check if day before yesterday was also a gap
    const dayBefore = new Date(yesterday);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeKey = dayBefore.toLocaleDateString("en-CA");
    const dayBeforeRef = doc(db, "users", email, "momentum", dayBeforeKey);
    const dayBeforeSnap = await getDoc(dayBeforeRef);
    
    // Only reconcile if it's exactly one gap day
    const isOnlyOneGap = !dayBeforeSnap.exists() || 
                         dayBeforeSnap.data().checkinType !== "gap_fill";
    
    if (isOnlyOneGap) {
      return {
        needsReconciliation: true,
        gapDate: yesterdayKey,
        // ...
        gapMomentum: yesterdayData.momentumScore || 0
      };
    }
  }
  
  return { needsReconciliation: false };
}

/**
 * Resolve the gap with user's answer
 */
export async function resolveGap(
  email: string,
  gapDate: string,
  exerciseCompleted: boolean
): Promise<{ updatedMomentum: number }> {
  
  const gapRef = doc(db, "users", email, "momentum", gapDate);
  const gapSnap = await getDoc(gapRef);
  
  if (!gapSnap.exists()) {
    throw new Error("Gap day not found");
  }
  
  const gapData = gapSnap.data();
  const heldMomentum = gapData.momentumScore || 0;
  
  let finalMomentum = heldMomentum;
  let message = "Gap reconciled";
  
  if (!exerciseCompleted) {
    // Apply decay only if they didn't exercise
    finalMomentum = Math.round(heldMomentum * 0.92);
    message = "Missed check-in";
  }
  
  // Update the gap day with resolution
  await setDoc(gapRef, {
    ...gapData,
    gapResolved: true,
    gapExerciseCompleted: exerciseCompleted,
    momentumScore: finalMomentum,
    momentumTrend: exerciseCompleted ? 'stable' : 'down',
    momentumMessage: message,
  });
  
  console.log(`[GapReconciliation] Resolved ${gapDate}: exercise=${exerciseCompleted}, momentum=${finalMomentum}`);
  
  return { updatedMomentum: finalMomentum };
}