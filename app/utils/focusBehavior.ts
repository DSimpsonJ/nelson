import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export const FOCUS_BEHAVIOR_LABELS: Record<string, string> = {
  nutrition_quality: "Nutrition",
  portion_control:   "Portions",
  protein:           "Protein",
  hydration:         "Hydration",
  sleep:             "Sleep",
  movement:          "Movement",
};

export const FOCUS_BEHAVIORS = Object.keys(FOCUS_BEHAVIOR_LABELS);

/**
 * Returns the suggested focus behavior key for a given pattern.
 * Returns null if the pattern doesn't warrant a specific suggestion.
 */
export function getSuggestedFocus(patternType: string): string | null {
  const map: Record<string, string> = {
    recovery_deficit:      "sleep",
    commitment_misaligned: "nutrition_quality",
    effort_inconsistent:   "nutrition_quality",
    variance_high:         "hydration",
    momentum_decline:      "sleep",
  };
  return map[patternType] ?? null;
}

/**
 * Writes the user's focus behavior selection to their user doc.
 */
export async function saveFocusBehavior(
  email: string,
  behaviorKey: string,
  weekId: string
): Promise<void> {
  const userRef = doc(db, "users", email);
  await setDoc(userRef, {
    focusBehavior: behaviorKey,
    focusBehaviorSetWeek: weekId,
  }, { merge: true });
}

/**
 * Reads the user's current focus behavior if set for this week.
 * Returns null if not set or stale.
 */
export async function getCurrentFocusBehavior(
  email: string,
  currentWeekId: string
): Promise<string | null> {
  const userRef = doc(db, "users", email);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.focusBehaviorSetWeek !== currentWeekId) return null;
  return data.focusBehavior ?? null;
}
export function getCurrentWeekId(): string {
    const now = new Date();
    const currentDay = now.getDay();
    const daysToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() + daysToMonday);
    thisMonday.setHours(0, 0, 0, 0);
    const thursday = new Date(thisMonday);
    thursday.setDate(thisMonday.getDate() + 3);
    const year = thursday.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay();
    const firstMonday = new Date(year, 0, 1);
    firstMonday.setDate(1 + ((jan1Day === 0 ? -6 : 1) - jan1Day));
    const weekNumber = Math.floor(
      (thisMonday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ) + 1;
    return `${year}-W${weekNumber.toString().padStart(2, "0")}`;
  }