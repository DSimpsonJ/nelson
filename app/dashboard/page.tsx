"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  deleteDoc,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import { db, auth } from "../firebase/config";
import { getEmail } from "../utils/getEmail";
import { useToast } from "../context/ToastContext";
import { saveCheckin, getCheckin, type Checkin } from "../utils/checkin";
import { getISOWeekId } from "../utils/programMeta";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { saveSession } from "../utils/session";
import { onSnapshot } from "firebase/firestore";
import { format, subDays } from "date-fns";
import { updateWeeklyStats } from "../utils/updateWeeklyStats";
import { refreshCoachNote, saveCoachNoteToWeeklyStats } from "../utils/refreshCoachNote";
import { seedFakeCheckins } from "../utils/seedFakeCheckins";
import { devClearCheckins, devSeedCheckins, devRecalculateWeeklyStats } from "../utils/devTools";

/** ---------- Types ---------- */
type CheckinTrend = {
  proteinConsistency: number;
  hydrationConsistency: number;
  movementConsistency: number;
  moodTrend: string;
  checkinsCompleted: number;
};

type SessionTrend = {
  workoutsThisWeek: number;
  totalSets: number;
  avgDuration: number;
};

type TrendStats = CheckinTrend & SessionTrend;

type Plan = {
  goal: string;
  trainingDays: number;
  equipment: string;
  hydrationTarget: number;
  sleepTarget: number;
  coachingStyle: "encouraging" | "direct" | "analytical";
};

type UserProfile = {
  firstName: string;
  email: string;
  plan?: Plan;
};

/** ✅ Compute workout stats from sessions in Firestore (top-level, not nested) */
async function loadSessionTrends(email: string): Promise<{
  workoutsThisWeek: number;
  totalSets: number;
  avgDuration: number;
}> {
  const sessionsCol = collection(db, "users", email, "sessions");
  const snaps = await getDocs(sessionsCol);

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = snaps.docs
    .map((d) => d.data() as any)
    .filter((s) => new Date(s.date).getTime() >= oneWeekAgo);

  if (recent.length === 0) {
    return { workoutsThisWeek: 0, totalSets: 0, avgDuration: 0 };
  }

  const totalSets = recent.reduce((sum, s) => sum + (s.completedSets ?? 0), 0);
  const avgDuration = Math.round(
    recent.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) / recent.length / 60
  );

  return {
    workoutsThisWeek: recent.length,
    totalSets,
    avgDuration,
  };
}

/** ✅ Compute 7-day check-in trend averages (recent-weighted and responsive) */
function calculateTrends(checkins: any[]): CheckinTrend {
  const last7 = checkins
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 7);

  if (last7.length === 0) {
    return {
      proteinConsistency: 0,
      hydrationConsistency: 0,
      movementConsistency: 0,
      moodTrend: "No Data",
      checkinsCompleted: 0,
    };
  }


  const proteinDays = last7.filter(
    (c) => c.proteinHit?.toLowerCase() === "yes"
  ).length;

  const hydrationDays = last7.filter(
    (c) => c.hydrationHit?.toLowerCase() === "yes"
  ).length;

  // ✅ Improved movement tracking logic (final version)
  const movementDays = last7.reduce((count, c) => {
    const moved = (c.movedToday || "").toString().trim().toLowerCase();
    return moved === "yes" ? count + 1 : count;
  }, 0);

  // Temporary debug: log movement data to verify
  console.log(
    "Movement data (last7):",
    last7.map((c) => c.movedToday),
    "Count:",
    movementDays
  );

  const count = last7.length;
  const [weeklyReflection, setWeeklyReflection] = useState<{
    coachNote?: string;
    weekId?: string;
    momentumScore?: number;
    workoutsThisWeek?: number;
    checkinsCompleted?: number;
  } | null>(null);
  const moodScores = last7.map((c) => {
    const mood = c.mood?.toLowerCase();
    if (mood === "energized") return 3;
    if (mood === "okay") return 2;
    if (mood === "tired") return 1;
    return 0;
  });

  // Exponential weighting toward recent days
  const weights: number[] = last7.map((_, i) => Math.pow(0.7, i));
  const totalWeight = weights.reduce((a: number, b: number) => a + b, 0);
  const weightedAvg =
    moodScores.reduce(
      (sum: number, score: number, i: number) => sum + score * weights[i],
      0
    ) / totalWeight;

  let moodTrend = "Steady";
  if (weightedAvg >= 2.4) moodTrend = "Upward";
  else if (weightedAvg <= 1.4) moodTrend = "Low";

  return {
    proteinConsistency: Math.round((proteinDays / count) * 100),
    hydrationConsistency: Math.round((hydrationDays / count) * 100),
    movementConsistency: Math.round((movementDays / count) * 100),
    moodTrend,
    checkinsCompleted: count,
  };
}

async function loadWeeklyStats(email: string) {
  const weekId = getISOWeekId(new Date()); // e.g. "2025-W45"
  const ref = doc(db, "users", email, "weeklyStats", weekId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as TrendStats) : null;
}

/** ---------- Component ---------- */
export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  // Rotating greeting messages
const greetings = [
  "Ready to check in?",
  "Nothing dramatic. Just direction.",
  "You don’t need perfect days. You need present ones.",
  "Momentum over motivation.",
  "One small win at a time.",
  "Show up for yourself today."
];

const [greeting, setGreeting] = useState(greetings[0]);

useEffect(() => {
  // Rotate message every 15 seconds
  const interval = setInterval(() => {
    setGreeting((prev) => {
      const idx = greetings.indexOf(prev);
      return greetings[(idx + 1) % greetings.length];
    });
  }, 15000);
  return () => clearInterval(interval);
}, []);
// 🪞 Weekly reflection data
const [weeklyReflection, setWeeklyReflection] = useState<{
  coachNote?: string;
  weekId?: string;
  momentumScore?: number;
  workoutsThisWeek?: number;
  checkinsCompleted?: number;
} | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coachNote, setCoachNote] = useState("");
  const [todayCheckin, setTodayCheckin] = useState<Checkin | null>(null);
  const [checkin, setCheckin] = useState({
    mood: "",
    proteinHit: "",
    hydrationHit: "",
    movedToday: "", // optional field
    nutritionAlignment: 0, //
    note: "",
  });
  const [checkinSubmitted, setCheckinSubmitted] = useState(false);
  const [trends, setTrends] = useState<TrendStats | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<Checkin[]>([]); // ✅ move this here

  const today = new Date().toISOString().split("T")[0];
  const [hasSessionToday, setHasSessionToday] = useState(false);

  /** ✅ Fetch the last 14 days of check-ins */
  const loadRecentCheckins = async (email: string) => {
    const colRef = collection(db, "users", email, "checkins");
    const snaps = await getDocs(colRef);
    const all = snaps.docs.map((d) => d.data() as Checkin);

    const cutoff = subDays(new Date(), 14); // ✅ correct capitalization
    const recent = all
      .filter((c) => new Date(c.date) >= cutoff)
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    setRecentCheckins(recent);
  };

  /** ✅ Check if user has logged a session today */
  async function getTodaySession(email: string): Promise<boolean> {
    const sessionsCol = collection(db, "users", email, "sessions");
    const snaps = await getDocs(sessionsCol);
    const today = new Date().toISOString().split("T")[0];
    return snaps.docs.some((d) => {
      const data = d.data();
      return data.date?.startsWith(today);
    });
  }

  /** Load profile, plan, check-ins, coach note, and trends */
  const loadDashboardData = async () => {
    try {
      const email = getEmail();
      if (!email) {
        router.replace("/signup");
        return;
      }

      // ---- Profile
      const userRef = doc(db, "users", email);
      const userSnap = await getDoc(userRef);

      let firstName = "there";
      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        firstName = data.firstName ?? firstName;
      } else if (auth.currentUser?.displayName) {
        firstName = auth.currentUser.displayName.split(" ")[0];
      }

      // ---- Plan
      const planRef = doc(db, "users", email, "profile", "intake");
      const planSnap = await getDoc(planRef);
      const plan = planSnap.exists() ? planSnap.data().plan : null;

      setProfile({ firstName, email, plan });

      // ---- Today’s check-in
      const todayData = await getCheckin(email, today);
      await loadRecentCheckins(email);
      if (todayData) setTodayCheckin(todayData);

      // ---- Coach note
      const note = await refreshCoachNote(email, plan);
      setCoachNote(note);

      // ---- Session stats (workouts)
      const sessionStats = await loadSessionTrends(email);
      const hasSession = await getTodaySession(email);
      setHasSessionToday(hasSession);
      // ---- Prefer stored weekly stats if present
      const existingStats = await loadWeeklyStats(email);

      if (existingStats) {
        // Overlay latest session stats so card is fresh
        setTrends({
          proteinConsistency: existingStats.proteinConsistency ?? 0,
          hydrationConsistency: existingStats.hydrationConsistency ?? 0,
          movementConsistency: existingStats.movementConsistency ?? 0,
          moodTrend: existingStats.moodTrend ?? "No Data",
          checkinsCompleted: existingStats.checkinsCompleted ?? 0,
          workoutsThisWeek: sessionStats.workoutsThisWeek,
          totalSets: sessionStats.totalSets,
          avgDuration: sessionStats.avgDuration,
        });
      } else {
        // ---- Recompute check-in trends from raw check-ins
        const checkinColRef = collection(db, "users", email, "checkins");
        const checkinSnaps = await getDocs(checkinColRef);
        const checkins = checkinSnaps.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            // normalize movedToday for trend calc
            movedToday: data.movedToday?.toLowerCase?.() || "no",
          };
        });
        const checkinTrend = calculateTrends(checkins);

        const merged: TrendStats = {
          proteinConsistency: checkinTrend.proteinConsistency,
          hydrationConsistency: checkinTrend.hydrationConsistency,
          movementConsistency: checkinTrend.movementConsistency,
          moodTrend: checkinTrend.moodTrend,
          checkinsCompleted: checkinTrend.checkinsCompleted,
          workoutsThisWeek: sessionStats.workoutsThisWeek ?? 0,
          totalSets: sessionStats.totalSets ?? 0,
          avgDuration: sessionStats.avgDuration ?? 0,
        };

        setTrends(merged);

        // ---- Persist weekly stats by ISO week id
        const weekId = getISOWeekId(new Date());
        await setDoc(
          doc(db, "users", email, "weeklyStats", weekId),
          {
            ...merged,
            weekId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
      showToast({ message: "Error loading dashboard", type: "error" });
    } finally {
      setLoading(false);
    }
  };
  /** Save check-in */
  const handleCheckinSubmit = async () => {
    if (!checkin.mood || !checkin.proteinHit || !checkin.hydrationHit) {
      showToast({ message: "Please answer all questions.", type: "error" });
      return;
    }

    try {
      const email = getEmail();
      if (!email) return;

      // ✅ Save today’s check-in
      const data = {
        date: today,
        mood: checkin.mood,
        proteinHit: checkin.proteinHit,
        hydrationHit: checkin.hydrationHit,
        movedToday: checkin.movedToday, // safe even if optional in your Checkin type
        nutritionAlignment: checkin.nutritionAlignment,
        note: checkin.note,
      } as Checkin;

      await saveCheckin(email, data);

      // ✅ NEW: auto-update weekly stats after saving the check-in
      await updateWeeklyStats(email);

      setTodayCheckin(data);
      setCheckinSubmitted(true);

      // 🔁 Dynamic coach update + save to Firestore
const note = await refreshCoachNote(email, profile?.plan);
setCoachNote(note);
await saveCoachNoteToWeeklyStats(email, note);

      showToast({ message: "Check-in saved!", type: "success" });
    } catch (err) {
      console.error("handleCheckinSubmit error:", err);
      showToast({ message: "Failed to save check-in", type: "error" });
    }
  };

   /** Dev reset */
   const handleResetCheckin = async () => {
    try {
      const email = getEmail();
      if (!email) return;
      const todayDoc = doc(db, "users", email, "checkins", today);
      await deleteDoc(todayDoc);
      setTodayCheckin(null);
      setCheckinSubmitted(false);
      showToast({
        message: "Today's check-in reset (dev mode)",
        type: "success",
      });
    } catch (err) {
      console.error("Reset failed:", err);
      showToast({ message: "Failed to reset check-in", type: "error" });
    }
  };

  // ✅ Initial dashboard data load
  useEffect(() => {
    loadDashboardData();
  }, []);
  // 🪞 Weekly Reflection loader
useEffect(() => {
  const fetchWeeklyReflection = async () => {
    const email = getEmail();
    if (!email) return;

    const weekId = getISOWeekId(new Date());
    const ref = doc(db, "users", email, "weeklyStats", weekId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setWeeklyReflection(snap.data() as any);
    }
  };

  fetchWeeklyReflection();
}, [todayCheckin]); // ✅ triggers whenever you check in

  // ✅ Dev tools hook (seed / clear data)
  useEffect(() => {
    const email = getEmail();
    if (!email) return;

    // 🧪 Uncomment one at a time for development
    // devClearCheckins(email);
    // devSeedCheckins(email);
  }, []);
  // ✅ Real-time listener (read-only, no Firestore write loop)
useEffect(() => {
  const email = getEmail();
  if (!email) return;

  console.log("[Realtime] listeners attached");

  const checkinRef = collection(db, "users", email, "checkins");
  const sessionsRef = collection(db, "users", email, "sessions");

  // 🔹 Check-in listener: updates recentCheckins
  const unsubCheckins = onSnapshot(checkinRef, async (snapshot) => {
    if (!snapshot.metadata.hasPendingWrites) {
      console.log("[Realtime] Check-in updated");
      const data = snapshot.docs.map((d) => d.data() as Checkin);
      setRecentCheckins(data);
    }
  });

  // 🔹 Workout listener: safely update workoutsThisWeek if trends exist
  const unsubSessions = onSnapshot(sessionsRef, async (snapshot) => {
    if (!snapshot.metadata.hasPendingWrites) {
      console.log("[Realtime] Workout updated");
      const sessions = snapshot.docs.map((d) => d.data());

      setTrends((prev) => {
        const current: TrendStats = prev ?? {
          proteinConsistency: 0,
          hydrationConsistency: 0,
          movementConsistency: 0,
          workoutsThisWeek: 0,
          checkinsCompleted: 0,
          moodTrend: "",
          totalSets: 0,
          avgDuration: 0,
        };
        return {
          ...current,
          workoutsThisWeek: sessions.length,
        };
      });
    }
  });

  return () => {
    unsubCheckins();
    unsubSessions();
  };
}, []);
  // ✅ Recent Check-ins for Mood History (Last 14 Days)
useEffect(() => {
  const loadRecentCheckins = async () => {
    try {
      const email = getEmail();
      if (!email) return;

      const colRef = collection(db, "users", email, "checkins");
      const snaps = await getDocs(colRef);
      const all = snaps.docs.map((d) => d.data() as Checkin);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);

      const recent = all
        .filter((c) => new Date(c.date) >= cutoff)
        .sort((a, b) => (a.date < b.date ? -1 : 1));

      setRecentCheckins(recent);
    } catch (err) {
      console.error("Failed to load recent check-ins:", err);
    }
  };

  loadRecentCheckins();
}, [todayCheckin]);
  // ✅ Mood history for the line chart (last 7 days)
  const [moodHistory, setMoodHistory] = useState<{ day: string; mood: number }[]>(
    []
  );
// Convert mood text to numeric score for chart visualization
function moodToScore(m: string): number {
  const val = m?.toLowerCase?.() || "";
  if (val === "energized") return 3;
  if (val === "okay") return 2;
  if (val === "tired") return 1;
  return 0;
}
// Determine which consistency area needs the most focus
function getNextFocus(trends: any): string {
  if (!trends) return "Keep building momentum through small, steady actions.";

  const areas = [
    { name: "Protein", value: trends.proteinConsistency ?? 0 },
    { name: "Hydration", value: trends.hydrationConsistency ?? 0 },
    { name: "Movement", value: trends.movementConsistency ?? 0 },
    { name: "Nutrition", value: trends.nutritionAlignment ?? 0 },
  ];

  const lowest = areas.reduce((min, a) => (a.value < min.value ? a : min), areas[0]);

  switch (lowest.name) {
    case "Protein":
      return "Next focus: hit your protein goal consistently this week.";
    case "Hydration":
      return "Next focus: improve hydration — aim for 100+ oz daily.";
    case "Movement":
      return "Next focus: move more often — even short walks add up.";
    case "Nutrition":
      return "Next focus: tighten your food quality and meal timing.";
    default:
      return "Stay balanced across all areas — small wins compound.";
  }
}
useEffect(() => {
  const email = getEmail();
  if (email) {
    // 🧪 Seed fake data once for testing, then comment out after
    // seedFakeCheckins(email);
  }
}, []);
useEffect(() => {
  const email = getEmail();
  if (email) {
    // ⚠️ Only run this once for testing, then comment it out
    seedFakeCheckins(email);
  }
}, []);
useEffect(() => {
  const fetchMoodHistory = async () => {
    const email = getEmail();
    if (!email) return;

    const q = query(
      collection(db, "users", email, "checkins"),
      orderBy("date", "desc"),
      limit(7)
    );

    const snaps = await getDocs(q);
    const data = snaps.docs.map((d) => d.data() as Checkin);

    const formatted = data
      .map((c) => ({
        day: new Date(c.date).toLocaleDateString("en-US", { weekday: "short" }),
        mood: moodToScore(c.mood),
      }))
      .reverse();

    setMoodHistory(formatted);
  };

  fetchMoodHistory();
}, [todayCheckin]);

// ✅ Single early-return. No hooks below this line.
if (loading || !profile) {
  console.log("[Dashboard] loading or missing profile");
  return (
    <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <p className="text-gray-500">Loading dashboard…</p>
    </main>
  );
}
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          
          {/* 1. Welcome Header */}
          <div className="bg-white rounded-2xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Hey {profile?.firstName || "there"}.
              </h1>
              {todayCheckin ? (
                <p className="text-gray-600 mt-1">
                  You’ve already checked in today.
                </p>
              ) : (
                <p className="text-gray-600 mt-1">{greeting}</p>
              )}
            </div>
    
  {/* Tagline */}
  <div className="hidden sm:flex flex-col items-end text-right">
    <p className="text-xs tracking-widest uppercase text-gray-400 font-semibold">
      Patience
    </p>
    <p className="text-xs tracking-widest uppercase text-gray-400 font-semibold">
      Perseverance
    </p>
    <p className="text-xs tracking-widest uppercase text-gray-400 font-semibold">
      Progress
    </p>
  </div>
</div>

        {/* 2. Daily Check-in */}
        {!todayCheckin && !checkinSubmitted && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Daily Check-In
            </h2>

            <p className="text-gray-600 mb-2">How are you feeling today?</p>
            <div className="flex gap-2 mb-4">
              {["Energized", "Okay", "Tired"].map((m) => (
                <button
                  key={m}
                  onClick={() => setCheckin((prev) => ({ ...prev, mood: m }))}
                  className={`flex-1 border rounded-lg py-2 ${checkin.mood === m
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 text-gray-700 hover:bg-blue-50"
                    }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <p className="text-gray-600 mb-2">
              Did you hit your protein target yesterday?
            </p>
            <div className="flex gap-2 mb-4">
              {["Yes", "Almost", "No"].map((p) => (
                <button
                  key={p}
                  onClick={() =>
                    setCheckin((prev) => ({
                      ...prev,
                      proteinHit: p.toLowerCase(),
                    }))
                  }
                  className={`flex-1 border rounded-lg py-2 ${checkin.proteinHit === p.toLowerCase()
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 text-gray-700 hover:bg-blue-50"
                    }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <p className="text-gray-600 mb-2">
              Did you drink at least {profile?.plan?.hydrationTarget ?? 100} oz
              of water yesterday?
            </p>
            <div className="flex gap-2 mb-4">
              {["Yes", "No"].map((h) => (
                <button
                  key={h}
                  onClick={() =>
                    setCheckin((prev) => ({
                      ...prev,
                      hydrationHit: h.toLowerCase(),
                    }))
                  }
                  className={`flex-1 border rounded-lg py-2 ${checkin.hydrationHit === h.toLowerCase()
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 text-gray-700 hover:bg-blue-50"
                    }`}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Movement Habit */}
            <p className="text-gray-600 mb-2">Did you move today?</p>
            <div className="flex gap-2 mb-4">
              {["Yes", "No"].map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    setCheckin((prev) => ({ ...prev, movedToday: m.toLowerCase() }))
                  }
                  className={`flex-1 border rounded-lg py-2 ${checkin.movedToday === m.toLowerCase()
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 text-gray-700 hover:bg-blue-50"
                    }`}
                >
                  {m}
                </button>
              ))}
            </div>
{/* Nutrition Alignment Slider */}
<p className="text-gray-600 mb-2 mt-4">
  How closely did your eating today match your intentions?
</p>

<input
  type="range"
  min={0}
  max={100}
  step={5}
  value={checkin.nutritionAlignment ?? 0}
  onChange={(e) =>
    setCheckin((prev) => ({
      ...prev,
      nutritionAlignment: Number(e.target.value),
    }))
  }
  className="w-full accent-blue-600"
/>

<p className="text-sm text-gray-700 text-center mt-1">
  {checkin.nutritionAlignment ?? 0}%
</p>

<p className="text-xs text-gray-500 mt-1">
  No guilt. Just awareness. Aim for direction, not perfection.
</p>
            <p className="text-gray-600 mb-2">
              Anything else you’d like Nelson to know?
            </p>
            <textarea
              value={checkin.note || ""}
              onChange={(e) =>
                setCheckin((prev) => ({ ...prev, note: e.target.value }))
              }
              placeholder="Optional note about your day..."
              className="w-full border border-gray-300 rounded-md p-2 text-gray-900 mb-4"
              rows={3}
            />

            <button
              onClick={handleCheckinSubmit}
              disabled={
                !checkin.mood || !checkin.proteinHit || !checkin.hydrationHit
              }
              className="w-full bg-green-600 text-white py-2 rounded-md font-semibold hover:bg-green-700 transition disabled:opacity-60"
            >
              Save Check-In
            </button>
          </div>
        )}

        {/* Checked-In State */}
        {todayCheckin && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-green-800">
            <p>
              ✅ You’ve checked in for today — feeling{" "}
              <strong>{todayCheckin.mood}</strong> and protein was{" "}
              <strong>{todayCheckin.proteinHit}</strong>.
            </p>
          </div>
        )}

       {/* 3. Trend Summary */}
<div className="bg-white rounded-2xl shadow-sm p-6">
  <h2 className="text-xl font-semibold text-gray-900 mb-3">
    Weekly Trend Summary
  </h2>

  {!trends ? (
    <p className="text-gray-500">Loading trend data...</p>
  ) : (
    <>
      {/* Compact list readout */}
      <ul className="divide-y divide-gray-100">
        <li className="py-2 flex justify-between items-center">
          <span className="text-gray-700">Protein Consistency</span>
          <span className="font-semibold text-blue-700">
            {trends.proteinConsistency ?? 0}%
          </span>
        </li>
        <li className="py-2 flex justify-between items-center">
          <span className="text-gray-700">Hydration Consistency</span>
          <span className="font-semibold text-blue-700">
            {trends.hydrationConsistency ?? 0}%
          </span>
        </li>
        <li className="py-2 flex justify-between items-center">
          <span className="text-gray-700">Movement Consistency</span>
          <span className="font-semibold text-blue-700">
            {trends.movementConsistency ?? 0}%
          </span>
        </li>
        <li className="py-2 flex justify-between items-center">
          <span className="text-gray-700">Nutrition Alignment (today)</span>
          <span className="font-semibold text-blue-700">
            {todayCheckin?.nutritionAlignment ?? 0}%
          </span>
        </li>
      </ul>

      {/* Bar chart */}
      <div className="mt-6 mb-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={[
              { name: "Protein", value: trends.proteinConsistency ?? 0 },
              { name: "Hydration", value: trends.hydrationConsistency ?? 0 },
              { name: "Movement", value: trends.movementConsistency ?? 0 },
              { name: "Nutrition", value: todayCheckin?.nutritionAlignment ?? 0 },
            ]}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fill: "#374151", fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "#374151", fontSize: 12 }} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              <Cell fill="#3B82F6" /> {/* Protein - Blue */}
              <Cell fill="#10B981" /> {/* Hydration - Green */}
              <Cell fill="#F59E0B" /> {/* Movement - Amber */}
              <Cell fill="#8B5CF6" /> {/* Nutrition - Violet */}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )}
</div>

{/* 3.5 Weekly Reflection */}
{weeklyReflection && (
  <div className="bg-white rounded-2xl shadow-sm p-6 mt-6">
    <h2 className="text-lg font-semibold text-gray-900 mb-2">
      Weekly Reflection
    </h2>
    <p className="text-sm text-gray-700 mb-2">
      Week {weeklyReflection.weekId?.split("-")[1] || ""} Summary:
    </p>
    <ul className="text-sm text-gray-600 mb-4 space-y-1">
      <li>Check-ins: {weeklyReflection.checkinsCompleted ?? 0} / 7</li>
      <li>Workouts: {weeklyReflection.workoutsThisWeek ?? 0}</li>
      {weeklyReflection.momentumScore && (
        <li>
          Momentum Score:{" "}
          <span className="font-semibold text-blue-700">
            {weeklyReflection.momentumScore}%
          </span>
        </li>
      )}
    </ul>
    <p className="text-gray-800 font-medium italic border-t border-gray-100 pt-3">
      “{weeklyReflection.coachNote || "Stay consistent — small wins compound."}”
    </p>

    {/* Next Focus Insight */}
    {trends && (
      <p className="text-sm text-gray-600 mt-4 border-t border-gray-100 pt-3">
        {getNextFocus(trends)}
      </p>
    )}
  </div>
)}

{/* 4. Consistency Tracker */}
<div className="bg-white rounded-2xl shadow-sm p-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-3">
    Consistency Tracker (Last 14 Days)
  </h2>
  {recentCheckins.length === 0 ? (
    <p className="text-gray-500 text-sm">No check-ins yet.</p>
  ) : (
    <div className="grid grid-cols-7 sm:grid-cols-14 gap-2">
      {recentCheckins.map((c) => {
        const moved = c.movedToday === "yes";
        const hydrated = c.hydrationHit === "yes";
        const protein = c.proteinHit === "yes";

        const shortDate = new Date(c.date).toLocaleDateString("en-US", {
          month: "numeric",
          day: "numeric",
        });

        return (
          <div
            key={c.date}
            className="flex flex-col items-center justify-center text-sm space-y-1"
          >
            <div className="flex gap-1">
              <span title="Moved" className={moved ? "text-green-500" : "text-gray-300"}>⬤</span>
              <span title="Hydration" className={hydrated ? "text-blue-500" : "text-gray-300"}>⬤</span>
              <span title="Protein" className={protein ? "text-orange-500" : "text-gray-300"}>⬤</span>
            </div>
            <span className="text-gray-500 text-xs">{shortDate}</span>
          </div>
        );
      })}
    </div>
  )}
</div>

{/* Mood Line Chart */}
<div className="mt-6">
  <ResponsiveContainer width="100%" height={180}>
    <LineChart data={moodHistory.length ? moodHistory : [{ day: "", mood: 0 }]}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis dataKey="day" tick={{ fill: "#374151", fontSize: 12 }} />
      <YAxis domain={[0, 3]} hide />
      <Tooltip />
      <Line type="monotone" dataKey="mood" stroke="#6366F1" strokeWidth={3} dot={{ fill: "#6366F1" }} />
    </LineChart>
  </ResponsiveContainer>
  <p className="text-sm text-gray-500 text-center mt-2">
    Mood Trend (Energized = 3, Okay = 2, Tired = 1)
  </p>
</div>
        {/* 5. Workout Summary */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Workout Summary
          </h2>

          {!trends ? (
            <p className="text-gray-500">Loading workout data...</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              <li className="py-2 flex justify-between items-center">
                <span className="text-gray-700">Sessions This Week</span>
                <span className="font-semibold text-blue-700">
                  {trends.workoutsThisWeek ?? 0}
                </span>
              </li>
              <li className="py-2 flex justify-between items-center">
                <span className="text-gray-700">Total Sets Completed</span>
                <span className="font-semibold text-blue-700">
                  {trends.totalSets ?? 0}
                </span>
              </li>
              <li className="py-2 flex justify-between items-center">
                <span className="text-gray-700">Average Duration</span>
                <span className="font-semibold text-blue-700">
                  {trends.avgDuration ?? 0} min
                </span>
              </li>
            </ul>
          )}

          <p className="mt-4 text-sm text-gray-500">
            *Stats update automatically after you complete a workout.
          </p>
        </div>

        {/* 6. Today’s Workout */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Today’s Workout
          </h2>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <>
              {!todayCheckin ? (
                <p className="text-gray-600 mb-3">
                  No session logged yet today. Ready to train?
                </p>
              ) : (
                <p className="text-gray-600 mb-3">
                  You completed your last check-in — keep that momentum.
                </p>
              )}

              <button
                onClick={async () => {
                  if (!todayCheckin) return;

                  const email = getEmail();
                  if (!email) {
                    console.error("No email found — cannot save session");
                    return;
                  }

                  const now = new Date().toISOString();

                  if (hasSessionToday) {
                    router.push("/summary");
                  } else {
                    // Log session start
                    await saveSession(email, { date: today, startedAt: now });
                    router.push("/program");
                  }
                }}
                disabled={!todayCheckin}
                className={`w-full py-2 rounded-md font-semibold transition ${
                  !todayCheckin
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : hasSessionToday
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {!todayCheckin
                  ? "Check in first"
                  : hasSessionToday
                  ? "View Summary"
                  : "Start Workout"}
              </button>
            </>
          )}
        </div>

        {/* 🧪 DEV RESET BUTTON */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-8 text-center">
            <button
              onClick={handleResetCheckin}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              🧪 Reset Today’s Check-In (Dev Only)
            </button>
          </div>
        )}

        {/* 🧪 DEV TOOLS PANEL */}
        {process.env.NODE_ENV === "development" && (
          <div className="absolute bottom-2 right-2 z-50 opacity-70 hover:opacity-100">
            <details className="bg-gray-800 text-white rounded-lg shadow-lg p-3 w-48">
              <summary className="cursor-pointer text-sm font-semibold text-center hover:text-blue-400">
                🧪 Dev Tools
              </summary>

              <div className="flex flex-col gap-2 mt-3">
                <button
                  onClick={async () => {
                    const email = getEmail();
                    if (!email) return;
                    await devSeedCheckins(email);
                    showToast({
                      message: "Seeded 14 test check-ins",
                      type: "success",
                    });
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-md py-1 text-sm"
                >
                  Seed Check-ins
                </button>

                <button
                  onClick={async () => {
                    const email = getEmail();
                    if (!email) return;
                    await devClearCheckins(email);
                    showToast({
                      message: "Cleared all check-ins",
                      type: "error", // fixed type
                    });
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-md py-1 text-sm"
                >
                  Reset Check-ins
                </button>

                <button
                  onClick={async () => {
                    const email = getEmail();
                    if (!email) return;
                    await devRecalculateWeeklyStats(email);
                    showToast({
                      message: "Recalculated weekly stats",
                      type: "info",
                    });
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-md py-1 text-sm"
                >
                  Recalculate Stats
                </button>
              </div>
            </details>
          </div>
        )}
      </div> {/* Close max-w-3xl wrapper */}
    </main>
  );
}