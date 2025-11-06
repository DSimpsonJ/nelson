// utils/seedFakeCheckins.ts
import { collection, doc, setDoc } from "firebase/firestore";
import { subDays } from "date-fns";
import { db } from "../firebase/config";
import { Checkin } from "./checkin";

/**
 * 🧪 Seeds 14 days of check-ins for testing
 * Creates a repeating pattern of 2 good days, 1 bad day
 */
export async function seedFakeCheckins(email: string) {
  const checkinsRef = collection(db, "users", email, "checkins");
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = subDays(today, i);
    const iso = date.toISOString().split("T")[0];

    const isGoodDay = i % 3 !== 0; // 2 good days, 1 bad day

    const data: Checkin = {
      date: iso,
      mood: isGoodDay ? "energized" : "tired",
      proteinHit: isGoodDay ? "yes" : "no",
      hydrationHit: isGoodDay ? "yes" : "no",
      movedToday: isGoodDay ? "yes" : "no",
      note: isGoodDay ? "Good day" : "Low energy day",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = doc(checkinsRef, iso);
    await setDoc(docRef, data, { merge: true });
  }

  console.log("✅ Seeded 14 patterned check-ins for testing");
}