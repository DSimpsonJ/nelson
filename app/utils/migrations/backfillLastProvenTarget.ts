/**
 * ONE-TIME MIGRATION: Add lastProvenTarget to existing currentFocus documents
 * 
 * For all existing users, set lastProvenTarget = target
 * This assumes current target is their proven level
 */

import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export async function backfillLastProvenTarget() {
  console.log("[Migration] Starting lastProvenTarget backfill...");
  
  let updated = 0;
  let skipped = 0;
  
  try {
    // Get all users
    const usersSnap = await getDocs(collection(db, "users"));
    
    for (const userDoc of usersSnap.docs) {
      const email = userDoc.id;
      
      // Get their currentFocus
      const focusRef = doc(db, "users", email, "momentum", "currentFocus");
      const focusSnap = await getDocs(collection(db, "users", email, "momentum"));
      
      const focusDoc = focusSnap.docs.find(d => d.id === "currentFocus");
      
      if (focusDoc && focusDoc.exists()) {
        const data = focusDoc.data();
        
        // Skip if already has lastProvenTarget
        if (data.lastProvenTarget !== undefined) {
          console.log(`[Migration] Skipping ${email} - already has lastProvenTarget`);
          skipped++;
          continue;
        }
        
        // Set lastProvenTarget = target
        await updateDoc(focusRef, {
          lastProvenTarget: data.target || 10
        });
        
        console.log(`[Migration] Updated ${email}: lastProvenTarget = ${data.target || 10}`);
        updated++;
      }
    }
    
    console.log(`[Migration] Complete: ${updated} updated, ${skipped} skipped`);
    return { success: true, updated, skipped };
    
  } catch (error) {
    console.error("[Migration] Failed:", error);
    return { success: false, error };
  }
}