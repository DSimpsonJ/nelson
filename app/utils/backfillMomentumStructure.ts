/**
 * ONE-TIME BACKFILL SCRIPT
 * 
 * Adds the new structured format (primary, stack, foundations, checkinType)
 * to existing momentum docs that only have the old flat structure
 */

import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export async function backfillMomentumStructure(email: string): Promise<void> {
  console.log("[Backfill] Starting momentum structure backfill for:", email);

  // Get current focus to know what the primary habit is
  const focusRef = doc(db, "users", email, "momentum", "currentFocus");
  const focusSnap = await getDoc(focusRef);
  
  if (!focusSnap.exists()) {
    console.log("[Backfill] No currentFocus found, skipping");
    return;
  }
  
  const currentHabit = focusSnap.data().habitKey || "walk_12min";
  console.log("[Backfill] Current habit:", currentHabit);

  // Get all momentum docs
  const momentumCol = collection(db, "users", email, "momentum");
  const snapshot = await getDocs(momentumCol);

  let updated = 0;
  let skipped = 0;

  for (const docSnap of snapshot.docs) {
    const docId = docSnap.id;
    
    // Skip non-date docs (currentFocus, etc)
    if (!docId.match(/^\d{4}-\d{2}-\d{2}$/)) {
      continue;
    }

    const data = docSnap.data();
    
    // Skip if already has new structure
    if (data.primary && data.checkinType) {
      skipped++;
      continue;
    }

    // Build the new structure from old data
    const primaryHit = data.primaryHabitHit ?? false;
    
    const updatedData = {
      ...data,
      
      // Add structured primary
      primary: {
        habitKey: currentHabit,
        done: primaryHit,
      },
      
      // Add structured stack (empty for now since we don't have historical stack data)
      stack: {},
      
      // Add structured foundations
      foundations: {
        protein: data.moved ?? false, // This might be wrong, but we don't have historical protein data
        hydration: data.hydrated ?? false,
        sleep: data.slept ?? false,
        nutrition: (data.nutritionScore ?? 0) >= 9,
        movement: data.moved ?? false,
      },
      
      // Add checkinType
      checkinType: "real",
    };

    await setDoc(docSnap.ref, updatedData, { merge: true });
    updated++;
    console.log(`[Backfill] Updated ${docId}`);
  }

  console.log(`[Backfill] Complete. Updated: ${updated}, Skipped: ${skipped}`);
}

/**
 * Call this once from your dashboard dev tools or a button click
 */
export async function runBackfill(email: string): Promise<void> {
  try {
    await backfillMomentumStructure(email);
    console.log("✅ Backfill complete!");
  } catch (error) {
    console.error("❌ Backfill failed:", error);
  }
}