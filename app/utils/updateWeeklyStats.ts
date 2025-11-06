import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getISOWeekId } from "./programMeta";

type Checkin = {
  date: string;
  proteinHit?: string;
  hydrationHit?: string;
  movedToday?: string;
  mood?: string;
};

/** ---------- updateWeeklyStats ---------- */
export async function updateWeeklyStats(email: string) {
  const col = collection(db, "users", email, "checkins");
  const snaps = await getDocs(col);
  const all = snaps.docs.map((d) => d.data() as Checkin);

  // compute 7-day window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const last7 = all
    .filter((c) => new Date(c.date) >= cutoff)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const total = last7.length || 1;
  const proteinDays = last7.filter(
    (c) => c.proteinHit === "yes" || c.proteinHit === "almost"
  ).length;
  const hydrationDays = last7.filter((c) => c.hydrationHit === "yes").length;
  const movementDays = last7.filter((c) => c.movedToday === "yes").length;

    // Mood scoring
    const moodScores = last7.map((c) => {
        switch ((c.mood || "").toLowerCase()) {
          case "energized":
            return 3;
          case "good":
          case "okay":
            return 2;
          case "meh":
            return 1;
          case "drained":
          case "tired":
            return 0;
          default:
            return 1;
        }
      }) as number[];
    
      const avgMood =
        moodScores.reduce((sum: number, v: number) => sum + v, 0) /
        (moodScores.length || 1);

  const weekId = getISOWeekId(new Date());
  const statsRef = doc(db, "users", email, "weeklyStats", weekId);

  const data = {
    weekId,
    proteinConsistency: Math.round((proteinDays / total) * 100),
    hydrationConsistency: Math.round((hydrationDays / total) * 100),
    movementConsistency: Math.round((movementDays / total) * 100),
    moodTrend: avgMood >= 2.5 ? "Upward" : avgMood >= 1.5 ? "Steady" : "Low",
    updatedAt: new Date().toISOString(),
  };

  await setDoc(statsRef, data, { merge: true });
  console.log("✅ Weekly stats updated:", data);

  return data;
}