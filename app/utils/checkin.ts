// utils/checkin.ts
import { doc, setDoc, getDoc, collection } from "firebase/firestore";
import { db } from "../firebase/config";

/** Single daily check-in, keyed by ISO date (YYYY-MM-DD) */
export interface Checkin {
  date: string;              // "2025-11-02"
  mood: string;              // "energized" | "okay" | "tired" (free text ok)
  proteinHit: string;        // "yes" | "almost" | "no"
  hydrationHit: string;      // "yes" | "no"
  movedToday?: string;       // <-- NEW: "yes" | "no"
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Save or update today’s check-in (document id = date) */
export async function saveCheckin(email: string, data: Checkin) {
  const ref = doc(collection(db, "users", email, "checkins"), data.date);
  const payload: Checkin = {
    ...data,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // merge:true lets us add movedToday without blowing away existing fields
  await setDoc(ref, payload, { merge: true });
}

/** Get a check-in by date, or null if it does not exist */
export async function getCheckin(
  email: string,
  date: string
): Promise<Checkin | null> {
  const ref = doc(db, "users", email, "checkins", date);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as Checkin) : null;
}