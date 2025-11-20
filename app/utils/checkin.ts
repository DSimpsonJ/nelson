// utils/checkin.ts
import { doc, setDoc, getDoc, collection } from "firebase/firestore";
import { db } from "../firebase/config";

export interface Checkin {
  date: string;
  headspace: string;
  proteinHit: string;
  hydrationHit: string;
  movedToday?: string;
  sleepHit?: string;  // ADD THIS LINE
  energyBalance?: string;
  eatingPattern?: string;
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
// 🧪 DEV ONLY: Seed fake check-ins for testing coach logic
export async function seedFakeCheckins(email: string) {
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const fake: Checkin = {
      date: dateStr,
      headspace: i % 3 === 0 ? "tired" : i % 2 === 0 ? "okay" : "energized",
      proteinHit: i % 4 === 0 ? "no" : "yes",
      hydrationHit: i % 5 === 0 ? "no" : "yes",
      movedToday: i % 3 === 0 ? "no" : "yes",
      energyBalance: i % 4 === 0 ? "light" : i % 3 === 0 ? "heavy" : "normal",
eatingPattern: i % 3 === 0 ? "mixed" : "meals",
    };

    await saveCheckin(email, fake);
  }

  console.log("✅ Seeded 14 fake check-ins for", email);
}