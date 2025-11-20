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
  headspace: "",
  proteinHit: "",
  hydrationHit: "",
  movedToday: "",
  sleepHit: "",  // ADD THIS LINE
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
const [currentFocus, setCurrentFocus] = useState<any>(null);
const [todayMomentum, setTodayMomentum] = useState<any>(null);
const [recentMomentum, setRecentMomentum] = useState<any[]>([]);
const [commitment, setCommitment] = useState<any>(null);
const [showCommitment, setShowCommitment] = useState(false);
const [commitmentStage, setCommitmentStage] = useState<"initial" | "reason" | "alternative">("initial");
const [commitmentReason, setCommitmentReason] = useState<string>("");
const [saving, setSaving] = useState(false);
console.log("🔥 Dashboard render:", {
  loading,
  profile,
  plan: profile?.plan,
});

console.log("👤 Profile check:", {
  profile,
  firstName: profile?.firstName,
  email: profile?.email
});

  const today = new Date().toISOString().split("T")[0];
  const [hasSessionToday, setHasSessionToday] = useState(false);
  // ✅ Single source of truth for check-in visibility
const hasCompletedCheckin = (): boolean => {
  if (!todayCheckin) return false;
  
  // Must have at least the core required fields
  const hasRequiredFields = !!(
    todayCheckin.headspace &&
    todayCheckin.proteinHit &&
    todayCheckin.hydrationHit
  );
  
  // Must be for TODAY (not a stale document)
  const isToday = todayCheckin.date === today;
  
  return hasRequiredFields && isToday;
};
// ✅ Determine primary habit based on intake assessment
// ✅ Determine primary habit based on intake assessment
const getPrimaryHabit = (intake?: any): { habit: string; habitKey: string } => {
  const activity = intake?.activity;
  
  // Default for sedentary/rare activity: build movement habit
  if (activity === "none" || activity === "rare") {
    return {
      habit: "Walk 10 minutes daily",
      habitKey: "walk_10min"
    };
  }
  
  // For people with some activity: hydration focus
  if (activity === "some") {
    return {
      habit: "Drink 100 oz of water daily",
      habitKey: "hydration_100oz"
    };
  }
  
  // For regular/daily: protein focus (they're already moving)
  return {
    habit: "Hit your protein target daily",
    habitKey: "protein_daily"
  };
};
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

 // ---- Load user's first name from root doc ----
const userRef = doc(db, "users", email);
const userSnap = await getDoc(userRef);

let firstName = "there";
if (userSnap.exists()) {
  const userData = userSnap.data();
  firstName = userData.firstName ?? "there";
}

// ---- Load intake + plan ----
const intakeRef = doc(db, "users", email, "profile", "intake");
const intakeSnap = await getDoc(intakeRef);

let profile: any = null;
if (intakeSnap.exists()) {
  profile = intakeSnap.data();
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
    // ---- Load momentum data ----
const focusRef = doc(db, "users", email, "momentum", "currentFocus");
const focusSnap = await getDoc(focusRef);
if (focusSnap.exists()) {
  setCurrentFocus(focusSnap.data());
}

const todayMomentumRef = doc(db, "users", email, "momentum", today);
const todayMomentumSnap = await getDoc(todayMomentumRef);
if (todayMomentumSnap.exists()) {
  setTodayMomentum(todayMomentumSnap.data());
}
// Load last 14 days of momentum
const momentumColRef = collection(db, "users", email, "momentum");
const momentumSnaps = await getDocs(momentumColRef);
const allMomentum = momentumSnaps.docs
  .map(d => d.data())
  .filter(m => m.date) // exclude currentFocus doc
  .sort((a, b) => a.date < b.date ? 1 : -1)
  .slice(0, 14);
setRecentMomentum(allMomentum);
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
  if (!checkin.headspace || !checkin.proteinHit || !checkin.hydrationHit) {
    showToast({ message: "Please answer all questions.", type: "error" });
    return;
  }

  try {
    const email = getEmail();
    if (!email) return;

    // ✅ Save today’s check-in
    const data: Checkin = {
      date: today,
      headspace: checkin.headspace,
      proteinHit: checkin.proteinHit,
      hydrationHit: checkin.hydrationHit,
      movedToday: checkin.movedToday,
      sleepHit: checkin.sleepHit,
      nutritionAlignment: checkin.nutritionAlignment,
      note: checkin.note || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveCheckin(email, data);

    // ✅ Auto-update weekly stats after saving the check-in
    await updateWeeklyStats(email);

    setTodayCheckin(data);
    setCheckinSubmitted(true);

   // --- MOMENTUM ENGINE v3 (3-Day Rolling Average) -------------------------

// Calculate today's weighted score
const moved = checkin.movedToday === "yes";
const hydrated = checkin.hydrationHit === "yes";
const nutritionScore = checkin.nutritionAlignment ?? 0;
const ateWell = nutritionScore >= 80;
const slept = checkin.sleepHit === "yes";

// Load current focus to determine primary habit
const currentFocusRef = doc(db, "users", email, "momentum", "currentFocus");
const currentFocusSnap = await getDoc(currentFocusRef);
const currentHabit = currentFocusSnap.exists() ? currentFocusSnap.data().habitKey : "walk_10min";

// Determine if primary habit was hit
let primaryHabitHit = false;
switch (currentHabit) {
  case "walk_10min":
  case "walk_15min":
    primaryHabitHit = moved;
    break;
  case "hydration_100oz":
    primaryHabitHit = hydrated;
    break;
  case "protein_daily":
    primaryHabitHit = checkin.proteinHit === "yes";
    break;
  case "sleep_7plus":
    primaryHabitHit = slept;
    break;
  default:
    primaryHabitHit = moved;
}

// Today's daily score (primary = 60%, secondary = 40%)
const primaryScore = primaryHabitHit ? 60 : 0;

// Secondary behaviors
const secondaryBehaviors = [];
if (currentHabit !== "hydration_100oz") secondaryBehaviors.push(hydrated);
if (currentHabit !== "walk_10min" && currentHabit !== "walk_15min") secondaryBehaviors.push(moved);
if (currentHabit !== "protein_daily") secondaryBehaviors.push(checkin.proteinHit === "yes");
if (currentHabit !== "sleep_7plus") secondaryBehaviors.push(slept);
secondaryBehaviors.push(ateWell); // nutrition always counts

const secondaryHits = secondaryBehaviors.filter(Boolean).length;
const secondaryScore = secondaryBehaviors.length > 0 
  ? Math.round((secondaryHits / secondaryBehaviors.length) * 40)
  : 0;

const todayScore = primaryScore + secondaryScore;

// Get last 3 days (including today) for rolling average
const last3Days = [];
for (let i = 0; i < 3; i++) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const dateKey = d.toISOString().split("T")[0];
  
  if (dateKey === today) {
    // Use today's fresh score (not in Firestore yet)
    last3Days.push(todayScore);
  } else {
    // Load from Firestore
    const dayRef = doc(db, "users", email, "momentum", dateKey);
    const daySnap = await getDoc(dayRef);
    
    if (daySnap.exists() && daySnap.data().dailyScore !== undefined) {
      last3Days.push(daySnap.data().dailyScore);
    } else {
      // Missing day = 0
      last3Days.push(0);
    }
  }
}

// Calculate 3-day weighted average (most recent day weighted highest)
const weights = [0.5, 0.3, 0.2]; // Today 50%, Yesterday 30%, 2 days ago 20%
const weightedSum = last3Days.reduce((sum, score, i) => sum + (score * weights[i]), 0);
const momentumScore = Math.round(weightedSum);

// Streak logic (separate from momentum)
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

// Streak increases just for checking in (regardless of score)
currentStreak += 1;
lifetimeStreak += 1;

// Earn streak saver every 7 days
if (currentStreak % 7 === 0) {
  streakSavers += 1;
}

// Save today's momentum data
await setDoc(doc(db, "users", email, "momentum", today), {
  date: today,
  dailyScore: todayScore,
  momentumScore: momentumScore,
  primaryHabitHit,
  moved,
  hydrated,
  slept,
  nutritionScore,
  currentStreak,
  lifetimeStreak,
  streakSavers,
  createdAt: new Date().toISOString(),
});

// ✅ Update local state immediately
setTodayMomentum({
  dailyScore: todayScore,
  momentumScore: momentumScore,
  currentStreak,
  lifetimeStreak,
  streakSavers,
  primaryHabitHit,
});

// Update currentFocus
if (!currentFocusSnap.exists()) {
  const primaryHabit = getPrimaryHabit(profile?.plan);
  
  await setDoc(currentFocusRef, {
    habit: primaryHabit.habit,
    habitKey: primaryHabit.habitKey,
    startedAt: today,
    consecutiveDays: primaryHabitHit ? 1 : 0,
    eligibleForLevelUp: false,
    createdAt: new Date().toISOString(),
  });
} else {
  const focusData = currentFocusSnap.data();
  const newConsecutive = primaryHabitHit ? (focusData.consecutiveDays || 0) + 1 : 0;
  
  await setDoc(currentFocusRef, {
    ...focusData,
    consecutiveDays: newConsecutive,
    eligibleForLevelUp: newConsecutive >= 7,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}
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
}, []); // Changed: only load once on mount

// ✅ Dev tools hook (seed / clear data)
useEffect(() => {
  const email = getEmail();
  if (email) {
    // seedFakeCheckins(email); // COMMENT THIS OUT
  }
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

// 🔹 Check-in listener: updates recentCheckins only (no coach note generation)
const unsubCheckins = onSnapshot(checkinRef, (snapshot) => {
  if (snapshot.metadata.hasPendingWrites) return;

  console.log("[Realtime] Check-in updated");
  const checkins = snapshot.docs.map((d) => d.data() as Checkin);
  setRecentCheckins(checkins);
});

// 🔹 Workout listener: updates workout stats only (no coach note generation)
const unsubSessions = onSnapshot(sessionsRef, (snapshot) => {
if (snapshot.metadata.hasPendingWrites) return;

console.log("[Realtime] Workout updated");
const sessions = snapshot.docs.map((d) => d.data());

// Simple update - just set workout count without spreading old state
setTrends({
  proteinConsistency: 0,
  hydrationConsistency: 0,
  movementConsistency: 0,
  checkinsCompleted: 0,
  moodTrend: "",
  totalSets: 0,
  avgDuration: 0,
  workoutsThisWeek: sessions.length,
});
});

// 🔹 Status listener (for dashboard sync)
const unsubStatus = onSnapshot(statusRef, (snap) => {
  if (snap.exists()) {
    console.log("[Realtime] Status updated:", snap.data());
    setStatus(snap.data());
  }
});

// ✅ Cleanup all listeners when component unmounts
return () => {
  unsubCheckins();
  unsubSessions();
  unsubStatus();
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
  const loadCommitment = async () => {
    const email = getEmail();
    if (!email) return;

    const commitRef = doc(db, "users", email, "momentum", "commitment");
    const snap = await getDoc(commitRef);

    if (!snap.exists()) {
      // No commitment exists, show prompt
      setShowCommitment(true);
      return;
    }

    const data = snap.data();
    setCommitment(data);

    // Check if commitment expired (7 days passed)
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      setShowCommitment(true); // Time to recommit or level up
    }
  };

  if (!loading && currentFocus) {
    loadCommitment();
  }
}, [loading, currentFocus]);


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
          
          {/* 1. Welcome Header with Integrated Commitment */}
<motion.div
  variants={itemVariants}
  className="bg-white rounded-2xl shadow-sm p-6 mb-6"
>
  <div className="flex items-start justify-between mb-4">
    {/* Left: Greeting */}
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-gray-900">
        Hey {profile?.firstName || "there"}.
      </h1>

      {hasCompletedCheckin() ? (
        <p className="text-gray-600 mt-1">You checked in today. That's the kind of consistency that compounds.</p>
      ) : (
        <p className="text-gray-600 mt-1">Welcome back. Ready to build?</p>
      )}

      {/* Streak Display */}
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

    {/* Right: Logo */}
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
  </div>

  {/* Commitment Section */}
<div className="mt-4 pt-4 border-t border-gray-200 transition-all duration-500 ease-in-out">
  {showCommitment && currentFocus ? (
    <div className="transition-all duration-500 ease-in-out">
      {/* Stage 1: Initial Prompt */}
      {commitmentStage === "initial" && (
        <div className="animate-fadeIn">
          <p className="text-gray-800 mb-3">
            Before we start tracking, I need to know you're in. Can you commit to{" "}
            <span className="font-semibold">{currentFocus.habit.toLowerCase()}</span> for the next 7 days, rain or shine?
          </p>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  const email = getEmail();
                  if (!email) return;

                  const weekId = getISOWeekId(new Date());
                  const expiresAt = new Date();
                  expiresAt.setDate(expiresAt.getDate() + 7);

                  await setDoc(doc(db, "users", email, "momentum", "commitment"), {
                    habitOffered: currentFocus.habit,
                    habitKey: currentFocus.habitKey,
                    accepted: true,
                    acceptedAt: new Date().toISOString(),
                    weekStarted: weekId,
                    expiresAt: expiresAt.toISOString(),
                    createdAt: new Date().toISOString(),
                  });

                  setShowCommitment(false);
                  loadDashboardData();
                } catch (err) {
                  console.error("Failed to save commitment:", err);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "I'm In"}
            </button>
            <button
              onClick={() => setCommitmentStage("reason")}
              className="flex-1 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg py-2 border-2 border-gray-300 transition"
            >
              Not Yet
            </button>
          </div>
        </div>
      )}

      {/* Stage 2: Reason Selection */}
      {commitmentStage === "reason" && (
        <div className="animate-fadeIn">
          <p className="text-gray-800 mb-3 font-semibold">
            I respect that. Let's figure out what would work better.
          </p>
          <p className="text-gray-700 mb-3 text-sm">What's making this feel difficult?</p>

          <div className="space-y-2 mb-3">
            <label className="flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer text-sm">
              <input
                type="radio"
                name="reason"
                value="time_too_big"
                checked={commitmentReason === "time_too_big"}
                onChange={(e) => setCommitmentReason(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-gray-800">The time commitment feels too big</span>
            </label>

            <label className="flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer text-sm">
              <input
                type="radio"
                name="reason"
                value="different_habit"
                checked={commitmentReason === "different_habit"}
                onChange={(e) => setCommitmentReason(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-gray-800">I'd rather focus on a different habit first</span>
            </label>

            <label className="flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer text-sm">
              <input
                type="radio"
                name="reason"
                value="something_else"
                checked={commitmentReason === "something_else"}
                onChange={(e) => setCommitmentReason(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-gray-800">Something else is in the way</span>
            </label>
          </div>

          <button
            onClick={async () => {
              if (!commitmentReason) return;

              setSaving(true);
              try {
                const email = getEmail();
                if (!email) return;

                await setDoc(doc(db, "users", email, "momentum", "commitment"), {
                  habitOffered: currentFocus.habit,
                  habitKey: currentFocus.habitKey,
                  accepted: false,
                  reason: commitmentReason,
                  createdAt: new Date().toISOString(),
                });

                if (commitmentReason === "time_too_big" || commitmentReason === "different_habit") {
                  setCommitmentStage("alternative");
                } else {
                  setShowCommitment(false);
                  loadDashboardData();
                }
              } catch (err) {
                console.error("Failed to save reason:", err);
              } finally {
                setSaving(false);
              }
            }}
            disabled={!commitmentReason || saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      )}

      {/* Stage 3: Alternative Options */}
      {commitmentStage === "alternative" && (
        <div className="animate-fadeIn">
          {commitmentReason === "time_too_big" ? (
            <>
              <p className="text-gray-800 mb-3 font-semibold">
                No problem. Would 5 minutes work better?
              </p>
              <p className="text-gray-700 mb-3 text-sm">
                Sometimes starting smaller is the key. Can you commit to a 5-minute walk every day for 7 days?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const email = getEmail();
                      if (!email) return;

                      const weekId = getISOWeekId(new Date());
                      const expiresAt = new Date();
                      expiresAt.setDate(expiresAt.getDate() + 7);

                      await setDoc(doc(db, "users", email, "momentum", "commitment"), {
                        habitOffered: currentFocus.habit,
                        habitKey: currentFocus.habitKey,
                        accepted: false,
                        reason: commitmentReason,
                        alternativeOffered: "Walk 5 minutes daily",
                        alternativeAccepted: true,
                        acceptedAt: new Date().toISOString(),
                        weekStarted: weekId,
                        expiresAt: expiresAt.toISOString(),
                        createdAt: new Date().toISOString(),
                      }, { merge: true });

                      await setDoc(doc(db, "users", email, "momentum", "currentFocus"), {
                        habit: "Walk 5 minutes daily",
                        habitKey: "walk_5min",
                        startedAt: new Date().toISOString().split("T")[0],
                        consecutiveDays: 0,
                        eligibleForLevelUp: false,
                        createdAt: new Date().toISOString(),
                      });

                      setShowCommitment(false);
                      loadDashboardData();
                    } catch (err) {
                      console.error("Failed to save alternative:", err);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Yes, 5 Minutes"}
                </button>
                <button
                  onClick={() => {
                    setShowCommitment(false);
                    loadDashboardData();
                  }}
                  className="flex-1 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg py-2 border-2 border-gray-300 transition"
                >
                  I'll Think About It
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-800 mb-3 font-semibold">
                No problem. What would you rather focus on?
              </p>
              <p className="text-gray-700 mb-3 text-sm">Pick the habit that feels most important right now:</p>

              <div className="space-y-2">
                {[
                  { habit: "Walk 10 minutes daily", key: "walk_10min", desc: "Build the movement habit" },
                  { habit: "Hit your protein target daily", key: "protein_daily", desc: "Fuel muscle and recovery" },
                  { habit: "Drink 100 oz of water daily", key: "hydration_100oz", desc: "Stay hydrated and energized" },
                  { habit: "Sleep 7+ hours nightly", key: "sleep_7plus", desc: "Recover and rebuild" },
                ].map((option) => (
                  <button
                    key={option.key}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const email = getEmail();
                        if (!email) return;

                        const weekId = getISOWeekId(new Date());
                        const expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + 7);

                        await setDoc(doc(db, "users", email, "momentum", "commitment"), {
                          habitOffered: currentFocus.habit,
                          habitKey: currentFocus.habitKey,
                          accepted: false,
                          reason: "different_habit",
                          alternativeOffered: option.habit,
                          alternativeAccepted: true,
                          acceptedAt: new Date().toISOString(),
                          weekStarted: weekId,
                          expiresAt: expiresAt.toISOString(),
                          createdAt: new Date().toISOString(),
                        }, { merge: true });

                        await setDoc(doc(db, "users", email, "momentum", "currentFocus"), {
                          habit: option.habit,
                          habitKey: option.key,
                          startedAt: new Date().toISOString().split("T")[0],
                          consecutiveDays: 0,
                          eligibleForLevelUp: false,
                          createdAt: new Date().toISOString(),
                        });

                        setShowCommitment(false);
                        loadDashboardData();
                      } catch (err) {
                        console.error("Failed to save habit selection:", err);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                    className="w-full text-left p-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition disabled:opacity-50"
                  >
                    <p className="font-semibold text-gray-900 text-sm">{option.habit}</p>
                    <p className="text-xs text-gray-600">{option.desc}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  ) : commitment && (commitment.accepted || commitment.alternativeAccepted) ? (
    /* Active Commitment Display - Always Visible */
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
        <div>
          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Your Commitment</p>
          <p className="text-sm font-bold text-gray-900 mt-1">
            🎯 {commitment.alternativeOffered || commitment.habitOffered}
          </p>
        </div>
        <p className="text-xs text-gray-600 font-semibold">
          Day {Math.floor((new Date().getTime() - new Date(commitment.acceptedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1} of 7
          </p>
      </div>
    </div>
  ) : null}
</div>
</motion.div>
{/* 2. Daily Check-In */}
{!hasCompletedCheckin() && (
  <motion.div
    variants={itemVariants}
    initial="visible"
    className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
  >
    <p className="text-xs text-gray-500 mb-4 pb-3 border-b border-gray-100">
      Before we move forward today, let's look back at how you showed up yesterday.
    </p>
    
    <h2 className="text-lg font-semibold text-gray-900 mb-3">
      Daily Check-In
    </h2>

    {/* Headspace */}
<p className="text-xs text-gray-500 mt-1">How's your headspace today?</p>
<div className="flex gap-2 mb-4">
  {["Clear", "Steady", "Off"].map((m) => (
    <button
      key={m}
      onClick={() => setCheckin((prev) => ({ ...prev, headspace: m.toLowerCase() }))}
      className={`flex-1 border rounded-lg py-2 ${
        checkin.headspace === m.toLowerCase()
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
{/* Sleep */}
<p className="text-xs text-gray-500 mt-1">
      Did you prioritize sleep last night?
    </p>
    <div className="flex gap-2 mb-4">
      {["Yes", "No"].map((s) => (
        <button
          key={s}
          onClick={() =>
            setCheckin((prev) => ({
              ...prev,
              sleepHit: s.toLowerCase(),
            }))
          }
          className={`flex-1 border rounded-lg py-2 ${
            checkin.sleepHit === s.toLowerCase()
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-700 hover:bg-blue-50"
          }`}
        >
          {s}
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
<p className="text-xs text-gray-500 text-center mt-1 italic">
  Anything above 80 is a win — perfection is not the goal.
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
        !checkin.headspace || !checkin.proteinHit || !checkin.hydrationHit
      }
      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 px-5 transition-colors duration-200 active:scale-[0.98]"
    >
      Save Check-In
    </button>
  </motion.div>
)}
       {/* Yesterday's Accountability */}
<motion.div
  variants={itemVariants}
  className="bg-white rounded-2xl shadow-sm p-5 mb-6"
>
  <h2 className="text-lg font-semibold text-gray-900 mb-4">
    Yesterday's actions, today's accountability
  </h2>
    
  {!todayCheckin ? (
    <EmptyState
      message="No check-in yet today."
      subtext="Complete your check-in to see yesterday's results."
    />
  ) : (
    <div className="space-y-4">
      {/* Results Grid - 2 columns, 6 items */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {/* Headspace */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Headspace</span>
          <span className={`text-sm font-semibold ${
            todayCheckin.headspace === "clear" ? "text-green-600" :
            todayCheckin.headspace === "steady" ? "text-blue-600" :
            "text-gray-500"
          }`}>
            {todayCheckin.headspace?.charAt(0).toUpperCase() + todayCheckin.headspace?.slice(1) || "—"}
          </span>
        </div>

        {/* Protein */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Protein</span>
          <span className={`text-sm font-semibold ${
            todayCheckin.proteinHit === "yes" ? "text-green-600" :
            todayCheckin.proteinHit === "almost" ? "text-yellow-500" :
            "text-red-500"
          }`}>
            {todayCheckin.proteinHit?.charAt(0).toUpperCase() + todayCheckin.proteinHit?.slice(1) || "—"}
          </span>
        </div>

        {/* Hydration */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Hydration</span>
          <span className={`text-sm font-semibold ${
            todayCheckin.hydrationHit === "yes" ? "text-green-600" : "text-gray-400"
          }`}>
            {todayCheckin.hydrationHit === "yes" ? "Hit" : "Missed"}
          </span>
        </div>

        {/* Sleep */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Sleep</span>
          <span className={`text-sm font-semibold ${
            todayCheckin.sleepHit === "yes" ? "text-green-600" : "text-gray-400"
          }`}>
            {todayCheckin.sleepHit === "yes" ? "Yes" : "No"}
          </span>
        </div>

        {/* Movement */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Movement</span>
          <span className={`text-sm font-semibold ${
            todayCheckin.movedToday === "yes" ? "text-green-600" : "text-gray-400"
          }`}>
            {todayCheckin.movedToday === "yes" ? "Yes" : "No"}
          </span>
        </div>

        {/* Nutrition */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Nutrition</span>
          <span className="text-sm font-semibold text-blue-700">
            {todayCheckin.nutritionAlignment ?? 0}%
          </span>
        </div>
      </div>

      {/* Note (if exists) */}
      {todayCheckin.note && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Note to Self:</p>
          <p className="text-sm text-gray-700 italic">"{todayCheckin.note}"</p>
        </div>
      )}
    </div>
  )}
</motion.div>
{/* Momentum Engine */}
<motion.div
  variants={itemVariants}
  className={`rounded-2xl shadow-sm p-5 mb-6 transition-all duration-500 ${
    !todayMomentum 
      ? 'bg-white'
      : todayMomentum.momentumScore >= 80
      ? 'bg-gradient-to-br from-red-50 to-amber-50 border-2 border-red-400'
      : todayMomentum.momentumScore >= 60
      ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-400'
      : 'bg-white border-2 border-gray-200'
  }`}
>
  <div className="flex items-start justify-between mb-4">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Your Momentum</h2>
      {currentFocus && (
        <p className="text-xs text-gray-500 mt-1">Focus: {currentFocus.habit}</p>
      )}
    </div>
    
    {todayMomentum && (
      <div className="text-right">
        <p className={`text-3xl font-bold ${
          todayMomentum.momentumScore >= 80 ? 'text-red-600' :
          todayMomentum.momentumScore >= 60 ? 'text-amber-600' :
          'text-gray-400'
        }`}>
          {todayMomentum.momentumScore}%
        </p>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Score</p>
      </div>
    )}
  </div>

  {currentFocus && todayMomentum ? (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div>
        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`absolute h-full transition-all duration-500 ${
              todayMomentum.momentumScore >= 80
                ? 'bg-gradient-to-r from-red-500 to-amber-500'
                : todayMomentum.momentumScore >= 60
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-blue-500 to-blue-400'
            }`}
            style={{ width: `${todayMomentum.momentumScore}%` }}
          />
        </div>
        
        <p className="text-[10px] text-gray-500 text-center mt-1">
          {todayMomentum.momentumScore < 40
            ? "Building..."
            : todayMomentum.momentumScore < 60
            ? "Gaining traction"
            : todayMomentum.momentumScore < 80
            ? "Heating up 🔥"
            : "On fire 🔥🔥"}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{todayMomentum.currentStreak}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Streak</p>
        </div>
        
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{todayMomentum.lifetimeStreak}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total</p>
        </div>
        
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{todayMomentum.streakSavers}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Savers</p>
        </div>
      </div>

      {/* Level Up Notice */}
      {currentFocus.eligibleForLevelUp && (
        <div className="bg-amber-500 text-gray-900 rounded-lg p-3 mt-3">
          <p className="text-sm font-semibold">🎯 Ready to level up</p>
          <p className="text-xs mt-1">Time to add the next brick.</p>
        </div>
      )}
    </div>
  ) : (
    <p className="text-gray-500 text-sm">Complete your first check-in to start building momentum.</p>
  )}
</motion.div>
{/* 💬 Dynamic Coach Card */}
<motion.div
    variants={itemVariants} className="fade-in delay-600 bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
<h2 className="text-lg font-semibold text-gray-900 mb-3">
    Here's what I'm seeing
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
          "Stay consistent, small wins compound into big results."}
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
  variants={itemVariants} 
  className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
>
  <h2 className="text-lg font-semibold text-gray-900 mb-3">
    What's Next
  </h2>

  {hasSessionToday ? (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-gray-50 rounded-lg p-4 shadow-inner">
      <div>
        <p className="text-sm text-gray-800 font-semibold">
          You trained today.
        </p>
        <p className="text-xs text-gray-500 mt-1">
          That's another brick in the foundation.
        </p>
      </div>

      <button
        onClick={() => router.push("/summary")}
        className="mt-3 sm:mt-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 px-5 transition-colors duration-200 active:scale-[0.98]"
      >
        View Session
      </button>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="text-gray-700">
        Today's scheduled training:{" "}
        <span className="font-semibold text-blue-700">
          {(() => {
            const schedule = profile?.plan?.schedule;
            if (!schedule || schedule.length === 0) return "Rest Day";
            const todayIdx = new Date().getDay();
            const today = schedule[todayIdx % schedule.length];
            return today?.name || "Rest Day";
          })()}
        </span>
      </p>

      <button
        onClick={() => router.push("/program")}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 px-5 transition-colors duration-200 active:scale-[0.98]"
      >
        Start Training
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