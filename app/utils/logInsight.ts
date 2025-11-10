// utils/logInsight.ts
import { db } from "../firebase/config";
import { collection, addDoc } from "firebase/firestore";

/**
 * Logs each generated coach insight with a timestamp for long-term tracking.
 * 
 * @param email - user email (Firestore document ID)
 * @param note - the insight text
 * @param context - optional extra data (stats, mood, triggers)
 */
export async function logInsight(
  email: string,
  note: string,
  context: Record<string, any> = {}
) {
  try {
    const ref = collection(db, "users", email, "insights");
    await addDoc(ref, {
      note,
      context,
      createdAt: new Date().toISOString(),
    });
    console.log("[Insight Log] Saved new coach insight");
  } catch (err) {
    console.error("Failed to log coach insight:", err);
  }
}