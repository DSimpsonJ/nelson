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
import { onSnapshot, } from "firebase/firestore";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { updateWeeklyStats } from "../utils/updateWeeklyStats";
import { refreshCoachNote, saveCoachNoteToWeeklyStats } from "../utils/refreshCoachNote";
import { seedFakeCheckins } from "../utils/seedFakeCheckins";
import { devClearCheckins, devSeedCheckins, devRecalculateWeeklyStats } from "../utils/devTools";
import { TrendStats, CheckinTrend } from "../types/trends";
import { generateCoachInsight } from "../utils/generateCoachInsight";
import { logInsight } from "../utils/logInsight";
import { generateWeeklySummary } from "../utils/generateWeeklySummary";
import { getStreakMessage } from "../utils/getStreakMessage";
import { withFirestoreError } from "../utils/withFirestoreError";
import Image from "next/image";
import { motion } from "framer-motion";

/** ---------- Types ---------- */

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
  plan?: Plan | any; // allows plan to include schedule from intake
};

// put this near your other types in page.tsx
type WorkoutDetails = {
  name: string;
  type?: string;
  focus?: string;
  duration?: number;
  sets?: number;
  reps?: string;
};
function EmptyState({
  message,
  subtext,
}: {
  message: string;
  subtext?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-500">
      <p className="font-medium">{message}</p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}
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
function safeGetSchedule(profile: any) {
  try {
    const schedule = profile?.plan?.schedule;
    return Array.isArray(schedule) && schedule.length ? schedule : null;
  } catch {
    return null;
  }
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
/** ✅ Calculate current check-in streak */
function calculateCheckinStreak(checkins: { date: string }[]): number {
  if (!checkins?.length) return 0;

  // Sort by newest first
  const sorted = [...checkins].sort((a, b) =>
    a.date < b.date ? 1 : -1
  );

  let streak = 0;
  let current = new Date();

  for (const c of sorted) {
    const checkinDate = new Date(c.date);
    const diffDays = Math.floor(
      (current.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0 || diffDays === 1) {
      streak++;
      current = checkinDate; // move the window back
    } else {
      break; // streak broken
    }
  }

  return streak;
}
/** ✅ Utility: get today's training name from intake data (Firestore layout fix) */
function getTodaysTrainingName(intake: any): string {
  if (!intake || !Array.isArray(intake.schedule) || intake.schedule.length === 0) {
    return "Rest Day";
  }

  const schedule = intake.schedule;
  const dayIdx = new Date().getDay(); // 0 = Sunday, 6 = Saturday
  const todaysEntry = schedule[dayIdx % schedule.length];

  return todaysEntry?.name || "Rest Day";
}
/** Utility: get today’s workout from the user’s plan */
function getTodaysWorkout(plan: any): WorkoutDetails | null {
  if (!plan || !Array.isArray(plan.schedule) || plan.schedule.length === 0) return null;

  const schedule = plan.schedule as WorkoutDetails[];
  const idx = new Date().getDay(); // 0..6
  return schedule[idx % schedule.length] ?? null;
}
/** Utility: format workout metadata */
function getWorkoutDetails(plan: any) {
  if (!plan?.schedule) return null;

  const dayIndex = new Date().getDay();
  const todayWorkout = plan.schedule[dayIndex];

  if (!todayWorkout) return null;

  return {
    name: todayWorkout.name || "Rest Day",
    type: todayWorkout.type || "General",
    focus: todayWorkout.focus || "Full Body",
    duration: todayWorkout.duration || 45,
    sets: todayWorkout.sets || null,
    reps: todayWorkout.reps || null,
  };
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
  movedToday: "",
  nutritionAlignment: 0,
  note: "",
});

// 🧩 Real-time workout status
const [status, setStatus] = useState<{
  lastCompleted?: string;
  nextWorkoutIndex?: number;
  lastDayType?: string;
} | null>(null);

const [checkinSubmitted, setCheckinSubmitted] = useState(false);
const [checkinStreak, setCheckinStreak] = useState<number>(0);
const [trends, setTrends] = useState<TrendStats | null>(null);
const [recentCheckins, setRecentCheckins] = useState<Checkin[]>([]);

  console.log("🔥 Dashboard render:", {
    loading,
    profile,
    plan: profile?.plan,
  });

  const today = new Date().toISOString().split("T")[0];
  const [hasSessionToday, setHasSessionToday] = useState(false);
// ✅ Load full user profile (including generated plan)
useEffect(() => {
  const loadProfile = async () => {
    try {
      const email = getEmail();
      if (!email) return;

      const profileRef = doc(db, "users", email, "profile", "intake");
      const snap = await getDoc(profileRef);

      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      } else {
        console.warn("[Dashboard] No intake/profile found.");
      }
    } catch (err) {
      console.error("[Dashboard] Failed to load profile:", err);
    }
  };

  loadProfile();
}, []);
 /** ✅ Fetch the last 14 days of check-ins */
const loadRecentCheckins = async (email: string) => {
  const colRef = collection(db, "users", email, "checkins");

  // ✅ Use the Firestore wrapper to handle any errors gracefully
  const snaps = await withFirestoreError(getDocs(colRef), "check-ins", showToast);
  if (!snaps) return; // Stop if Firestore failed

  const all = snaps.docs.map((d) => d.data() as Checkin);

  const cutoff = subDays(new Date(), 14);
  const recent = all
    .filter((c) => new Date(c.date) >= cutoff)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  setRecentCheckins(recent);
};
function normalizeTodayCheckin(raw: any, today: string): Checkin | null {
  if (!raw || typeof raw !== "object") return null;

  // If a date exists and it is NOT today, ignore it
  if (raw.date && raw.date !== today) return null;

  // If it has no meaningful fields, treat it as empty
  const { mood, proteinHit, hydrationHit } = raw;
  const hasCoreFields = !!(mood || proteinHit || hydrationHit);

  if (!hasCoreFields) return null;

  return raw as Checkin;
}
 /** ✅ Check if user has logged a session today */
async function getTodaySession(email: string): Promise<boolean> {
  const sessionsCol = collection(db, "users", email, "sessions");

  // ✅ Use the Firestore error handler
  const snaps = await withFirestoreError(getDocs(sessionsCol), "today’s session", showToast);
  if (!snaps) return false; // Stop gracefully if Firestore failed

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

    // ---- Load intake + plan as profile ----
    const intakeRef = doc(db, "users", email, "profile", "intake");
    const intakeSnap = await getDoc(intakeRef);

    let profile: any = null;
    let firstName = "there";

    if (intakeSnap.exists()) {
      profile = intakeSnap.data();
      firstName = profile.firstName ?? "there";
    } else {
      console.warn("[Dashboard] No intake profile found");
    }

    // ---- Plan (intake-based) ----
    const planRef = doc(db, "users", email, "profile", "intake");
    const planSnap = await getDoc(planRef);

    let plan: any = null;

    if (planSnap.exists()) {
      const data = planSnap.data() as any;

      // Newer structure: plan nested
      if (data.plan) {
        plan = data.plan;
      }
      // Older structure: schedule/dailyHabits/weekOneFocus at top level
      else if (data.schedule || data.weekOneFocus || data.dailyHabits) {
        plan = {
          planType:         data.planType ?? "health",
          goal:             data.goal ?? "Improve overall health",
          trainingDays:     data.trainingDays ?? 3,
          experience:       data.experience ?? "beginner",
          equipment:        data.equipment ?? "full",
          hydrationTarget:  data.hydrationTarget ?? 3,
          sleepTarget:      data.sleepTarget ?? 7.5,
          coachingStyle:    data.coachingStyle ?? "encouraging",
          startDate:        data.startDate ?? new Date().toISOString(),
          weekOneFocus:     data.weekOneFocus ?? "",
          dailyHabits:      data.dailyHabits ?? [],
          schedule:         data.schedule ?? [],
        };
      }
    }

    // Attach plan so profile.plan.* keeps working everywhere
    setProfile({
      firstName,
      email,
      plan,
    });
   // ---- Today’s check-in ----
const rawToday = await getCheckin(email, today);

// A valid check-in must:
// 1) exist
// 2) be an object
// 3) have a "date" field that matches TODAY
let todayData = null;

if (
  rawToday &&
  typeof rawToday === "object" &&
  rawToday.date === today
) {
  todayData = rawToday;
}

setTodayCheckin(todayData);
setCheckinSubmitted(!!todayData);

console.log("CHECK-IN VISIBILITY TEST (fixed):", {
  rawToday,
  todayData,
  checkinSubmitted: !!todayData,
});

    // Load recent check-ins AFTER the normalization
    await loadRecentCheckins(email);

    // ✅ Calculate streak based on all check-ins
    const streakColRef = collection(db, "users", email, "checkins");
    const streakSnaps = await getDocs(streakColRef);
    const allCheckins = streakSnaps.docs.map(
      (d) => d.data() as { date: string }
    );

    const streakValue = calculateCheckinStreak(allCheckins);
    setCheckinStreak(streakValue);

    // ---- Coach note ----
    const note = await refreshCoachNote(email, plan);
    setCoachNote(note);

    // ---- Session stats (workouts) ----
    const sessionStats = await loadSessionTrends(email);
    const hasSession = await getTodaySession(email);
    setHasSessionToday(hasSession);

    // ---- Prefer stored weekly stats if present ----
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
      // ---- Recompute check-in trends from raw check-ins ----
      const trendColRef = collection(db, "users", email, "checkins");
      const trendSnaps = await getDocs(trendColRef);
      const checkins = trendSnaps.docs.map((d) => {
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

      // ---- Persist weekly stats by ISO week id ----
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

      // 🪞 Generate and save a weekly summary (Monday only)
      try {
        const isMonday = new Date().getDay() === 1; // 0=Sun, 1=Mon
        if (isMonday) {
          const summaryWeekId = getISOWeekId(new Date());

          // Pull recent coach insights
          const insightsSnap = await getDocs(
            collection(db, "users", email, "insights")
          );
          const insights = insightsSnap.docs.map(
            (d) => d.data() as { note: string; createdAt: string }
          );

          const recent = recentCheckins ?? [];

          const summaryText = generateWeeklySummary(
            summaryWeekId,
            merged,
            insights,
            recent
          );

          await setDoc(
            doc(db, "users", email, "weeklySummaries", summaryWeekId),
            {
              summary: summaryText,
              weekId: summaryWeekId,
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        console.error("Weekly summary write failed:", err);
        // Quiet failure on purpose
      }

      // ---- Generate and store the coach insight (single source) ----
      const insight = generateCoachInsight(merged, recentCheckins);
      setCoachNote(insight);
      await saveCoachNoteToWeeklyStats(email, insight);
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
    const data: Checkin = {
      date: today,
      mood: checkin.mood,
      proteinHit: checkin.proteinHit,
      hydrationHit: checkin.hydrationHit,
      movedToday: checkin.movedToday,
      nutritionAlignment: checkin.nutritionAlignment,
      note: checkin.note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveCheckin(email, data);

    // ✅ Auto-update weekly stats after saving the check-in
    await updateWeeklyStats(email);

    setTodayCheckin(data);
    setCheckinSubmitted(true);

    // --- MOMENTUM ENGINE v1 -------------------------
    const moved = checkin.movedToday === "yes";
    const hydrated = checkin.hydrationHit === "yes";
    const nutritionScore = checkin.nutritionAlignment ?? 0;
    const ateWell = nutritionScore >= 80;

    const slept = (checkin as any).sleepHit === "yes";

    const behaviors = [moved, hydrated, slept, ateWell];
    const wins = behaviors.filter(Boolean).length;

    const momentumScore = Math.round((wins / 4) * 100);

    // Look up yesterday's momentum to continue streaks
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split("T")[0];

    const prevSnap = await getDoc(
      doc(db, "users", email, "momentum", yesterdayKey)
    );

    let currentStreak = 0;
    let lifetimeStreak = 0;
    let streakSavers = 0;

    if (prevSnap.exists()) {
      const prev = prevSnap.data() as any;
      currentStreak = prev.currentStreak ?? 0;
      lifetimeStreak = prev.lifetimeStreak ?? 0;
      streakSavers = prev.streakSavers ?? 0;
    }

    const passed = wins === 4;

    if (passed) {
      currentStreak += 1;
    } else {
      if (streakSavers > 0) {
        streakSavers -= 1;
      } else {
        currentStreak = 0;
      }
    }

    lifetimeStreak += 1;

    if (passed && currentStreak % 7 === 0) {
      streakSavers += 1;
    }

    await setDoc(doc(db, "users", email, "momentum", today), {
      date: today,
      moved,
      hydrated,
      slept,
      nutritionScore,
      momentumScore,
      passed,
      currentStreak,
      lifetimeStreak,
      streakSavers,
      createdAt: new Date().toISOString(),
    });

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
  
      await deleteDoc(doc(db, "users", email, "checkins", today));
  
      // Immediately clear local state
      setTodayCheckin(null);
      setCheckinSubmitted(false);
  
      // IMPORTANT: delay reload slightly so Firestore listeners settle
      setTimeout(() => {
        loadDashboardData();
      }, 150);
  
      showToast({
        message: "Today's check-in reset",
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
    try {
      const email = getEmail();
      if (!email) return;

      const weekId = getISOWeekId(new Date());
      const ref = doc(db, "users", email, "weeklyStats", weekId);

      // ✅ Safely wrap the Firestore call
      const snap = await withFirestoreError(
        getDoc(ref),
        "weekly reflection",
        showToast
      );

      // Stop here if wrapper returned null (Firestore failed)
      if (!snap) return;

      // Normal logic continues
      if (snap.exists()) {
        setWeeklyReflection(snap.data() as any);
      }
    } catch (err) {
      console.error("[Dashboard] Error fetching weekly reflection:", err);
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
  }, []);
  // 🌀 Auto-refresh dashboard after workout completion
useEffect(() => {
  const sessionDone = localStorage.getItem("sessionComplete");
  if (sessionDone) {
    console.log("[Lifecycle] Detected completed session → refreshing dashboard");
    localStorage.removeItem("sessionComplete");
    loadDashboardData(); // already defined in your file
  }
}, []);
 // ✅ Real-time listener (read-only, no Firestore write loop)
useEffect(() => {
  const email = getEmail();
  if (!email) return;

  console.log("[Realtime] listeners attached");

  const checkinRef = collection(db, "users", email, "checkins");
  const sessionsRef = collection(db, "users", email, "sessions");
  const statusRef = doc(db, "users", email, "metadata", "status");

  // 🔹 Check-in listener: updates recentCheckins and refreshes coach insight
  const unsubCheckins = onSnapshot(checkinRef, async (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;

    console.log("[Realtime] Check-in updated");
    const checkins = snapshot.docs.map((d) => d.data() as Checkin);
    setRecentCheckins(checkins);

    // 💬 Auto-refresh the coach insight dynamically
    const latestTrends = trends || null;
    if (latestTrends) {
      const style =
        (trends as any)?.coachingStyle ||
        (globalThis as any)?.coachingStyle ||
        "encouraging";

      const newInsight = generateCoachInsight(latestTrends, checkins, style);
      setCoachNote(newInsight);

      // email is available from the parent scope of this effect
      await saveCoachNoteToWeeklyStats(email, newInsight);
      await logInsight(email, newInsight, {
        source: "checkin_update",
        stats: latestTrends,
      });
    }
  });

  // 🔹 Workout listener: updates workout stats and refreshes insight
  const unsubSessions = onSnapshot(sessionsRef, async (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;

    console.log("[Realtime] Workout updated");
    const sessions = snapshot.docs.map((d) => d.data());

    // Update the trend for workouts this week (keep your other fields intact)
    const updatedStats: TrendStats = {
      ...(trends ?? {
        proteinConsistency: 0,
        hydrationConsistency: 0,
        movementConsistency: 0,
        checkinsCompleted: 0,
        moodTrend: "",
        totalSets: 0,
        avgDuration: 0,
        workoutsThisWeek: 0,
      }),
      workoutsThisWeek: sessions.length,
    };

    setTrends(updatedStats);

    // 💬 Generate updated insight whenever workouts change
    const checkins = recentCheckins ?? [];
    const style = profile?.plan?.coachingStyle ?? "encouraging";
    const newInsight = generateCoachInsight(updatedStats, checkins, style);
    setCoachNote(newInsight);

    await saveCoachNoteToWeeklyStats(email, newInsight);
    await logInsight(email, newInsight, {
      source: "workout_update",
      stats: updatedStats,
    });
  });

  // 🔹 NEW: Status listener (for dashboard sync)
  const unsubStatus = onSnapshot(statusRef, (snap) => {
    if (snap.exists()) {
      console.log("[Realtime] Status updated:", snap.data());
      setStatus(snap.data()); // ✅ updates state when Firestore doc changes
    }
  });

  // ✅ Cleanup all listeners when component unmounts
  return () => {
    unsubCheckins();
    unsubSessions();
    unsubStatus(); // ✅ added cleanup for new listener
  };
}, []);
  // ✅ Recent Check-ins for Mood History (Last 14 Days)
  useEffect(() => {
    const loadRecentCheckins = async () => {
      const email = getEmail();
      if (!email) return;
  
      const colRef = collection(db, "users", email, "checkins");
  
      // ✅ Firestore wrapper for safety and toast feedback
      const snaps = await withFirestoreError(getDocs(colRef), "recent check-ins", showToast);
      if (!snaps) return; // stop if Firestore failed
  
      const all = snaps.docs.map((d) => d.data() as Checkin);
  
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
  
      const recent = all
        .filter((c) => new Date(c.date) >= cutoff)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
  
      setRecentCheckins(recent);
    };
  
    loadRecentCheckins();
  }, [todayCheckin]);
  // ✅ Mood history for the line chart (last 7 days)
 // Keeping placeholder state for compatibility with coach insight generation
const [moodHistory] = useState<{ day: string; mood: number }[]>([]);
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
// ✅ Framer Motion variants for staggered fade-in
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut" as const,
    },
  },
};
// ✅ Single early-return. No hooks below this line.
// Only block while actually loading
if (loading) {
  return (
    <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <p className="text-gray-500">Loading dashboard…</p>
    </main>
  );
}
console.log("🔍 CHECK-IN VISIBILITY TEST:", {
  todayCheckin,
  checkinSubmitted,
  type: typeof todayCheckin,
  keys: todayCheckin ? Object.keys(todayCheckin) : null
});

    return (
      <motion.main
  variants={containerVariants}
  initial="hidden"
  animate="visible"
  className="min-h-screen bg-gray-50 p-6"
>
  <motion.div
    variants={containerVariants}
    className="max-w-3xl mx-auto space-y-6"
  >
          
          {/* 1. Welcome Header */}
          <motion.div
  variants={itemVariants}
  className="bg-white rounded-2xl shadow-sm p-4 mb-3 transition-shadow hover:shadow flex items-start justify-between"
>
  {/* Left side: greeting, streak, tagline */}
  <div className="flex flex-col">
    <h1 className="text-2xl font-bold text-gray-900">
      Hey {profile?.firstName || "there"}.
    </h1>

    {checkinSubmitted ? (
      <p className="text-gray-600 mt-1">You’ve already checked in today.</p>
    ) : (
      <p className="text-gray-600 mt-1">{greeting}</p>
    )}

   {/* 🔥 Check-in Streak Display */}
{checkinStreak > 0 && (() => {
  const { icon, message } = getStreakMessage(checkinStreak);
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-amber-600 mt-2">
      <span>{icon}</span>
      <span>{message}</span>
    </div>
  );
})()}

{/* Tagline */}
<p className="text-[11px] tracking-widest uppercase text-gray-400 font-semibold mt-2">
  Patience • Perseverance • Progress
</p>
</div>

{/* Right side: Nelson logo */}
<div className="mt-1 mr-2 w-32 sm:w-36 md:w-40">
  <Image
    src="/logo.png"
    alt="Nelson Logo"
    width={160}
    height={90}
    className="w-full h-auto"
    priority
  />
</div>
</motion.div>

{/* 1.5 Weekly Focus Card */}
{profile?.plan?.weekOneFocus && (
  <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
    <h2 className="text-lg font-semibold text-gray-900 mb-1">
      This Week’s Focus
    </h2>

    <p className="text-gray-700 mb-3">
      {profile.plan.weekOneFocus}
    </p>

    {profile.plan.dailyHabits?.length > 0 && (
      <div>
        <p className="text-sm font-medium text-gray-800 mb-2">Daily habits:</p>
        <ul className="list-disc list-inside text-gray-700 space-y-1">
          {profile.plan.dailyHabits.map((h: string, i: number) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}

       {/* 2. Daily Check-In */}
{(!todayCheckin && !checkinSubmitted) && (
  <motion.div
    variants={itemVariants}
    initial="visible"
    className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
  >
    <h2 className="text-lg font-semibold text-gray-900 mb-3">
      Daily Check-In
    </h2>

    {/* Mood */}
    <p className="text-xs text-gray-500 mt-1">How are you feeling?</p>
    <div className="flex gap-2 mb-4">
      {["Pumped!", "Good Enough", "Meh"].map((m) => (
        <button
          key={m}
          onClick={() => setCheckin((prev) => ({ ...prev, mood: m }))}
          className={`flex-1 border rounded-lg py-2 ${
            checkin.mood === m
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-700 hover:bg-blue-50"
          }`}
        >
          {m}
        </button>
      ))}
    </div>

    {/* Protein */}
    <p className="text-xs text-gray-500 mt-1">
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
          className={`flex-1 border rounded-lg py-2 ${
            checkin.proteinHit === p.toLowerCase()
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-700 hover:bg-blue-50"
          }`}
        >
          {p}
        </button>
      ))}
    </div>

    {/* Hydration */}
    <p className="text-xs text-gray-500 mt-1">
      Did you down at least {profile?.plan?.hydrationTarget ?? 100} oz of water?
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
          className={`flex-1 border rounded-lg py-2 ${
            checkin.hydrationHit === h.toLowerCase()
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-700 hover:bg-blue-50"
          }`}
        >
          {h}
        </button>
      ))}
    </div>

    {/* Steps */}
    <p className="text-xs text-gray-500 mt-1">
      Did you get some intentional extra steps?
    </p>
    <div className="flex gap-2 mb-4">
      {["Yes", "No"].map((m) => (
        <button
          key={m}
          onClick={() =>
            setCheckin((prev) => ({ ...prev, movedToday: m.toLowerCase() }))
          }
          className={`flex-1 border rounded-lg py-2 ${
            checkin.movedToday === m.toLowerCase()
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-700 hover:bg-blue-50"
          }`}
        >
          {m}
        </button>
      ))}
    </div>

    {/* Nutrition Slider */}
    <p className="text-xs text-gray-500 mt-1">
      How closely did your eating match your intentions?
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

    {/* Note */}
    <textarea
      value={checkin.note || ""}
      onChange={(e) =>
        setCheckin((prev) => ({ ...prev, note: e.target.value }))
      }
      placeholder="Optional note about your day..."
      className="w-full border border-gray-300 rounded-md p-2 text-gray-900 mb-4"
      rows={3}
    />

    {/* Save */}
    <button
      onClick={handleCheckinSubmit}
      disabled={
        !checkin.mood || !checkin.proteinHit || !checkin.hydrationHit
      }
      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 px-5 transition-colors duration-200 active:scale-[0.98]"
    >
      Save Check-In
    </button>
  </motion.div>
)}

       {/* 3. Daily Results */}
       <motion.div
    variants={itemVariants} className="fade-in delay-400 bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
  <h2 className="text-xl font-semibold text-gray-900 mb-3">
    Daily Results
  </h2>
    
  {!todayCheckin ? (
  <EmptyState
    message="No check-in yet today."
    subtext="Tap your check-in to get started."
  />
) : (
  <div className="grid grid-cols-2 gap-4">
      {/* Nutrition Alignment */}
      <div className="flex flex-col bg-gray-50 rounded-lg p-4 shadow-inner">
        <span className="text-sm font-medium text-gray-700 mb-1">Nutrition Alignment</span>
        <span className="text-lg font-bold text-blue-700">
          {todayCheckin.nutritionAlignment ?? 0}%
        </span>
        <p className="text-xs text-gray-500 mt-1">How closely you followed your plan.</p>
      </div>

      {/* Protein Target */}
      <div className="flex flex-col bg-gray-50 rounded-lg p-4 shadow-inner">
        <span className="text-sm font-medium text-gray-700 mb-1">Protein Target</span>
        <span
          className={`text-lg font-bold ${
            todayCheckin.proteinHit === "yes"
              ? "text-green-600"
              : todayCheckin.proteinHit === "almost"
              ? "text-yellow-500"
              : "text-red-500"
          }`}
        >
          {todayCheckin.proteinHit
            ? todayCheckin.proteinHit.charAt(0).toUpperCase() +
              todayCheckin.proteinHit.slice(1)
            : "—"}
        </span>
        <p className="text-xs text-gray-500 mt-1">Hit your protein minimum today?</p>
      </div>

      {/* 🏋️ Workout Status (real-time) */}
<div className="flex flex-col bg-gray-50 rounded-lg p-4 shadow-inner">
  <span className="text-sm font-medium text-gray-700 mb-1">Workout</span>

  <span
    className={`text-lg font-bold ${
      status?.lastCompleted ? "text-green-600" : "text-gray-400"
    }`}
  >
    {status?.lastCompleted ? "Complete ✅" : "Pending"}
  </span>

  <p className="text-xs text-gray-500 mt-1">
  {(() => {
    const schedule = safeGetSchedule(profile);
    if (status?.nextWorkoutIndex !== undefined && schedule) {
      const nextName =
        schedule[
          status.nextWorkoutIndex % schedule.length
        ]?.name || "Rest Day";
      return `Next: ${nextName}`;
    }
    return "Next: —";
  })()}
</p>
  {/* ✅ NEW: last completed timestamp */}
  {status?.lastCompleted && (
    <p className="text-[11px] text-gray-400 mt-1 italic">
      Completed{" "}
      {formatDistanceToNow(new Date(status.lastCompleted), {
        addSuffix: true,
      })}
    </p>
  )}
</div>

      {/* Non-Exercise Activity */}
      <div className="flex flex-col bg-gray-50 rounded-lg p-4 shadow-inner">
        <span className="text-sm font-medium text-gray-700 mb-1">Non-Exercise Activity</span>
        <span
          className={`text-lg font-bold ${
            todayCheckin.movedToday === "yes" ? "text-green-600" : "text-gray-400"
          }`}
        >
          {todayCheckin.movedToday === "yes" ? "Yes" : "No"}
        </span>
        <p className="text-xs text-gray-500 mt-1">Intentional daily movement.</p>
      </div>
    </div>
  )}

  <p className="text-xs text-gray-500 text-center mt-4">
    Small wins compound, step forward every day.
  </p>
</motion.div>

{/* 💬 Dynamic Coach Card */}
<motion.div
    variants={itemVariants} className="fade-in delay-600 bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
<h2 className="text-lg font-semibold text-gray-900 mb-3">
    Coaching Reflection & Focus
  </h2>

  {!weeklyReflection ? (
    <EmptyState
      message="No weekly reflection yet."
      subtext="Complete a full week of check-ins to unlock your coaching summary."
    />
  ) : (
    <>
      <p className="text-sm text-gray-700 mb-2">
        Week {weeklyReflection.weekId?.split("-")[1] || ""} Review
      </p>

      <ul className="text-sm text-gray-600 mb-4 space-y-1">
        <li>Check-ins: {weeklyReflection.checkinsCompleted ?? 0} / 7</li>
        <li>Workouts: {weeklyReflection.workoutsThisWeek ?? 0}</li>
        {weeklyReflection.momentumScore && (
          <li>
            Momentum Score:
            <span className="font-semibold text-blue-700">
              {" "}
              {weeklyReflection.momentumScore}%
            </span>
          </li>
        )}
      </ul>

      {/* Main coach message */}
      <p className="text-gray-800 font-medium italic border-t border-gray-100 pt-3">
        “
        {weeklyReflection.coachNote ||
          "Stay consistent — small wins compound into big results."}
        ”
      </p>

      {/* Present-focused action cue */}
      {trends && (
        <p className="text-sm text-gray-600 mt-4 border-t border-gray-100 pt-3">
          {getNextFocus(trends)}
        </p>
      )}
    </>
  )}
</motion.div>
{/* 4. Today's Training */}
<motion.div
    variants={itemVariants} className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow fade-in [animation-delay:0.8s]">
<h2 className="text-lg font-semibold text-gray-900 mb-3">
    Today’s Training
  </h2>

  {hasSessionToday ? (
    // ✅ Completed session view
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-gray-50 rounded-lg p-4 shadow-inner">
      <div>
        <p className="text-sm text-gray-800 font-semibold">
          Training Complete
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Great job completing your scheduled session, momentum is compounding.
        </p>
      </div>

      <button
        onClick={() => router.push("/summary")}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 px-5 transition-colors duration-200 active:scale-[0.98]"
      >
        View Summary
      </button>
    </div>
  ) : (
    // 🔹 Scheduled view (before completion)
    <div className="text-gray-600 text-sm">
      <p className="text-gray-800 font-medium">
        Scheduled Training:{" "}
        <span className="font-semibold text-blue-700">
          {(() => {
            const schedule = profile?.plan?.schedule;
            if (!schedule || schedule.length === 0) return "No plan found";
            const todayIdx = new Date().getDay(); // 0..6
            const today = schedule[todayIdx % schedule.length];
            return today?.name || "Rest Day";
          })()}
        </span>
      </p>

      <button
        onClick={() => router.push("/program")}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 px-5 transition-colors duration-200 active:scale-[0.98]"
      >
        View Program
      </button>
    </div>
  )}
</motion.div>
{/* 5. Consistency Tracker */}
<motion.div
    variants={itemVariants} className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
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
              <span title="Protein" className={protein ? "text-amber-500" : "text-gray-300"}>⬤</span>
            </div>
            <span className="text-gray-500 text-xs">{shortDate}</span>
          </div>
        );
      })}
    </div>
  )}
</motion.div>

        {/* 5. Workout Summary */}
        <motion.div
    variants={itemVariants} className="fade-in delay-800 bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
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
        </motion.div>

        {/* 6. Today’s Workout */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Today’s Workout
          </h2>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <>
              {!todayCheckin ? (
  <EmptyState
    message="No workout logged yet."
    subtext="Your next training session will appear here once you complete it."
  />
) : (
  <div className="mb-3 text-center text-gray-600">
    <p>You completed your last check-in — keep that momentum.</p>
  </div>
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
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-md"
                    : "bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-md"
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
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-md py-1 text-sm"
                >
                  Recalculate Stats
                </button>
              </div>
            </details>
          </div>
        )}
      </motion.div> {/* Close max-w-3xl wrapper */}
      </motion.main>
  );
}