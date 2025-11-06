// utils/devTools.ts
// Developer-only utilities for testing and maintenance
// ⚠️ Comment out calls after use so you don't wipe real data accidentally

import { collection, getDocs, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { subDays } from "date-fns";
import { updateWeeklyStats } from "./updateWeeklyStats";
import { Checkin } from "./checkin";

// 🧪 Seed fake check-ins (14 days of random consistency)
export async function devSeedCheckins(email: string) {
  const col = collection(db, "users", email, "checkins");
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = subDays(today, i).toISOString().split("T")[0];
    const proteinHit = Math.random() > 0.2 ? "yes" : "no";
    const hydrationHit = Math.random() > 0.3 ? "yes" : "no";
    const movedToday = Math.random() > 0.4 ? "yes" : "no";
    const nutritionAlignment = Math.floor(60 + Math.random() * 40); // 60–100%

    const checkin: Checkin = {
      date,
      mood: ["energized", "okay", "tired"][Math.floor(Math.random() * 3)],
      proteinHit,
      hydrationHit,
      movedToday,
      note: "Auto-generated test check-in",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(col, date), checkin, { merge: true });
  }

  console.log("🧠 Seeded 14 fake check-ins for testing:", email);
  await updateWeeklyStats(email);
  console.log("✅ Weekly stats recalculated after seeding");
}

// 🧹 Clear all check-ins (use with caution)
export async function devClearCheckins(email: string) {
  const col = collection(db, "users", email, "checkins");
  const snaps = await getDocs(col);

  for (const d of snaps.docs) {
    await deleteDoc(doc(db, "users", email, "checkins", d.id));
  }

  console.log("🧹 Cleared all check-ins for", email);
  await updateWeeklyStats(email);
  console.log("✅ Weekly stats reset after clearing");
}

// 🔁 Force weeklyStats recalculation
export async function devRecalculateWeeklyStats(email: string) {
  await updateWeeklyStats(email);
  console.log("🔁 Recalculated weekly stats for:", email);
}