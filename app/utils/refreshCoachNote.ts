// utils/refreshCoachNote.ts
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { Checkin } from "./checkin";
import { getISOWeekId } from "./programMeta";

export async function refreshCoachNote(
  email: string,
  plan?: { coachingStyle?: "encouraging" | "direct" | "analytical" } | null
): Promise<string> {
  const checkinCol = collection(db, "users", email, "checkins");
  const snaps = await getDocs(checkinCol);
  const last7 = snaps.docs
    .map((d) => d.data() as Checkin)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 7);

  if (last7.length === 0) {
    return "Welcome to Nelson. Your job this week is simple: show up. One small check-in at a time.";
  }

  // --- Calculate Consistency ---
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0;

  const proteinConsistency =
    (last7.filter((c) => c.proteinHit === "yes").length / last7.length) * 100;
  const hydrationConsistency =
    (last7.filter((c) => c.hydrationHit === "yes").length / last7.length) * 100;
  const movementConsistency =
    (last7.filter((c) => c.movedToday === "yes").length / last7.length) * 100;
  const nutritionAlignment = avg(
    last7.map((c) => (c as any).nutritionAlignment ?? 0)
  );

  // --- Momentum Engine ---
  const momentumScore = Math.round(
    (proteinConsistency +
      hydrationConsistency +
      movementConsistency +
      nutritionAlignment) /
      4
  );

  const style = plan?.coachingStyle || "encouraging";
  const lastCheckin = new Date(last7[0].date);
  const daysSinceLast = Math.floor(
    (Date.now() - lastCheckin.getTime()) / (1000 * 60 * 60 * 24)
  );

  // --- Engagement check ---
  const reengage =
    daysSinceLast > 3
      ? "It’s been a few days since your last check-in. Pick up where you left off today."
      : "";

  // --- Tone logic ---
  const encouraging = () => {
    if (momentumScore >= 80)
      return "You’re locking in. This is what consistency feels like.";
    if (momentumScore >= 50)
      return "You’re steady. Keep stacking the small wins.";
    return "Slow weeks happen. The only mistake is disappearing. Start again today.";
  };

  const direct = () => {
    if (momentumScore >= 80) return "Strong work. Keep your foot on the gas.";
    if (momentumScore >= 50)
      return "You’re coasting. Tighten up hydration or movement this week.";
    return "Momentum dropped. No excuses. Get one clean day behind you.";
  };

  const analytical = () => {
    return `Momentum score: ${momentumScore}%. Protein ${Math.round(
      proteinConsistency
    )}%, Hydration ${Math.round(hydrationConsistency)}%, Movement ${Math.round(
      movementConsistency
    )}%. ${
      momentumScore >= 70
        ? "Positive trajectory detected."
        : "Data shows room for improvement. Adjust inputs this week."
    }`;
  };

  const message =
    style === "encouraging"
      ? encouraging()
      : style === "direct"
      ? direct()
      : analytical();

  return [reengage, message].filter(Boolean).join(" ");
}

// ✅ NEW: Save coach note to Firestore (under weeklyStats)
export async function saveCoachNoteToWeeklyStats(
  email: string,
  note: string
): Promise<void> {
  const weekId = getISOWeekId(new Date());
  const ref = doc(db, "users", email, "weeklyStats", weekId);
  await setDoc(
    ref,
    {
      coachNote: note,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}