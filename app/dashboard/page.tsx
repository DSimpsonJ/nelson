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
  primaryHabit: {
    type: string;
    targetMinutes: number;
    createdAt: any;
    lastChangeAt: any;
    source: string;
  };
  hydrationTargetOz: number;
  proteinTargetG: number;
  goal: string;
  eatingPattern: string;
  activityLevel: string;
  scheduleLoad: string;
  sleepHours: string;
};

type UserProfile = {
  firstName: string;
  email: string;
  plan?: Plan;
};

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

/** ✅ Compute workout stats from sessions in Firestore */
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

/** ✅ Compute 7-day check-in trend averages */
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
  const weekId = getISOWeekId(new Date());
  const ref = doc(db, "users", email, "weeklyStats", weekId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as TrendStats) : null;
}

/** ✅ Calculate current check-in streak */
function calculateCheckinStreak(checkins: { date: string }[]): number {
  if (!checkins?.length) return 0;

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
      current = checkinDate;
    } else {
      break;
    }
  }

  return streak;
}

function getTodaysTrainingName(intake: any): string {
  if (!intake || !Array.isArray(intake.schedule) || intake.schedule.length === 0) {
    return "Rest Day";
  }

  const schedule = intake.schedule;
  const dayIdx = new Date().getDay();
  const todaysEntry = schedule[dayIdx % schedule.length];

  return todaysEntry?.name || "Rest Day";
}

function getTodaysWorkout(plan: any): WorkoutDetails | null {
  if (!plan || !Array.isArray(plan.schedule) || plan.schedule.length === 0) return null;

  const schedule = plan.schedule as WorkoutDetails[];
  const idx = new Date().getDay();
  return schedule[idx % schedule.length] ?? null;
}

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
    sleepHit: "",
    energyBalance: "",
    eatingPattern: "",
    primaryHabitDuration: "", // NEW - for auto-leveling
    note: "",
  });

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

  const today = new Date().toISOString().split("T")[0];
  const [hasSessionToday, setHasSessionToday] = useState(false);

  const hasCompletedCheckin = (): boolean => {
    if (!todayCheckin) return false;
    
    const hasRequiredFields = !!(
      todayCheckin.headspace &&
      todayCheckin.proteinHit &&
      todayCheckin.hydrationHit
    );
    
    const isToday = todayCheckin.date === today;
    
    return hasRequiredFields && isToday;
  };

  const getPrimaryHabit = (plan?: Plan): { habit: string; habitKey: string } => {
    if (!plan?.primaryHabit) {
      return {
        habit: "Move 10 minutes daily",
        habitKey: "movement_10min"
      };
    }

    const minutes = plan.primaryHabit.targetMinutes || 10;
    return {
      habit: `Move ${minutes} minutes daily`,
      habitKey: `movement_${minutes}min`
    };
  };

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

  const loadRecentCheckins = async (email: string) => {
    const colRef = collection(db, "users", email, "checkins");
    const snaps = await withFirestoreError(getDocs(colRef), "check-ins", showToast);
    if (!snaps) return;

    const all = snaps.docs.map((d) => d.data() as Checkin);

    const cutoff = subDays(new Date(), 14);
    const recent = all
      .filter((c) => new Date(c.date) >= cutoff)
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    setRecentCheckins(recent);
  };

  function normalizeTodayCheckin(raw: any, today: string): Checkin | null {
    if (!raw || typeof raw !== "object") return null;
    if (raw.date && raw.date !== today) return null;

    const { mood, proteinHit, hydrationHit } = raw;
    const hasCoreFields = !!(mood || proteinHit || hydrationHit);

    if (!hasCoreFields) return null;

    return raw as Checkin;
  }

  async function getTodaySession(email: string): Promise<boolean> {
    const sessionsCol = collection(db, "users", email, "sessions");
    const snaps = await withFirestoreError(getDocs(sessionsCol), "today's session", showToast);
    if (!snaps) return false;

    const today = new Date().toISOString().split("T")[0];
    return snaps.docs.some((d) => {
      const data = d.data();
      return data.date?.startsWith(today);
    });
  }

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

      // ---- Load NEW plan structure from profile/plan ----
      const planRef = doc(db, "users", email, "profile", "plan");
      const planSnap = await getDoc(planRef);

      let plan: Plan | null = null;

      if (planSnap.exists()) {
        plan = planSnap.data() as Plan;
      } else {
        console.warn("[Dashboard] No plan found at profile/plan");
      }

      setProfile({
        firstName,
        email,
        plan: plan || undefined,
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

      const momentumColRef = collection(db, "users", email, "momentum");
      const momentumSnaps = await getDocs(momentumColRef);
      const allMomentum = momentumSnaps.docs
        .map(d => d.data())
        .filter(m => m.date)
        .sort((a, b) => a.date < b.date ? 1 : -1)
        .slice(0, 14);
      setRecentMomentum(allMomentum);

      // ---- Today's check-in ----
      const rawToday = await getCheckin(email, today);

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

      await loadRecentCheckins(email);

      const streakColRef = collection(db, "users", email, "checkins");
      const streakSnaps = await getDocs(streakColRef);
      const allCheckins = streakSnaps.docs.map(
        (d) => d.data() as { date: string }
      );

      const streakValue = calculateCheckinStreak(allCheckins);
      setCheckinStreak(streakValue);

      const note = await refreshCoachNote(email, plan as any);
      setCoachNote(note);

      const sessionStats = await loadSessionTrends(email);
      const hasSession = await getTodaySession(email);
      setHasSessionToday(hasSession);

      const existingStats = await loadWeeklyStats(email);

      if (existingStats) {
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
        const trendColRef = collection(db, "users", email, "checkins");
        const trendSnaps = await getDocs(trendColRef);
        const checkins = trendSnaps.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
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

        try {
          const isMonday = new Date().getDay() === 1;
          if (isMonday) {
            const summaryWeekId = getISOWeekId(new Date());

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
        }

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

  const calculateNutritionScore = (
    energyBalance: string,
    eatingPattern: string,
    goal: string
  ): number => {
    if (goal === "fat_loss" || goal === "recomp") {
      if ((energyBalance === "light" || energyBalance === "normal") && eatingPattern === "meals") return 12;
      if ((energyBalance === "light" || energyBalance === "normal") && eatingPattern === "mixed") return 6;
      if (energyBalance === "heavy" || energyBalance === "indulgent") return 0;
      if (eatingPattern === "grazing") return 0;
      if (eatingPattern === "none") return 0;
    }

    if (goal === "maintenance") {
      if (energyBalance === "normal" && eatingPattern === "meals") return 12;
      if ((energyBalance === "light" || energyBalance === "heavy") && eatingPattern === "meals") return 6;
      if (energyBalance === "indulgent") return 0;
      if (eatingPattern === "grazing") return 0;
    }

    if (goal === "muscle_gain" || goal === "muscle") {
      if ((energyBalance === "heavy" || energyBalance === "normal") && eatingPattern === "meals") return 12;
      if (energyBalance === "light") return 0;
      if (eatingPattern === "grazing") return 0;
      if (eatingPattern === "mixed") return 6;
    }

    return 0;
  };

  const InfoTooltip = ({ text }: { text: string }) => {
    const [show, setShow] = useState(false);

    return (
      <span className="relative inline-block ml-1">
        <button
          type="button"
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          onClick={() => setShow(!show)}
          className="text-blue-600 hover:text-blue-700 text-xs leading-none"
        >
          ⓘ
        </button>
        {show && (
          <span className="absolute z-10 w-64 p-2 text-xs text-gray-700 bg-white border border-gray-300 rounded-lg shadow-lg -top-2 left-6 block">
            {text}
          </span>
        )}
      </span>
    );
  };

  const handleCheckinSubmit = async () => {
    if (!checkin.headspace || !checkin.proteinHit || !checkin.hydrationHit || !checkin.energyBalance || !checkin.eatingPattern) {
      showToast({ message: "Please answer all questions.", type: "error" });
      return;
    }

    try {
      const email = getEmail();
      if (!email) return;

      const data: Checkin = {
        date: today,
        headspace: checkin.headspace,
        proteinHit: checkin.proteinHit,
        hydrationHit: checkin.hydrationHit,
        movedToday: checkin.movedToday,
        sleepHit: checkin.sleepHit,
        energyBalance: checkin.energyBalance,
        eatingPattern: checkin.eatingPattern,
        primaryHabitDuration: checkin.primaryHabitDuration || "", // NEW - save duration
        note: checkin.note || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveCheckin(email, data);
      await updateWeeklyStats(email);

      setTodayCheckin(data);
      setCheckinSubmitted(true);

      // --- MOMENTUM ENGINE v3 (3-Day Rolling Average) -------------------------

      const moved = checkin.movedToday === "yes";
      const hydrated = checkin.hydrationHit === "yes";
      const nutritionScore = calculateNutritionScore(
        checkin.energyBalance,
        checkin.eatingPattern,
        profile?.plan?.goal || "fat_loss"
      );
      const ateWell = nutritionScore >= 12;
      const slept = checkin.sleepHit === "yes";

      const currentFocusRef = doc(db, "users", email, "momentum", "currentFocus");
      const currentFocusSnap = await getDoc(currentFocusRef);
      const currentHabit = currentFocusSnap.exists() ? currentFocusSnap.data().habitKey : "walk_10min";

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

      const primaryScore = primaryHabitHit ? 60 : 0;

      const secondaryBehaviors = [];
      if (currentHabit !== "hydration_100oz") secondaryBehaviors.push(hydrated);
      if (currentHabit !== "walk_10min" && currentHabit !== "walk_15min") secondaryBehaviors.push(moved);
      if (currentHabit !== "protein_daily") secondaryBehaviors.push(checkin.proteinHit === "yes");
      if (currentHabit !== "sleep_7plus") secondaryBehaviors.push(slept);
      secondaryBehaviors.push(nutritionScore >= 9);

      const secondaryHits = secondaryBehaviors.filter(Boolean).length;
      const secondaryScore = secondaryBehaviors.length > 0 
        ? Math.round((secondaryHits / secondaryBehaviors.length) * 40)
        : 0;

      const todayScore = primaryScore + secondaryScore;

      const last3Days = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().split("T")[0];
        
        if (dateKey === today) {
          last3Days.push(todayScore);
        } else {
          const dayRef = doc(db, "users", email, "momentum", dateKey);
          const daySnap = await getDoc(dayRef);
          
          if (daySnap.exists() && daySnap.data().dailyScore !== undefined) {
            last3Days.push(daySnap.data().dailyScore);
          } else {
            last3Days.push(0);
          }
        }
      }

      const weights = [0.5, 0.3, 0.2];
      const weightedSum = last3Days.reduce((sum, score, i) => sum + (score * weights[i]), 0);
      const momentumScore = Math.round(weightedSum);

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

      currentStreak += 1;
      lifetimeStreak += 1;

      if (currentStreak % 7 === 0) {
        streakSavers += 1;
      }

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

      setTodayMomentum({
        dailyScore: todayScore,
        momentumScore: momentumScore,
        currentStreak,
        lifetimeStreak,
        streakSavers,
        primaryHabitHit,
      });

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

      const note = await refreshCoachNote(email, profile?.plan as any);
      setCoachNote(note);
      await saveCoachNoteToWeeklyStats(email, note);

      showToast({ message: "Check-in saved!", type: "success" });
    } catch (err) {
      console.error("handleCheckinSubmit error:", err);
      showToast({ message: "Failed to save check-in", type: "error" });
    }
  };

  const handleResetCheckin = async () => {
    try {
      const email = getEmail();
      if (!email) return;
  
      await deleteDoc(doc(db, "users", email, "checkins", today));
  
      setTodayCheckin(null);
      setCheckinSubmitted(false);
  
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

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const fetchWeeklyReflection = async () => {
      try {
        const email = getEmail();
        if (!email) return;

        const weekId = getISOWeekId(new Date());
        const ref = doc(db, "users", email, "weeklyStats", weekId);

        const snap = await withFirestoreError(
          getDoc(ref),
          "weekly reflection",
          showToast
        );

        if (!snap) return;

        if (snap.exists()) {
          setWeeklyReflection(snap.data() as any);
        }
      } catch (err) {
        console.error("[Dashboard] Error fetching weekly reflection:", err);
      }
    };

    fetchWeeklyReflection();
  }, []);

  useEffect(() => {
    const email = getEmail();
    if (email) {
      // seedFakeCheckins(email);
    }
  }, []);

  useEffect(() => {
    const sessionDone = localStorage.getItem("sessionComplete");
    if (sessionDone) {
      console.log("[Lifecycle] Detected completed session → refreshing dashboard");
      localStorage.removeItem("sessionComplete");
      loadDashboardData();
    }
  }, []);

  useEffect(() => {
    const email = getEmail();
    if (!email) return;

    console.log("[Realtime] listeners attached");

    const checkinRef = collection(db, "users", email, "checkins");
    const sessionsRef = collection(db, "users", email, "sessions");
    const statusRef = doc(db, "users", email, "metadata", "status");

    const unsubCheckins = onSnapshot(checkinRef, (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return;

      console.log("[Realtime] Check-in updated");
      const checkins = snapshot.docs.map((d) => d.data() as Checkin);
      setRecentCheckins(checkins);
    });

    const unsubSessions = onSnapshot(sessionsRef, (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return;

      console.log("[Realtime] Workout updated");
      const sessions = snapshot.docs.map((d) => d.data());

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

    const unsubStatus = onSnapshot(statusRef, (snap) => {
      if (snap.exists()) {
        console.log("[Realtime] Status updated:", snap.data());
        setStatus(snap.data());
      }
    });

    return () => {
      unsubCheckins();
      unsubSessions();
      unsubStatus();
    };
  }, []);

  useEffect(() => {
    const loadRecentCheckins = async () => {
      const email = getEmail();
      if (!email) return;

      const colRef = collection(db, "users", email, "checkins");

      const snaps = await withFirestoreError(getDocs(colRef), "recent check-ins", showToast);
      if (!snaps) return;

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

  const [moodHistory] = useState<{ day: string; mood: number }[]>([]);

  function moodToScore(m: string): number {
    const val = m?.toLowerCase?.() || "";
    if (val === "energized") return 3;
    if (val === "okay") return 2;
    if (val === "tired") return 1;
    return 0;
  }

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
        setShowCommitment(true);
        return;
      }

      const data = snap.data();
      setCommitment(data);

      if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
        setShowCommitment(true);
      }
    };

    if (!loading && currentFocus) {
      loadCommitment();
    }
  }, [loading, currentFocus]);

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

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-500">Loading dashboard…</p>
      </main>
    );
  }

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
          className="bg-white rounded-2xl shadow-sm p-6 mb-6"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-gray-900">
                Hey {profile?.firstName || "there"}.
              </h1>

              {hasCompletedCheckin() ? (
                <p className="text-gray-600 mt-1">You checked in today. That's the kind of consistency that compounds.</p>
              ) : (
                <p className="text-gray-600 mt-1">Welcome back. Ready to build?</p>
              )}

              {checkinStreak > 0 && (() => {
                const { icon, message } = getStreakMessage(checkinStreak);
                return (
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-600 mt-2">
                    <span>{icon}</span>
                    <span>{message}</span>
                  </div>
                );
              })()}

              <p className="text-[11px] tracking-widest uppercase text-gray-400 font-semibold mt-2">
                Patience • Perseverance • Progress
              </p>
            </div>

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

        {/* 2. Morning Check-In */}
        {!hasCompletedCheckin() && (
          <motion.div
            variants={itemVariants}
            initial="visible"
            className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
          >
            <p className="text-xs text-gray-500 mb-4 pb-3 border-b border-gray-100">
              Accept where you've been, plan for where you're going. How'd you show up yesterday?
            </p>
            
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Daily Check-In
            </h2>

            {/* Tier 1: Nutrition Foundation */}
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-600 mb-2 flex items-center">
                    Energy Balance
                    <InfoTooltip text="Did you undereat, eat as intended, overeat, or have an indulgent day yesterday?" />
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {["Light", "Normal", "Heavy", "Indulgent"].map((option) => (
                      <button
                        key={option}
                        onClick={() =>
                          setCheckin((prev) => ({
                            ...prev,
                            energyBalance: option.toLowerCase(),
                          }))
                        }
                        className={`text-xs py-2 rounded border ${
                          checkin.energyBalance === option.toLowerCase()
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-blue-50"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-600 mb-2 flex items-center">
                    Eating Pattern
                    <InfoTooltip text="Structured whole food meals with protein + fiber score higher than directionless meals do. Overall, how did you eat yesterday?" />
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { value: "meals", label: "Structured" },
                      { value: "mixed", label: "Mixed" },
                      { value: "grazing", label: "Directionless" },
                      { value: "none", label: "No attention" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() =>
                          setCheckin((prev) => ({
                            ...prev,
                            eatingPattern: option.value,
                          }))
                        }
                        className={`text-xs py-2 rounded border ${
                          checkin.eatingPattern === option.value
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-blue-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Protein */}
              <div>
                <p className="text-xs text-gray-600 mb-2 flex items-center">
                  Protein
                  <InfoTooltip text={`Your target is ${profile?.plan?.proteinTargetG || 180}g/day based on your bodyweight goal`} />
                </p>
                <div className="flex gap-2">
                  {["Yes", "Almost", "No"].map((option) => (
                    <button
                      key={option}
                      onClick={() =>
                        setCheckin((prev) => ({
                          ...prev,
                          proteinHit: option.toLowerCase(),
                        }))
                      }
                      className={`flex-1 py-2 rounded border text-sm ${
                        checkin.proteinHit === option.toLowerCase()
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-300 text-gray-700 hover:bg-blue-50"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tier 2: Recovery & Movement */}
            <div className="space-y-3 mb-4 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-600 mb-2 flex items-center">
                    Sleep
                    <InfoTooltip text="7+ hours, no screens 30min before bed, lights out at a reasonable time" />
                  </p>
                  <div className="flex gap-2">
                    {["Yes", "No"].map((option) => (
                      <button
                        key={option}
                        onClick={() =>
                          setCheckin((prev) => ({
                            ...prev,
                            sleepHit: option.toLowerCase(),
                          }))
                        }
                        className={`flex-1 py-2 rounded border text-sm ${
                          checkin.sleepHit === option.toLowerCase()
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-blue-50"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-600 mb-2 flex items-center">
                    Headspace
                    <InfoTooltip text="An overall sense of how you're feeling today" />
                  </p>
                  <div className="flex gap-2">
                    {["Great!", "Decent", "Off"].map((option) => (
                      <button
                        key={option}
                        onClick={() =>
                          setCheckin((prev) => ({
                            ...prev,
                            headspace: option.toLowerCase(),
                          }))
                        }
                        className={`flex-1 py-2 rounded border text-xs ${
                          checkin.headspace === option.toLowerCase()
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-blue-50"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-600 mb-2 flex items-center">
                    Bonus Movement
                    <InfoTooltip text="Any intentional activity beyond your main focus. Examples: parking farther away, taking the stairs, gardening, walking the dog, cleaning, walking during calls." />
                  </p>
                  <div className="flex gap-2">
                    {["Yes", "No"].map((option) => (
                      <button
                        key={option}
                        onClick={() =>
                          setCheckin((prev) => ({
                            ...prev,
                            movedToday: option.toLowerCase(),
                          }))
                        }
                        className={`flex-1 py-2 rounded border text-sm ${
                          checkin.movedToday === option.toLowerCase()
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-blue-50"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-600 mb-2 flex items-center">
                    Hydration
                    <InfoTooltip text={`Your target is ${profile?.plan?.hydrationTargetOz || 100}oz/day`} />
                  </p>
                  <div className="flex gap-2">
                    {["Yes", "No"].map((option) => (
                      <button
                        key={option}
                        onClick={() =>
                          setCheckin((prev) => ({
                            ...prev,
                            hydrationHit: option.toLowerCase(),
                          }))
                        }
                        className={`flex-1 py-2 rounded border text-sm ${
                          checkin.hydrationHit === option.toLowerCase()
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-blue-50"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* NEW: Primary Habit Duration Picker */}
            <div className="pt-4 border-t border-gray-100 mb-4">
              <p className="text-xs text-gray-600 mb-2 flex items-center">
                About how long did you do your commitment yesterday?
                <InfoTooltip text="This helps us know when you're ready to level up. Be honest!" />
              </p>
              <div className="grid grid-cols-4 gap-2">
                {["1-3", "3-5", "5-10", "10-15", "15-20", "20-30", "30-45", "45+"].map((range) => (
                  <button
                    key={range}
                    onClick={() =>
                      setCheckin((prev) => ({
                        ...prev,
                        primaryHabitDuration: range,
                      }))
                    }
                    className={`text-xs py-2 rounded border ${
                      checkin.primaryHabitDuration === range
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-300 text-gray-700 hover:bg-blue-50"
                    }`}
                  >
                    {range} min
                  </button>
                ))}
              </div>
            </div>

            {/* Tier 3: Optional Note */}
            <div className="pt-4 border-t border-gray-100">
              {!checkin.note || checkin.note === "" ? (
                <button
                  type="button"
                  onClick={() => setCheckin((prev) => ({ ...prev, note: " " }))}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add a note?
                </button>
              ) : (
                <div>
                  <p className="text-xs text-gray-600 mb-2">Optional note</p>
                  <textarea
                    value={checkin.note || ""}
                    onChange={(e) =>
                      setCheckin((prev) => ({ ...prev, note: e.target.value }))
                    }
                    placeholder="Anything worth remembering about yesterday..."
                    className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-900"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={() => setCheckin((prev) => ({ ...prev, note: "" }))}
                    className="text-xs text-gray-500 hover:text-gray-700 mt-1"
                  >
                    Remove note
                  </button>
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={handleCheckinSubmit}
              disabled={
                !checkin.headspace ||
                !checkin.proteinHit ||
                !checkin.hydrationHit ||
                !checkin.energyBalance ||
                !checkin.eatingPattern
              }
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 mt-4 transition-colors duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
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

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Hydration</span>
                  <span className={`text-sm font-semibold ${
                    todayCheckin.hydrationHit === "yes" ? "text-green-600" : "text-gray-400"
                  }`}>
                    {todayCheckin.hydrationHit === "yes" ? "Hit" : "Missed"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Sleep</span>
                  <span className={`text-sm font-semibold ${
                    todayCheckin.sleepHit === "yes" ? "text-green-600" : "text-gray-400"
                  }`}>
                    {todayCheckin.sleepHit === "yes" ? "Yes" : "No"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Bonus Movement</span>
                  <span className={`text-sm font-semibold ${
                    todayCheckin.movedToday === "yes" ? "text-green-600" : "text-gray-400"
                  }`}>
                    {todayCheckin.movedToday === "yes" ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Energy Balance</span>
                  <span className="text-sm font-semibold text-blue-700">
                    {todayCheckin.energyBalance ? todayCheckin.energyBalance.charAt(0).toUpperCase() + todayCheckin.energyBalance.slice(1) : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Eating Pattern</span>
                  <span className="text-sm font-semibold text-blue-700">
                    {todayCheckin.eatingPattern === "meals" ? "Meals" : 
                     todayCheckin.eatingPattern === "mixed" ? "Mixed" : 
                     todayCheckin.eatingPattern === "grazing" ? "Grazing" : "—"}
                  </span>
                </div>

                {todayCheckin.primaryHabitDuration && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Commitment Duration</span>
                    <span className="text-sm font-semibold text-blue-700">
                      {todayCheckin.primaryHabitDuration} min
                    </span>
                  </div>
                )}
              </div>

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

        {/* Coach Card */}
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
        >
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

              <p className="text-gray-800 font-medium italic border-t border-gray-100 pt-3">
                "
                {weeklyReflection.coachNote ||
                  "Stay consistent, small wins compound into big results."}
                "
              </p>

              {trends && (
                <p className="text-sm text-gray-600 mt-4 border-t border-gray-100 pt-3">
                  {getNextFocus(trends)}
                </p>
              )}
            </>
          )}
        </motion.div>

        {/* Today's Training */}
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
                Ready to build today?
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

        {/* Consistency Tracker */}
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
        >
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

        {/* Workout Summary */}
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
        >
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

        {/* Today's Workout Button */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Today's Workout
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

        {/* Dev Reset Button */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-8 text-center">
            <button
              onClick={handleResetCheckin}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              🧪 Reset Today's Check-In (Dev Only)
            </button>
          </div>
        )}

        {/* Dev Tools Panel */}
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
                      type: "error",
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
      </motion.div>
    </motion.main>
  );
}