"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  deleteDoc,
  query,
  orderBy,
  limit,
  writeBatch,
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
import { motion, AnimatePresence } from "framer-motion";
import WalkTimer from "../components/WalkTimer";
import { calculateDailyMomentumScore, determinePrimaryHabitHit, applyMomentumCap } from "../utils/momentumCalculation";
import { getDayVisualState } from "../utils/history/getDayVisualState";
import { isGrowthHabit, getNextLevel, getLevelDescription, extractMinutes } from "@/app/utils/habitConfig";
import { logHabitEvent, getRecentHabitEvents } from "@/app/utils/habitEvents";
import { checkLevelUpEligibility as checkEligibilityPure } from "@/app/utils/checkLevelUpEligibility";
import type { DailyDoc } from "@/app/utils/checkLevelUpEligibility";
import { runBackfill } from "@/app/utils/backfillMomentumStructure";
import { writeDailyMomentum } from "@/app/services/writeDailyMomentum";
import { 
  getCurrentFocus, 
  setCurrentFocus as setCurrentFocusService,  // RENAME THIS
  updateLevel, 
  type CurrentFocus 
} from "@/app/services/currentFocus";
import { getLocalDate, getLocalDateOffset, daysBetween } from "@/app/utils/date";
import { getRewardForEvent, type RewardPayload } from "@/app/services/rewardEngine";
import RewardRenderer from "@/app/components/rewards/RewardRenderer";
import CheckinSuccessAnimation from "@/app/components/rewards/CheckinSuccessAnimation";
import FirstTimeDashboard from "./FirstTimeDashboard";
import { detectAndHandleMissedCheckIns } from '@/app/services/missedCheckIns';
import { selectMomentumMessage } from '@/app/services/messagingGuide';
import MomentumTooltip from '@/app/components/MomentumTooltip';
import HistoryAccess from "@/app/components/HistoryAccess";
import { NelsonLogo, NelsonLogoAnimated  } from '@/app/components/logos';


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
  isActivated?: boolean; // 🆕 Add this
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
  const [commitmentStage, setCommitmentStage] = useState<"initial" | "reason" | "alternative" | "choose" | "custom">("initial");
  const [commitmentReason, setCommitmentReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [missedDays, setMissedDays] = useState(0);
  const today = getLocalDate();
  const [hasSessionToday, setHasSessionToday] = useState(false);
  const [levelUpEligible, setLevelUpEligible] = useState(false);
  const [averageDuration, setAverageDuration] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpStage, setLevelUpStage] = useState<"prompt" | "reflection" | "alternative" | "adjust">("prompt");
  const [levelUpReason, setLevelUpReason] = useState<string>("");
  const [levelUpNextStep, setLevelUpNextStep] = useState<string>("");
  const [habitStack, setHabitStack] = useState<any[]>([]);
  const [pendingReward, setPendingReward] = useState<RewardPayload | null>(null);
  const [checkinSuccess, setCheckinSuccess] = useState(false);
  const [showMomentumTooltip, setShowMomentumTooltip] = useState(false);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);
  const [consistencyPercentage, setConsistencyPercentage] = useState<number>(0);

  const hasCompletedCheckin = (): boolean => {
    // New schema: check momentum doc
    if (todayMomentum && todayMomentum.date === today) {
      return true;
    }
    
    // Old schema: backwards compatibility
    if (!todayCheckin) return false;
    
    const hasRequiredFields = !!(
      todayCheckin.headspace &&
      todayCheckin.proteinHit &&
      todayCheckin.hydrationHit
    );
    
    return hasRequiredFields && todayCheckin.date === today;
  };
  const [historyStats, setHistoryStats] = useState({
    currentStreak: 0,
    totalCheckIns: 0,
    monthlyConsistency: 0,
  });
  const [planDetails, setPlanDetails] = useState({
    proteinMin: 0,
    proteinMax: 0,
    hydrationMin: 64,
    hydrationMax: 100,
    movementMinutes: 0,
  });
  const getEnhancedMessage = () => {
    if (!todayMomentum) {
      return "Complete today's check-in to start building.";
    }
    
    // Just use the message from the momentum doc
    return todayMomentum.momentumMessage || "Building momentum";
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
  const isMovementHabit = (habitKey: string): boolean => {
    return habitKey?.includes("walk_") || habitKey?.includes("movement_");
  };
  
  const getTargetMinutes = (habitKey: string): number => {
    const match = habitKey.match(/(\d+)min/);
    return match ? parseInt(match[1], 10) : 10;
  };
  const calculateConsistency = (
    momentumDocs: any[], 
    accountAgeDays: number
  ): number => {
    // Don't calculate until day 7
    if (accountAgeDays < 7) return 0;
    
    // Determine window size (up to 30 days)
    const windowSize = Math.min(accountAgeDays, 30);
    
    // Count real check-ins (not missed) in the window
    const realCheckIns = momentumDocs
      .filter(doc => doc.checkinType === "real" || !doc.missed)
      .slice(0, windowSize)
      .length;
    
    // Calculate percentage
    return Math.round((realCheckIns / windowSize) * 100);
  };
  const getHabitType = (habitKey: string): string => {
    if (habitKey.includes("walk_") || habitKey.includes("movement_")) return "movement";
    if (habitKey.includes("protein_")) return "protein";
    if (habitKey.includes("hydration_")) return "hydration";
    if (habitKey.includes("sleep_")) return "sleep";
    if (habitKey === "no_late_eating") return "eating_pattern";
    if (habitKey === "vegetables_3_servings") return "vegetables";
    return "custom";
  };
  const moveCurrentToStack = async (email: string, currentHabit: any): Promise<void> => {
    const stackRef = doc(db, "users", email, "momentum", "habitStack");
    const stackSnap = await getDoc(stackRef);
    
    const existingStack = stackSnap.exists() ? (stackSnap.data().habits || []) : [];
    
    // Add current habit to stack
    const newStackEntry = {
      habit: currentHabit.habit,
      habitKey: currentHabit.habitKey,
      startedAt: currentHabit.startedAt,
      daysOnThisHabit: currentHabit.daysOnThisHabit || 0,
      status: "active",
      movedToStackAt: new Date().toISOString(),
    };
    // Log the stack event
await logHabitEvent(email, {
  type: "moved_to_stack",
  date: getLocalDate(),
  habitKey: currentHabit.habitKey,
  habitName: currentHabit.habit,
  stackPosition: existingStack.length + 1,
});
    await setDoc(stackRef, {
      habits: [...existingStack, newStackEntry],
      updatedAt: new Date().toISOString(),
    });
  };
  
  const isInHabitStack = (habitKey: string): boolean => {
    if (currentFocus?.habitKey === habitKey) return true;
    return habitStack.some(h => h.habitKey === habitKey);
  };
  
  const getHabitIcon = (habitKey: string): string => {
    if (currentFocus?.habitKey === habitKey) return "🎯";
    if (habitStack.some(h => h.habitKey === habitKey)) return "🧱";
    return "";
  };
  const hasCompletedPrimaryHabit = (): boolean => {
    if (!currentFocus || !commitment) return false;
    
    // For movement habits, check if session exists
    if (isMovementHabit(currentFocus.habitKey)) {
      return hasSessionToday;
    }
    return false;
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

    const today = getLocalDate();
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
// ===== NEW: STEP 3 - Detect missed check-ins FIRST =====
const gapInfo = await detectAndHandleMissedCheckIns(email);
if (gapInfo.hadGap) {
  console.log(`[Dashboard] Gap detected: ${gapInfo.daysMissed} days`);
  setMissedDays(gapInfo.daysMissed);
}

      // ---- Load user's first name from root doc ----
      const userRef = doc(db, "users", email);
      const userSnap = await getDoc(userRef);

      let firstName = "there";
      let isActivated = false; 
      let hasSeenWelcome = false;
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        firstName = userData.firstName ?? "there";
        isActivated = userData.isActivated ?? false; // 🆕 Load activation status
        hasSeenWelcome = userData.hasSeenDashboardWelcome ?? false;  // ← ADD THIS
      }
// ===== NEW: Show welcome if first time =====
if (!hasSeenWelcome) {
  setShowWelcomeMessage(true);
  
  // Mark as seen immediately
  await setDoc(userRef, {
    hasSeenDashboardWelcome: true,
    dashboardWelcomeSeenAt: new Date().toISOString()
  }, { merge: true });
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
        isActivated, // 🆕 Add to profile state
      });
      // ---- Load momentum data ----
      const focusRef = doc(db, "users", email, "momentum", "currentFocus");
      const focusSnap = await getDoc(focusRef);
      
      if (focusSnap.exists()) {
        setCurrentFocus(focusSnap.data());
      } else if (plan && (plan.primaryHabit as any)?.suggested) {
        // New user with suggested habit - create suggested currentFocus for commitment flow
        const suggestedFocus = {
          habit: `Move ${plan.primaryHabit.targetMinutes} minutes daily`,
          habitKey: `movement_${plan.primaryHabit.targetMinutes}min`,
          suggested: true,
          createdAt: new Date().toISOString(),
        };
        setCurrentFocus(suggestedFocus);
      }
      console.log("[Dashboard] currentFocus:", focusSnap.exists() ? focusSnap.data() : "NOT FOUND");

      // Load habit stack
const stackRef = doc(db, "users", email, "momentum", "habitStack");
const stackSnap = await getDoc(stackRef);
if (stackSnap.exists()) {
  console.log("[Dashboard] Loaded habitStack:", stackSnap.data().habits);
  setHabitStack(stackSnap.data().habits || []);
} else {
  console.log("[Dashboard] No habitStack found");
  setHabitStack([]);
}
const commitRef = doc(db, "users", email, "momentum", "commitment");
const commitSnap = await getDoc(commitRef);
const commitmentData = commitSnap.exists() ? commitSnap.data() : null;
console.log("[DEBUG] Commitment loaded:", commitmentData);
setCommitment(commitmentData);
// Show commitment modal if no commitment exists OR if it's expired
const shouldShowCommitmentModal = 
  !commitSnap.exists() || 
  (commitmentData?.expiresAt && new Date(commitmentData.expiresAt) < new Date());

setShowCommitment(shouldShowCommitmentModal);

const todayMomentumRef = doc(db, "users", email, "momentum", today);
const todayMomentumSnap = await getDoc(todayMomentumRef);
if (todayMomentumSnap.exists()) {
  const momentumData = todayMomentumSnap.data();
  setTodayMomentum(momentumData);
  console.log("[DEBUG] Streak loaded:", momentumData.currentStreak); 
  // 🆕 If there's ANY momentum doc for today, mark check-in as done
  if (momentumData.date === today) {
    setCheckinSubmitted(true);
  }
}
// ===== NEW: Check if we should show momentum tooltip =====
if (userSnap.exists() && todayMomentumSnap.exists()) {
  const userData = userSnap.data();
  const momentumData = todayMomentumSnap.data();
  const hasSeenTooltip = userData.hasSeenMomentumTooltip ?? false;
  
  // Show tooltip after 5 seconds if:
  // 1. User hasn't seen it
  // 2. User is on Day 1 (accountAgeDays === 1)
  if (!hasSeenTooltip && momentumData.accountAgeDays === 1) {
    setTimeout(() => {
      setShowMomentumTooltip(true);
    }, 13000); // 13 seconds
  }
}
// =========================================================
      const momentumColRef = collection(db, "users", email, "momentum");
      const momentumSnaps = await getDocs(momentumColRef);
      const allMomentum = momentumSnaps.docs
        .map(d => d.data())
        .filter(m => m.date)
        .sort((a, b) => a.date < b.date ? 1 : -1)
        .slice(0, 14);
      setRecentMomentum(allMomentum);
     // ===== NEW: Calculate consistency =====
if (todayMomentumSnap.exists()) {
  const todayData = todayMomentumSnap.data();
  const accountAgeDays = todayData.accountAgeDays || 1;
  
  const consistency = calculateConsistency(allMomentum, accountAgeDays);
  setConsistencyPercentage(consistency);
  
  console.log(`[Dashboard] Consistency: ${consistency}% (${accountAgeDays} days old)`);
}

// ===== Calculate history stats for preview =====
const currentStreak = todayMomentumSnap.exists() 
  ? (todayMomentumSnap.data().currentStreak || 0) 
  : 0;

// Count ONLY date-formatted docs (exclude metadata)
const totalCheckIns = momentumSnaps.docs.filter(d => {
  const docId = d.id;
  const data = d.data();
  if (!docId.match(/^\d{4}-\d{2}-\d{2}$/)) return false;
  return data.checkinType === "real" || !data.missed;
}).length;

// Calculate monthly consistency - last 30 days
let accountAgeDays = 1;

if (todayMomentumSnap.exists()) {
  accountAgeDays = todayMomentumSnap.data().accountAgeDays || 1;
} else {
  // Get from most recent momentum doc
  const datedDocs = momentumSnaps.docs
    .filter(d => d.id.match(/^\d{4}-\d{2}-\d{2}$/))
    .map(d => d.data())
    .filter(d => d.accountAgeDays !== undefined);

  if (datedDocs.length > 0) {
    accountAgeDays = Math.max(...datedDocs.map(d => d.accountAgeDays));
  }
}

// Window is CALENDAR DAYS, not doc count
const windowSize = Math.min(accountAgeDays, 30);

// Count only real check-ins (no slicing)
const realCheckIns = momentumSnaps.docs.filter(d => {
  const id = d.id;
  const data = d.data();
  if (!id.match(/^\d{4}-\d{2}-\d{2}$/)) return false;
  return data.checkinType === "real";
}).length;

const monthlyConsistency = Math.round((realCheckIns / windowSize) * 100);

setHistoryStats({ currentStreak, totalCheckIns: realCheckIns, monthlyConsistency });
console.log(`[Dashboard] History stats: Streak ${currentStreak}, Total ${realCheckIns}, Month ${monthlyConsistency}%`);
// =========================================================
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

// Get streak from today's momentum doc (new system)
if (todayMomentumSnap.exists()) {
  const todayData = todayMomentumSnap.data();
  const streakValue = todayData.currentStreak || 0;
  setCheckinStreak(streakValue);
} else {
  setCheckinStreak(0);
}

// Detect missed days from momentum collection
const missedDaysColRef = collection(db, "users", email, "momentum");
const missedDaysSnaps = await getDocs(missedDaysColRef);
const allMomentumDocs = missedDaysSnaps.docs
  .map(d => ({ date: d.data().date }))
  .filter(d => d.date && d.date.match(/^\d{4}-\d{2}-\d{2}$/)) // Only date-formatted docs
  .sort((a, b) => b.date.localeCompare(a.date));

if (allMomentumDocs.length > 0) {
  const lastCheckin = new Date(allMomentumDocs[0].date + "T00:00:00");
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  
  const diffTime = todayDate.getTime() - lastCheckin.getTime();
  const missed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  setMissedDays(missed);
}
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
      
      await checkLevelUpEligibility(
        email, 
        focusSnap.exists() ? focusSnap.data() : null, 
        commitmentData
      );
    } catch (err) {
      console.error("Dashboard load error:", err);
      showToast({ message: "Error loading dashboard", type: "error" });
    } finally {
      setLoading(false);
    }
  };
  const handleDismissMomentumTooltip = async () => {
    setShowMomentumTooltip(false);
    
    try {
      const email = getEmail();
      if (!email) return;
      
      // Store flag in Firebase
      const userRef = doc(db, "users", email);
      await setDoc(userRef, {
        hasSeenMomentumTooltip: true,
        momentumTooltipSeenAt: new Date().toISOString()
      }, { merge: true });
      
      console.log("[Dashboard] Momentum tooltip dismissed");
    } catch (err) {
      console.error("Error dismissing tooltip:", err);
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
  <span className="absolute z-10 w-64 p-2 text-xs text-gray-700 bg-white border border-gray-300 rounded-lg shadow-lg bottom-full mb-2 left-1/2 -translate-x-1/2 block max-w-[calc(100vw-2rem)]">
    {text}
  </span>
)}
      </span>
    );
  };
  const getMissedDays = (): number => {
    // Find the last check-in date
    const sorted = [...recentCheckins].sort((a, b) => b.date.localeCompare(a.date));
    if (!sorted.length) return 0;
    
    const lastCheckin = new Date(sorted[0].date + "T00:00:00");
const todayStr = new Date().toLocaleDateString("en-CA");
const today = new Date(todayStr + "T00:00:00");

const diffTime = today.getTime() - lastCheckin.getTime();
const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };
  const checkLevelUpEligibility = async (
    email: string,
    focus: any = null,
    commit: any = null
  ): Promise<void> => {
    const currentFocusData = focus || currentFocus;
    const commitmentData = commit || commitment;
    
    console.log("[Level-Up] Checking eligibility...");
    console.log("[Level-Up] currentFocus:", currentFocusData);
    
    if (!currentFocusData) {
      console.log("[Level-Up] No currentFocus found");
      setShowLevelUp(false);
      return;
    }
    
    const currentHabit = currentFocusData.habitKey || "walk_10min";
    
    // Only check growth habits
    if (!isGrowthHabit(currentHabit)) {
      console.log("[Level-Up] Not a growth habit:", currentHabit);
      setShowLevelUp(false);
      return;
    }
  
    // Check 7-day cooldown
    const commitRef = doc(db, "users", email, "momentum", "commitment");
    const commitSnap = await getDoc(commitRef);
    
    if (commitSnap.exists()) {
      const data = commitSnap.data();
      const lastShown = data.levelUpPrompts?.lastShown;
      
      if (lastShown) {
        const todayLocal = getLocalDate();
const daysSincePrompt = daysBetween(lastShown.split("T")[0], todayLocal);
        
        console.log("[Level-Up] Days since last prompt:", daysSincePrompt);
        
        if (daysSincePrompt < 7) {
          console.log("[Level-Up] Shown too recently, skipping");
          setShowLevelUp(false);
          return;
        }
      } 
    }
  
    // Get last 7 days from momentum docs
    const last7Days: DailyDoc[] = [];
    for (let i = 0; i < 7; i++) {
      const dateKey = getLocalDateOffset(i);
    
      const dayRef = doc(db, "users", email, "momentum", dateKey);
      const daySnap = await getDoc(dayRef);
    
      if (daySnap.exists()) {
        const data = daySnap.data();
        last7Days.push({
          date: dateKey,
          primary: data.primary,
          checkinType: data.checkinType || "real",
        });
      }
    }
    
  
    // Get account age
    const todayLocal = getLocalDate();
const metadataRef = doc(db, "users", email, "metadata", "accountInfo");
const metadataSnap = await getDoc(metadataRef);
const firstCheckinDate = metadataSnap.exists() ? metadataSnap.data().firstCheckinDate : todayLocal; // Fixed
    const accountAgeDays = Math.floor(
      (new Date(todayLocal).getTime() - new Date(firstCheckinDate).getTime()) / (1000 * 60 * 60 * 24)
    )+1;
    
  
    // Use the pure eligibility function
    const eligibility = checkEligibilityPure({
      dailyDocsLast7: last7Days,
      currentHabit,
      lastLevelUpDate: currentFocusData.lastLevelUpAt || null,
      accountAgeDays,
    });
  
    console.log("[Level-Up] Eligibility result:", eligibility);
  
    if (eligibility.isEligible) {
      console.log("[Level-Up] ELIGIBLE! Days hit:", eligibility.daysHit);
      setLevelUpEligible(true);
      setShowLevelUp(true);
    } else {
      console.log("[Level-Up] Not eligible. Reason:", eligibility.reason);
      setLevelUpEligible(false);
      setShowLevelUp(false);
    }
  };
  const handleCheckinSubmit = async () => {
    if (!checkin.headspace || !checkin.proteinHit || !checkin.hydrationHit || !checkin.energyBalance || !checkin.eatingPattern) {
      showToast({ message: "Please answer all questions.", type: "error" });
      return;
    }
  
    try {
      const email = getEmail();
      if (!email) return;
  
      // Use local date (NOT UTC)
      const localToday = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in user's timezone
  
      const data: Checkin = {
        date: localToday,
        headspace: checkin.headspace,
        proteinHit: checkin.proteinHit,
        hydrationHit: checkin.hydrationHit,
        movedToday: checkin.movedToday || "",
        sleepHit: checkin.sleepHit || "",
        energyBalance: checkin.energyBalance || "",
        eatingPattern: checkin.eatingPattern || "",
        primaryHabitDuration: checkin.primaryHabitDuration || "",
        note: checkin.note || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
  
      await saveCheckin(email, data);
      await updateWeeklyStats(email);
  
      setTodayCheckin(data);
     // Fetch all check-ins to count for milestones
const checkinsColRef = collection(db, "users", email, "checkins");
const checkinsSnap = await getDocs(checkinsColRef);
const allCheckinsCount = checkinsSnap.size; // Total count including today

console.log("🎯 Check-in count:", allCheckinsCount);
  
      // --- MOMENTUM ENGINE -------------------------
  
      // Get current focus
      const currentHabitData = await getCurrentFocus(email);
  
      if (!currentHabitData) {
        showToast({ message: "No current focus found", type: "error" });
        return;
      }
  
      // Get habit stack
      const stackRef = doc(db, "users", email, "momentum", "habitStack");
      const stackSnap = await getDoc(stackRef);
      const habitStack = stackSnap.exists() ? (stackSnap.data().habits || []) : [];
  
      // Get session data for movement habits
      const targetMin = getTargetMinutes(currentHabitData.habitKey);
      const sessionsCol = collection(db, "users", email, "sessions");
      const sessionsSnap = await getDocs(sessionsCol);
      const todaySession = sessionsSnap.docs
        .map(d => d.data())
        .find(s => s.date === localToday && s.durationMin >= targetMin);
  
      // Get account age
      const metadataRef = doc(db, "users", email, "metadata", "accountInfo");
      const metadataSnap = await getDoc(metadataRef);
  
      let firstCheckinDate = localToday;
  
      if (metadataSnap.exists() && metadataSnap.data().firstCheckinDate) {
        firstCheckinDate = metadataSnap.data().firstCheckinDate;
      } else {
        await setDoc(metadataRef, {
          firstCheckinDate: localToday,
          createdAt: new Date().toISOString()
        }, { merge: true });
      }
  
      // Calculate account age in days
      const todayDate = new Date(`${localToday}T00:00:00`);
      const firstDate = new Date(`${firstCheckinDate}T00:00:00`);
      const accountAgeDays = Math.floor((todayDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
      // Streak calculation now handled by writeDailyMomentum
// (No manual calculation needed)
  
      // Convert binary check-in data to behavior grades
      const behaviorGrades = [
        { name: "Protein", grade: data.proteinHit === "yes" ? 80 : 0 },
        { name: "Hydration", grade: data.hydrationHit === "yes" ? 80 : 0 },
        { name: "Sleep", grade: data.sleepHit === "yes" ? 80 : 0 },
        { name: "Mindset", grade: data.headspace === "great" ? 100 : data.headspace === "good" ? 80 : data.headspace === "okay" ? 50 : 0 }, // ← Changed 60 to 50
        { name: "Energy Balance", grade: data.energyBalance === "light" || data.energyBalance === "normal" ? 80 : 50 }, // ← Changed 60 to 50
        { name: "Eating Pattern", grade: data.eatingPattern === "meals" ? 80 : 50 }, // ← Changed 60 to 50
      ];

// Add movement grade if workout session exists
if (todaySession && todaySession.durationMin >= targetMin) {
  behaviorGrades.push({ name: "Movement", grade: 100 });
} else if (data.movedToday === "yes") {
  behaviorGrades.push({ name: "Movement", grade: 60 }); // Bonus activity but no workout
}

const momentumDoc = await writeDailyMomentum({
  email,
  date: localToday,
  behaviorGrades,  // ← NEW
  currentFocus: {
    habitKey: currentHabitData.habitKey,
    habit: currentHabitData.habit,
  },
  habitStack,
  goal: profile?.plan?.goal || "fat_loss",
  accountAgeDays,
});
      
// ✅ CHECK FOR COMMITMENT COMPLETE (priority over streaks)
const commitRef = doc(db, "users", email, "momentum", "commitment");
const commitSnap = await getDoc(commitRef);
const commitmentData = commitSnap.exists() ? commitSnap.data() : null;
      // Momentum doc is already written by writeDailyMomentum
// Just check if this is first check-in for commitment logic
const isFirstCheckin = accountAgeDays === 1;


// Declare this FIRST
let isCommitmentComplete = false;

// 🆕 CREATE COMMITMENT ON FIRST CHECK-IN

if (isFirstCheckin && currentHabitData) {
  const today = new Date(localToday + "T00:00:00");
  const expiresAt = new Date(today);
  expiresAt.setDate(expiresAt.getDate() + 7);

  await setDoc(commitRef, {
    habitOffered: currentHabitData.habit,      // 🆕 ADD THIS
    habitKey: currentHabitData.habitKey,       // 🆕 ADD THIS
    accepted: true,
    weekStartedAt: today.toISOString(),
    expiresAt: expiresAt.toISOString(),
    targetLevel: currentHabitData.level || 1,
    targetHabit: currentHabitData.habit,
    duration: 7,
    celebrated: false,
    createdAt: new Date().toISOString(),
  });

  console.log("🎯 First check-in: commitment created");
  
  // 🆕 Mark user as activated (ADD THIS BLOCK)
  const userRef = doc(db, "users", email);
  await setDoc(userRef, {
    isActivated: true,
    activatedAt: new Date().toISOString(),
  }, { merge: true });
  
  console.log("✅ User activated");
}

// Now check if commitment is complete
if (commitmentData?.expiresAt && commitmentData?.accepted && !commitmentData?.celebrated) {
  const expiresDate = new Date(commitmentData.expiresAt);
  const todayDate = new Date(localToday + "T00:00:00");
  expiresDate.setHours(0, 0, 0, 0);
  todayDate.setHours(0, 0, 0, 0);
  
  if (expiresDate.getTime() <= todayDate.getTime()) {
    isCommitmentComplete = true;
    
    // Mark as celebrated
    await setDoc(commitRef, {
      celebrated: true,
      celebratedAt: new Date().toISOString()
    }, { merge: true });
  }
}
  
 // ✅ CHECK FOR MILESTONE REWARDS

// Check for perfect day (all foundations + primary)
const isPerfectDay = 
data.proteinHit === "yes" &&
data.hydrationHit === "yes" &&
data.sleepHit === "yes" &&
data.movedToday === "yes" &&
data.energyBalance === "normal" &&
data.eatingPattern === "meals" &&
momentumDoc.primaryHabitHit;

// Check for return from break (7+ days away)
const isReturningFromBreak = missedDays >= 7;

// Check for lifetime check-in milestones
const isMilestone50 = allCheckinsCount === 50;
const isMilestone100 = allCheckinsCount === 100;
const currentStreak = momentumDoc.currentStreak;
const hasMilestone = 
  currentStreak === 30 || 
  currentStreak === 21 || 
  currentStreak === 7 || 
  currentStreak === 3 ||
  isPerfectDay ||
  isCommitmentComplete ||
  isReturningFromBreak ||
  isMilestone50 ||
  isMilestone100;

if (hasMilestone) {
// Skip daily celebration, go straight to milestone
// PRIORITY ORDER: Commitment > Return from Break > Streaks > Perfect Day
if (isCommitmentComplete) {
  setPendingReward(getRewardForEvent("commitment_complete"));
} else if (isReturningFromBreak) {
  setPendingReward(getRewardForEvent("return_from_break"));
} else if (isMilestone100) {
  setPendingReward(getRewardForEvent("milestone_100"));
} else if (isMilestone50) {
  setPendingReward(getRewardForEvent("milestone_50"));
} else if (currentStreak === 30) {
  setPendingReward(getRewardForEvent("streak_30"));
} else if (currentStreak === 21) {
  setPendingReward(getRewardForEvent("streak_21"));
} else if (currentStreak === 7) {
  setPendingReward(getRewardForEvent("streak_7"));
} else if (currentStreak === 3) {
  setPendingReward(getRewardForEvent("streak_3"));
} else if (isPerfectDay) {
  setPendingReward(getRewardForEvent("perfect_day"));
}

// Mark check-in as complete immediately (no daily animation)
setCheckinSubmitted(true);
} else {
// Show daily celebration
setCheckinSuccess(true);
}
  
    } catch (err) {
      console.error("handleCheckinSubmit error:", err);
      showToast({ message: "Failed to save check-in", type: "error" });
    }
  };

  const handleResetCheckin = async () => {
    try {
      const email = getEmail();
      if (!email) return;
  
      const today = new Date().toLocaleDateString("en-CA");
  
      // Delete today's check-in doc
      await deleteDoc(doc(db, "users", email, "checkins", today));
  
      // Delete today's momentum doc (IMPORTANT - otherwise momentum shows as complete)
      await deleteDoc(doc(db, "users", email, "momentum", today));
  
      // Reload dashboard data (this will refresh todayCheckin and all state)
      await loadDashboardData();
  
      showToast({
        message: "Today's check-in reset",
        type: "success",
      });
  
    } catch (err) {
      console.error("Reset failed:", err);
      showToast({ message: "Failed to reset check-in", type: "error" });
    }
  };
  const handleLevelUpAccept = async () => {
    setSaving(true);
    try {
      const email = getEmail();
      if (!email || !currentFocus) return;
      const today = getLocalDate();
      const currentTarget = getTargetMinutes(currentFocus.habitKey);
      
      // Perform level-up
      const updatedFocus = await updateLevel(email);
      
      // Build new 7-day commitment
      const weekId = getISOWeekId(new Date());
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const commitRef = doc(db, "users", email, "momentum", "commitment");
      const commitSnap = await getDoc(commitRef);
      const existingPrompts = commitSnap.exists()
        ? commitSnap.data().levelUpPrompts || {}
        : {};
      
      await setDoc(commitRef, {
        habitOffered: updatedFocus.habit,
        habitKey: updatedFocus.habitKey,
        accepted: true,
        acceptedAt: new Date().toISOString(),
        weekStarted: weekId,
        expiresAt: expiresAt.toISOString(),
        levelUpPrompts: {
          lastShown: new Date().toISOString(),
          timesOffered: (existingPrompts?.timesOffered || 0) + 1,
          timesAccepted: (existingPrompts?.timesAccepted || 0) + 1,
          averageDurationWhenOffered: averageDuration,
        },
        createdAt: new Date().toISOString(),
      });
      
      // Log the level-up event
      await logHabitEvent(email, {
        type: "level_up",
        date: today,
        habitKey: updatedFocus.habitKey,
        habitName: updatedFocus.habit,
        fromLevel: currentTarget,
        toLevel: updatedFocus.target,
      });
      
      // Close modal
      setShowLevelUp(false);
      
    // ✅ FIRE LEVEL-UP CELEBRATION
const levelUpReward = getRewardForEvent("level_up");
setPendingReward(levelUpReward);
      
      // Reload dashboard with new level
      loadDashboardData();
    } catch (err) {
      console.error("Failed to level up:", err);
      showToast({ message: "Failed to level up", type: "error" });
    } finally {
      setSaving(false);
    }
  };
  
  
  const handleLevelUpDecline = async () => {
    if (!levelUpReason || !levelUpNextStep) return;
    
    setSaving(true);
    try {
      const email = getEmail();
      if (!email) return;
  
      const commitRef = doc(db, "users", email, "momentum", "commitment");
      const commitSnap = await getDoc(commitRef);
      const existingPrompts = commitSnap.exists() ? (commitSnap.data().levelUpPrompts || {}) : {};
      const existingReasons = existingPrompts.declineReasons || [];
  
      await setDoc(commitRef, {
        levelUpPrompts: {
          ...existingPrompts,
          lastShown: new Date().toISOString(),
          timesOffered: (existingPrompts.timesOffered || 0) + 1,
          timesDeclined: (existingPrompts.timesDeclined || 0) + 1,
          declineReasons: [...existingReasons, levelUpReason],
          averageDurationWhenOffered: averageDuration,
        },
      }, { merge: true });
  // Log the decline event
await logHabitEvent(email, {
  type: "level_up",  // Still a level_up event, but declined
  date: today,
  habitKey: currentFocus?.habitKey,
  habitName: currentFocus?.habit,
  declineReason: `${levelUpReason} - ${levelUpNextStep}`,
});
      // Handle "try_different" - move current to stack, open habit picker
if (levelUpNextStep === "try_different") {
  // Move current habit to stack before choosing new one
  if (currentFocus && !currentFocus.suggested) {
    await moveCurrentToStack(email, currentFocus);
  }
  
  setShowLevelUp(false);
  setLevelUpReason("");
  setLevelUpNextStep("");
  setLevelUpStage("prompt");
  setCommitmentStage("choose");
  setShowCommitment(true);
  showToast({ message: "Let's find the right habit for you.", type: "success" });
      } else {
        // Show supportive response based on their choice
        let message = "";
        if (levelUpNextStep === "stick_current") {
          message = "Sticking with your current target is a smart move. Consistency wins.";
        } else if (levelUpNextStep === "increase_some_days") {
          message = "That's a solid approach. Build gradually.";
        }
  
        showToast({ message, type: "success" });
        setShowLevelUp(false);
        setLevelUpReason("");
        setLevelUpNextStep("");
        setLevelUpStage("prompt");
      }
    } catch (err) {
      console.error("Failed to save decline:", err);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    loadDashboardData();
  }, []);
// Check for celebrations after check-in
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkin') === 'done') {
    const checkForMilestone = async () => {
      const email = getEmail();
      if (!email) return;
      
      const today = new Date().toLocaleDateString("en-CA");
      
      const { checkMilestones } = await import('../services/checkMilestones');
      const result = await checkMilestones(email, today);
      
      if (result.hasMilestone && result.type) {
        // MILESTONE: Show big celebration
        setPendingReward(getRewardForEvent(result.type));
      }
      
      // Always mark as complete (celebration already showed on /checkin)
      setCheckinSubmitted(true);
      
      router.replace('/dashboard');
    };
    
    checkForMilestone();
  }
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
  
      // Local cutoff date string (YYYY-MM-DD)
      const cutoffStr = getLocalDateOffset(14);
  
      // Filter checkins that are >= cutoff AND have valid dates
      const recent = all
        .filter((c) => typeof c.date === "string" && c.date >= cutoffStr)
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
// After the other useEffects, around line 900
useEffect(() => {
  const loadTodaySession = async () => {
    const email = getEmail();
    if (!email || !currentFocus) return;

    const sessionsCol = collection(db, "users", email, "sessions");
    const sessionsSnap = await getDocs(sessionsCol);
    
    const todaySession = sessionsSnap.docs
      .map(d => d.data())
      .find(s => s.date === today);
    
    if (todaySession && todaySession.durationMin) {
      const duration = todaySession.durationMin;
      let range = "1-3";
      
      if (duration >= 45) range = "45+";
      else if (duration >= 30) range = "30-45";
      else if (duration >= 20) range = "20-30";
      else if (duration >= 15) range = "15-20";
      else if (duration >= 10) range = "10-15";
      else if (duration >= 5) range = "5-10";
      else if (duration >= 3) range = "3-5";
      
      setCheckin(prev => ({ ...prev, primaryHabitDuration: range }));
    }
  };

  loadTodaySession();
}, [currentFocus, today]);
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
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
        <NelsonLogoAnimated />
      </main>
    );
  }
  
  const isFirstTimeUser = profile?.isActivated === false;
  
  if (isFirstTimeUser) {
    // 🆕 ADD THIS CHECK
    if (!checkin || !profile || !currentFocus) {
      return (
        <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <p className="text-gray-500">Loading dashboard…</p>
        </main>
      );
    }
    
    return (
      <FirstTimeDashboard 
        profile={profile}
        currentFocus={currentFocus}
        checkin={checkin}
        setCheckin={setCheckin}
        handleCheckinSubmit={handleCheckinSubmit}
        checkinSuccess={checkinSuccess}
        setCheckinSuccess={setCheckinSuccess}
        checkinSubmitted={checkinSubmitted}
      />
    );
  }
  return (
    <motion.main
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6"
    >
      <RewardRenderer 
      reward={pendingReward} 
      onComplete={() => setPendingReward(null)}
    />
      <motion.div
        variants={containerVariants}
        className="max-w-3xl mx-auto space-y-6"
      >
       {/* 1. Welcome Header */}
<motion.div
  variants={itemVariants}
  className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 mb-6"
>
  <div className="flex items-start justify-between mb-4">
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-white">
        Hey {profile?.firstName || "there"}.
      </h1>
      
      {/* Context-Based Message */}
{showWelcomeMessage ? (
  // FIRST-TIME WELCOME
  <div className="text-base text-white/90 leading-relaxed mt-3 space-y-2">
    <p className="font-semibold">Welcome to your Dashboard.</p>
    <p>This is where you check in each day.</p>
    <p>The rhythm is simple: Reflect on yesterday. Stay honest with yourself.</p>
    <p>Watch your momentum build.</p>
    <p>Then put the phone down and go live your life.</p>
  </div>
) : missedDays > 0 && !hasCompletedCheckin() ? (
  // MISSED DAYS
  <div className="mt-3">
    <p className="text-white font-semibold">
      {missedDays >= 7 
        ? "It's been a while. Let's rebuild your momentum."
        : `It's been ${missedDays} ${missedDays === 1 ? "day" : "days"}. Let's get back to it.`
      }
    </p>
  </div>
) : hasCompletedCheckin() ? (
  // CHECKED IN TODAY
  <p className="text-white/60 mt-1">
    Check-in complete. Let's keep building.
  </p>
) : (
  // HAVEN'T CHECKED IN YET
  <p className="text-white/60 mt-1">
    Welcome back. Time to check in.
  </p>
)}

      {/* Streak Message */}
      {checkinStreak > 0 && missedDays === 0 && (() => {
        const { icon, message } = getStreakMessage(checkinStreak);
        return (
          <div className="flex items-center gap-2 text-sm font-medium text-amber-400 mt-2">
            <span>{icon}</span>
            <span>{message}</span>
          </div>
        );
      })()}

      <p className="text-[11px] tracking-widest uppercase text-white/40 font-semibold mt-2">
        Patience • Perseverance • Progress
      </p>
    </div>

    <div className="mt-1 mr-2">
  <NelsonLogo />
</div>
  </div>

  {/* Commitment/Level-Up Section */}
  <div className="mt-4 pt-4 border-t border-slate-700 transition-all duration-500 ease-in-out">
    {/* LEVEL-UP PROMPT - Shows when eligible, overrides commitment display */}
    {showLevelUp && levelUpEligible ? (
      <div className="transition-all duration-500 ease-in-out">
        {levelUpStage === "prompt" && (
          <div className="animate-fadeIn">
            <p className="text-white/80 mb-1 text-sm">
  Nice effort, you're ready to level up.
</p>
            <p className="text-white mb-2 font-semibold text-lg">
              You're averaging {averageDuration} minutes over the last 7 days
            </p>
            <p className="text-white/80 mb-4 text-sm">
              What feels doable for the next 7 days?
            </p>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={handleLevelUpAccept}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 transition disabled:opacity-50"
              >
                {saving ? "Saving..." : `Level Up to ${(() => {
                  const current = getTargetMinutes(currentFocus?.habitKey || "");
                  const next = current === 5 ? 10 : current === 10 ? 12 : current === 12 ? 15 : current === 15 ? 20 : current === 20 ? 25 : current === 25 ? 30 : current + 5;
                  return next;
                })()} Minutes`}
              </button>
              
              <button
                onClick={() => {
                  setShowLevelUp(false);
                  showToast({ message: "You got it. Keep building at your current pace.", type: "success" });
                }}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg py-2 border-2 border-slate-600 transition"
              >
                Stay at This Level
              </button>
              
              <button
                onClick={() => setLevelUpStage("adjust")}
                className="w-full bg-slate-700 hover:bg-slate-600 text-blue-400 font-semibold rounded-lg py-2 border-2 border-blue-500/50 transition"
              >
                Adjust My Plan
              </button>
            </div>
          </div>
        )}
        {levelUpStage === "adjust" && (
          <div className="animate-fadeIn">
            <p className="text-white/80 mb-3 font-semibold">
              Sounds good. Sustainability beats intensity every time.
            </p>
            <p className="text-white/80 mb-3 text-sm">
              What feels more manageable right now?
            </p>

            <div className="space-y-2">
              {(() => {
                const currentMinutes = extractMinutes(currentFocus?.habitKey || "walk_10min") || 10;
                const ladder = [5, 10, 12, 15, 20, 25, 30];
                
                const lowerOptions = ladder.filter(min => min < currentMinutes);
                
                if (lowerOptions.length === 0) {
                  return (
                    <p className="text-sm text-white/60 p-3 bg-slate-700/30 rounded-lg">
                      You're already at the starting level! Keep building consistency here.
                    </p>
                  );
                }
                
                return lowerOptions.reverse().map((minutes) => (
                  <button
                    key={minutes}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const email = getEmail();
                        if (!email) return;

                        const newHabitKey = `walk_${minutes}min`;
                        const newHabit = `Walk ${minutes} minutes`;
                        
                        const focusData: CurrentFocus = {
                          habitKey: newHabitKey,
                          habit: newHabit,
                          level: ladder.indexOf(minutes) + 1,
                          target: minutes,
                          startedAt: currentFocus?.startedAt || getLocalDate(),
                          lastLevelUpAt: getLocalDate(),
                          consecutiveDays: 0,
                          eligibleForLevelUp: false,
                        };
                        
                        await setCurrentFocusService(email, focusData);
                        
                        await logHabitEvent(email, {
                          type: "level_up",
                          date: getLocalDate(),
                          habitKey: newHabitKey,
                          habitName: newHabit,
                          fromLevel: currentFocus?.level,
                          toLevel: focusData.level,
                        });
                        
                        await setDoc(doc(db, "users", email, "momentum", "commitment"), {
                          habitOffered: newHabit,
                          habitKey: newHabitKey,
                          acceptedAt: getLocalDate(),
                          isActive: true,
                        }, { merge: true });
                        
                        setShowLevelUp(false);
                        showToast({ 
                          message: "Plan adjusted. Focus on consistency at this level.", 
                          type: "success" 
                        });
                        
                        loadDashboardData();
                        
                      } catch (err) {
                        console.error("Failed to adjust plan:", err);
                        showToast({ message: "Failed to adjust plan", type: "error" });
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                    className="w-full text-left p-3 border-2 border-slate-700 rounded-lg hover:border-blue-400 hover:bg-blue-500/10 transition disabled:opacity-50"
                  >
                    <p className="font-semibold text-white text-sm">Walk {minutes} minutes daily</p>
                    <p className="text-xs text-white/60">
                      {minutes === 5 ? "Start small, build the habit" : "Dial it back, stay consistent"}
                    </p>
                  </button>
                ));
              })()}
            </div>

            <button
              onClick={() => setLevelUpStage("prompt")}
              className="w-full mt-3 text-sm text-white/60 hover:text-white"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    ) : showCommitment && currentFocus ? (
      <div className="transition-all duration-500 ease-in-out">
        {commitmentStage === "initial" && (
          <div className="animate-fadeIn">
            <p className="text-white/80 mb-1 text-sm">
              {currentFocus.suggested && currentFocus.habitKey !== "custom_habit" && currentFocus.habitKey?.includes("movement_") 
                ? "Based on your intake, I recommend:" 
                : "Your focus:"}
            </p>
            <p className="text-white mb-3 font-semibold text-lg">
              {currentFocus.habit}
            </p>
            <p className="text-white/80 mb-4 text-sm">
              Can you commit to this for 7 days, rain or shine?
            </p>
            <div className="flex flex-col gap-2">
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

                    const focusData: CurrentFocus = {
                      habit: currentFocus.habit,
                      habitKey: currentFocus.habitKey,
                      level: 1,
                      target: extractMinutes(currentFocus.habitKey) ?? 10,
                      startedAt: today,
                      lastLevelUpAt: null,
                      consecutiveDays: 0,
                      eligibleForLevelUp: false,
                    };
                    await setCurrentFocusService(email, focusData);

                    setShowCommitment(false);
                    loadDashboardData();
                  } catch (err) {
                    console.error("Failed to save commitment:", err);
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "I'm In"}
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setCommitmentStage("reason")}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg py-2 border-2 border-slate-600 transition"
                >
                  Not Yet
                </button>
                
                {currentFocus.suggested && (
                  <button
                    onClick={() => setCommitmentStage("choose")}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-blue-400 font-semibold rounded-lg py-2 border-2 border-blue-500/50 transition"
                  >
                    Choose Different
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {commitmentStage === "reason" && (
          <div className="animate-fadeIn">
            <p className="text-white/80 mb-3 font-semibold">
              I respect that. Let's figure out what would work better.
            </p>
            <p className="text-white/80 mb-3 text-sm">What's making this feel difficult?</p>

            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-3 p-3 border-2 border-slate-700 rounded-lg hover:border-blue-400 cursor-pointer text-sm bg-slate-700/30">
                <input
                  type="radio"
                  name="reason"
                  value="time_too_big"
                  checked={commitmentReason === "time_too_big"}
                  onChange={(e) => setCommitmentReason(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-white/80">The time commitment feels too big</span>
              </label>

              <label className="flex items-center gap-3 p-3 border-2 border-slate-700 rounded-lg hover:border-blue-400 cursor-pointer text-sm bg-slate-700/30">
                <input
                  type="radio"
                  name="reason"
                  value="different_habit"
                  checked={commitmentReason === "different_habit"}
                  onChange={(e) => setCommitmentReason(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-white/80">I'd rather focus on a different habit first</span>
              </label>

              <label className="flex items-center gap-3 p-3 border-2 border-slate-700 rounded-lg hover:border-blue-400 cursor-pointer text-sm bg-slate-700/30">
                <input
                  type="radio"
                  name="reason"
                  value="something_else"
                  checked={commitmentReason === "something_else"}
                  onChange={(e) => setCommitmentReason(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-white/80">Something else is in the way</span>
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
                    setCommitmentStage("choose");
                    setCommitmentReason("");
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
                <p className="text-white/80 mb-3 font-semibold">
                  No problem. Would 5 minutes work better?
                </p>
                <p className="text-white/80 mb-3 text-sm">
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

                        const focusData: CurrentFocus = {
                          habit: "Walk 5 minutes daily",
                          habitKey: "walk_5min",
                          level: 1,
                          target: 5,
                          startedAt: getLocalDate(),
                          lastLevelUpAt: null,
                          consecutiveDays: 0,
                          eligibleForLevelUp: false,
                        };
                        await setCurrentFocusService(email, focusData);

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
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg py-2 border-2 border-slate-600 transition"
                  >
                    I'll Think About It
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-white/80 mb-3 font-semibold">
                  No problem. What would you rather focus on?
                </p>
                <p className="text-white/80 mb-3 text-sm">Pick the habit that feels most important right now:</p>

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

                          const focusData: CurrentFocus = {
                            habit: option.habit,
                            habitKey: option.key,
                            level: 1,
                            target: extractMinutes(option.key) ?? 10,
                            startedAt: getLocalDate(),
                            lastLevelUpAt: null,
                            consecutiveDays: 0,
                            eligibleForLevelUp: false,
                          };
                          await setCurrentFocusService(email, focusData);

                          setShowCommitment(false);
                          loadDashboardData();
                        } catch (err) {
                          console.error("Failed to save habit selection:", err);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      className="w-full text-left p-3 border-2 border-slate-700 rounded-lg hover:border-blue-400 hover:bg-blue-500/10 transition disabled:opacity-50"
                    >
                      <p className="font-semibold text-white text-sm">{option.habit}</p>
                      <p className="text-xs text-white/60">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {commitmentStage === "choose" && (
          <div className="animate-fadeIn">
            <p className="text-white/80 mb-3 font-semibold">
              What would you rather focus on?
            </p>
            <p className="text-white/80 mb-3 text-sm">Pick the habit that feels most important right now:</p>

            <div className="space-y-2">
              {[
                { habit: "Walk 5 minutes daily", key: "walk_5min", desc: "Start small, build consistency" },
                { habit: "Walk 10 minutes daily", key: "walk_10min", desc: "Build the movement habit" },
                { habit: "Walk 15 minutes daily", key: "walk_15min", desc: "Increase daily activity" },
                { habit: "Hit your protein target daily", key: "protein_daily", desc: "Fuel muscle and recovery" },
                { habit: "Eat protein at every meal", key: "protein_every_meal", desc: "Build the protein habit" },
                { habit: "Eat 3 servings of vegetables daily", key: "vegetables_3_servings", desc: "Increase nutrient density" },
                { habit: "No eating within 2 hours of bedtime", key: "no_late_eating", desc: "Improve digestion and sleep" },
                { habit: "Drink 100 oz of water daily", key: "hydration_100oz", desc: "Stay hydrated and energized" },
                { habit: "Sleep 7+ hours nightly", key: "sleep_7plus", desc: "Recover and rebuild" },
              ]
              .filter(option => option.key !== currentFocus?.habitKey)
              .map((option) => (
                <button
                  key={option.key}
                  onClick={() => {
                    setCurrentFocus({
                      habit: option.habit,
                      habitKey: option.key,
                      suggested: true,
                      createdAt: new Date().toISOString(),
                    });
                  
                    setCommitmentStage("initial");
                  }}
                  disabled={saving}
                  className="w-full text-left p-3 border-2 border-slate-700 rounded-lg hover:border-blue-400 hover:bg-blue-500/10 transition disabled:opacity-50"
                >
                  <p className="font-semibold text-white text-sm">{option.habit}</p>
                  <p className="text-xs text-white/60">{option.desc}</p>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setCommitmentStage("custom")}
              className="w-full mt-3 text-center p-3 border-2 border-blue-500/50 rounded-lg hover:border-blue-400 hover:bg-blue-500/10 transition text-blue-400 font-semibold"
            >
              + Create My Own Habit
            </button>
          </div>
        )}

        {commitmentStage === "custom" && (
          <div className="animate-fadeIn">
            <p className="text-white/80 mb-3 font-semibold">
              What is ONE small habit can you do EVERY day for 7 days?
            </p>
            <p className="text-white/60 mb-3 text-sm">
              Examples: Eat 1 serving of vegetables, Do 10 pushups, Journal for 5 minutes
            </p>
            
            <input
              type="text"
              maxLength={50}
              placeholder="One small daily habit..."
              value={commitmentReason}
              onChange={(e) => setCommitmentReason(e.target.value)}
              className="w-full border-2 border-slate-600 bg-slate-700/50 rounded-lg p-3 text-white mb-3 focus:border-blue-400 focus:outline-none placeholder-white/40"
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCommitmentStage("choose");
                  setCommitmentReason("");
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg py-2 border-2 border-slate-600 transition"
              >
                Back
              </button>
              
              <button
                onClick={() => {
                  if (!commitmentReason.trim()) return;
                  
                  setCurrentFocus({
                    habit: commitmentReason.trim(),
                    habitKey: "custom_habit",
                    suggested: true,
                    createdAt: new Date().toISOString(),
                  });
                  
                  setCommitmentStage("initial");
                  setCommitmentReason("");
                }}
                disabled={!commitmentReason.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    ) : commitment && (commitment.isActive || commitment.accepted || commitment.alternativeAccepted) ? (
      <div className="animate-fadeIn">
        {hasCompletedPrimaryHabit() ? (
          <div className="relative bg-gradient-to-br from-green-900/40 to-emerald-900/40 border-2 border-green-500/50 rounded-lg p-4 overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 right-0 text-6xl opacity-20">🎯</div>
            
            <div className="relative">
              <p className="text-xs text-green-400 font-semibold uppercase tracking-wide">
                ✓ Commitment Complete
              </p>
              <p className="text-lg font-bold text-white mt-1">
                {commitment?.alternativeOffered || commitment?.habitOffered || currentFocus?.habit}
              </p>
              <p className="text-sm text-green-400 mt-2 font-medium">
                That's the kind of consistency that compounds.
              </p>
              <p className="text-xs text-white/60 mt-2">
                Day {commitment?.acceptedAt ? daysBetween(commitment.acceptedAt.split("T")[0], getLocalDate()) + 1 : 1} of 7
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              if (currentFocus && isMovementHabit(currentFocus.habitKey)) {
                router.push('/walk');
              } else {
                showToast({ 
                  message: "Track this in your daily check-in!", 
                  type: "info" 
                });
              }
            }}
            className="w-full flex items-center justify-between bg-blue-900/30 hover:bg-blue-900/50 rounded-lg p-3 transition-all border-2 border-transparent hover:border-blue-500/50 group backdrop-blur-sm"
          >
            <div className="text-left">
              <p className="text-xs text-blue-400 font-semibold uppercase tracking-wide">Your Commitment</p>
              <p className="text-sm font-bold text-white mt-1">
                🎯 {commitment?.alternativeOffered || commitment?.habitOffered || currentFocus?.habit}
              </p>
              <p className="text-xs text-blue-400 mt-1 group-hover:underline">
                {currentFocus && isMovementHabit(currentFocus.habitKey) 
                  ? "Tap to start →" 
                  : "Track in check-in →"}
              </p>
            </div>
            <p className="text-xs text-white/60 font-semibold">
              Day {commitment?.acceptedAt ? Math.floor((new Date().getTime() - new Date(commitment.acceptedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1 : 1} of 7
            </p>
          </button>
        )}
      </div>
    ) : null}
  </div>
</motion.div>

{/* Momentum Engine */}
<motion.div
  variants={itemVariants}
  className="rounded-xl shadow-lg p-4 mb-6 transition-all duration-500 relative overflow-visible bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
>
  {/* Animated gradient orbs */}
  <div className="absolute inset-0 opacity-40 pointer-events-none">
    <motion.div 
      className="absolute top-0 right-0 w-48 h-48 bg-blue-500 rounded-full blur-2xl"
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
    <motion.div 
      className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500 rounded-full blur-2xl"
      animate={{
        scale: [1.2, 1, 1.2],
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 2
      }}
    />
  </div>

  <div className="relative">
    <div className="flex items-center justify-between mb-2">
      <div>
        <h2 className="text-2xl font-bold text-white">Momentum</h2>
      </div>
      
      {/* Only show percentage if NOT Day 1 */}
      {todayMomentum && todayMomentum.accountAgeDays > 1 && (
        <div className="text-4xl font-black tracking-tight text-white">
          {todayMomentum.momentumScore}%
        </div>
      )}
    </div>

    {/* DAY 1 STATE - Simple */}
    {todayMomentum && todayMomentum.accountAgeDays === 1 ? (
      <div className="py-4">
        {/* Empty progress bar */}
        <div className="relative h-2.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm mb-4">
          <div className="absolute h-full w-0 rounded-full bg-gradient-to-r from-gray-300 to-gray-400" />
        </div>
        
        <p className="text-base font-medium text-center text-white/90 mb-2">
          No momentum yet
        </p>
        <p className="text-sm text-white/60 text-center">
          Check in tomorrow and your first score appears
        </p>
      </div>
    ) : currentFocus && todayMomentum ? (
      /* NORMAL STATE - Days 2+ */
      <>
        {/* Trend Arrow */}
        {todayMomentum.momentumDelta !== 0 && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className={
              todayMomentum.momentumTrend === 'up' ? 'text-xl text-green-400' :
              todayMomentum.momentumTrend === 'down' ? 'text-xl text-red-400' :
              'text-xl text-slate-400'
            }>
              {todayMomentum.momentumTrend === 'up' ? '↑' :
               todayMomentum.momentumTrend === 'down' ? '↓' : '→'}
            </span>
            <span className="text-white/70 text-sm">
              {todayMomentum.momentumDelta > 0 ? '+' : ''}{todayMomentum.momentumDelta} points
            </span>
          </div>
        )}
        
        {/* Progress bar with glow */}
        <div className="relative h-2.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm mb-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${todayMomentum.momentumScore}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className={`absolute h-full rounded-full ${
              todayMomentum.momentumScore >= 80
                ? 'bg-gradient-to-r from-red-400 to-orange-400 shadow-lg shadow-red-500/50'
                : todayMomentum.momentumScore >= 60
                ? 'bg-gradient-to-r from-amber-400 to-yellow-400 shadow-lg shadow-amber-500/50'
                : todayMomentum.momentumScore >= 40
                ? 'bg-gradient-to-r from-blue-400 to-cyan-400 shadow-lg shadow-blue-500/50'
                : 'bg-gradient-to-r from-gray-300 to-gray-400'
            }`}
          />
        </div>
        
        <p className="text-base font-medium text-center text-white/90">
          {getEnhancedMessage()}
        </p>

        <p className="text-sm text-white/60 text-center mt-2">
  This is your long game: showing up daily, building momentum, and stacking habits.
</p>
      </>
    ) : (
      /* NO CHECK-IN STATE */
      <p className="text-white/70 text-sm text-center">
  {missedDays >= 7 
    ? "It's been a while since you checked in. Let's rebuild your momentum."
    : missedDays >= 2
    ? `It's been ${missedDays} days. One check-in gets us back on track.`
    : currentFocus
    ? "Complete today's check-in to keep building momentum."
    : "Complete your first check-in to start building momentum."}
      </p>
    )}
  </div>

  {/* Momentum Tooltip (appears after 13 seconds on Day 1) */}
  <MomentumTooltip 
    isVisible={showMomentumTooltip}
    onDismiss={handleDismissMomentumTooltip}
  />
</motion.div>
       {/* 3. Daily Check-in */}
{checkinSuccess ? (
  <CheckinSuccessAnimation
    onComplete={() => {
      setCheckinSuccess(false);
      setCheckinSubmitted(true);
      loadDashboardData();
    }}
  />
) : !hasCompletedCheckin() ? (
  <motion.div variants={itemVariants} className="mb-6">
  <div className="relative p-[2px] rounded-xl overflow-hidden">
    <div 
      className="absolute inset-0 rounded-xl"
      style={{
        background: 'conic-gradient(from 0deg, transparent 0%, transparent 50%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.5) 100%)',
        animation: 'rotate 3s linear infinite',
      }}
    />
    
    {/* Solid background layer to prevent bleed */}
    <div className="absolute inset-[2px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl" />
    
    <button
      onClick={() => router.push('/checkin')}
      className="relative w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl py-5 text-lg shadow-lg hover:shadow-xl transition-all"
      style={{
        animation: 'fade 2s ease-in-out infinite',
      }}
    >
      Complete Today's Check-In →
    </button>
  </div>
  
  <style jsx>{`
    @keyframes rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    @keyframes fade {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }
  `}</style>
</motion.div>
) : (
  <motion.div variants={itemVariants} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 mb-6">
  <div className="flex items-center gap-3">
    <div className="text-4xl">✓</div>
    <div>
      <p className="text-white font-semibold text-lg">Check-in complete</p>
      <p className="text-white/60 text-sm">You showed up today. Keep the pattern going.</p>
    </div>
  </div>
</motion.div>
)}
{/* 2. Active Habits Stack */}
{habitStack.length > 0 && (
  <motion.div
    variants={itemVariants}
    className="bg-white rounded-2xl shadow-sm p-6 mb-6 transition-shadow hover:shadow"
  >
    <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Active Habits</h2>
    
    <div className="space-y-3">
      {/* Primary Habit */}
      {currentFocus && (
        <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-semibold">PRIMARY</span>
              <span className="font-semibold text-gray-900">{currentFocus.habit}</span>
              <span className="text-lg">🎯</span>
            </div>
            <span className="text-xs text-gray-600">
              {currentFocus.daysOnThisHabit || 0} days
            </span>
          </div>
        </div>
      )}

      {/* Stacked Habits */}
      {habitStack.map((habit, idx) => (
        <div key={idx} className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-semibold">STACK</span>
              <span className="font-semibold text-gray-900">{habit.habit}</span>
              <span className="text-lg">🧱</span>
            </div>
            <span className="text-xs text-gray-600">
              {habit.daysOnThisHabit || 0} days
            </span>
          </div>
        </div>
      ))}
    </div>

    <p className="text-xs text-gray-500 mt-4 text-center">
      Stacking habits increases your momentum score.  Aim for 80%+
    </p>
  </motion.div>
)}
{/* ===== HISTORY ACCESS - LAST ITEM ===== */}
<motion.div variants={itemVariants}>
  <HistoryAccess
    onNavigate={() => router.push("/history")}
    currentStreak={historyStats.currentStreak}
    totalCheckIns={historyStats.totalCheckIns}
    monthlyConsistency={historyStats.monthlyConsistency}
  />
</motion.div>
{/* ====================================== */}
        {/* FUTURE: AI Coach Card - See COACH_VISION.md 
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
*/}
        {/* FUTURE: Workout Analytics
    Shows weekly workout trends (sessions, sets, duration)
    Only display when workouts are actively promoted feature
    Requires 'trends' data structure to be populated
    
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
*/}

       {/* FUTURE: Workout Integration - Saved for reference
    This section gates workouts behind daily check-ins (intentional product decision)
    Contains saveSession logic and three-state button flow
    Decide integration strategy before rebuilding
    See COACH_VISION.md for strength training philosophy
    
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
*/}

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
        {/* Sign Out */}
        <button
          onClick={async () => {
            try {
              localStorage.removeItem("nelsonUser");
              const { auth } = await import("@/app/firebase/config");
              const { signOut } = await import("firebase/auth");
              await signOut(auth);
              showToast({ message: "Signed out", type: "info" });
              router.push("/login");
            } catch (err) {
              console.error("Sign out failed:", err);
              router.push("/login");
            }
          }}
          className="bg-gray-700 hover:bg-gray-800 text-white rounded-md py-1 text-sm font-bold"
        >
          🚪 Sign Out
        </button>

        {/* Clear Momentum History */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            const momentumCol = collection(db, "users", email, "momentum");
            const momentumSnap = await getDocs(momentumCol);
            
            for (const doc of momentumSnap.docs) {
              if (doc.id !== "currentFocus" && doc.id !== "commitment" && doc.id !== "habitStack") {
                await deleteDoc(doc.ref);
              }
            }
            
            showToast({ message: "Cleared momentum history", type: "success" });
            loadDashboardData();
          }}
          className="bg-yellow-600 hover:bg-yellow-700 text-white rounded-md py-1 text-sm"
        >
          Clear Momentum History
        </button>

        {/* Clean Habit Stack */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            const stackRef = doc(db, "users", email, "momentum", "habitStack");
            const stackSnap = await getDoc(stackRef);
            
            if (stackSnap.exists()) {
              const habits = stackSnap.data().habits || [];
              const uniqueHabits = habits.reduce((acc: any[], habit: any) => {
                if (!acc.some(h => h.habitKey === habit.habitKey)) {
                  acc.push(habit);
                }
                return acc;
              }, []);
              
              await setDoc(stackRef, { habits: uniqueHabits });
              showToast({ message: `Cleaned stack: ${habits.length} → ${uniqueHabits.length}`, type: "success" });
              loadDashboardData();
            }
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-md py-1 text-sm"
        >
          Clean Habit Stack
        </button>

        {/* Trigger Level-Up (14 days) */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            try {
              const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
              const fifteenDaysAgoISO = fifteenDaysAgo.toISOString();
              const fifteenDaysAgoDate = fifteenDaysAgo.toLocaleDateString("en-CA");
              
              await setDoc(doc(db, "users", email), {
                createdAt: fifteenDaysAgoISO
              }, { merge: true });
              
              await setDoc(doc(db, "users", email, "metadata", "accountInfo"), {
                firstCheckinDate: fifteenDaysAgoDate,
                createdAt: fifteenDaysAgoISO,
              }, { merge: true });
              
              const focusRef = doc(db, "users", email, "momentum", "currentFocus");
              const focusSnap = await getDoc(focusRef);
              
              if (!focusSnap.exists()) {
                showToast({ message: "No current focus found", type: "error" });
                return;
              }
              
              const currentHabitKey = focusSnap.data().habitKey;
              const targetMin = extractMinutes(currentHabitKey) || 10;
              
              for (let i = 14; i >= 1; i--) {
                const dateKey = getLocalDateOffset(i);
                const checkInNumber = 15 - i;
                
                const checkInDate = new Date(dateKey + "T00:00:00");
                const firstDate = new Date(fifteenDaysAgoDate + "T00:00:00");
                const accountAgeDays = Math.floor((checkInDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                
                await setDoc(doc(db, "users", email, "sessions", `walk_${dateKey}`), {
                  id: `walk_${dateKey}`,
                  date: dateKey,
                  type: "walk",
                  activityName: `Walk ${targetMin} minutes daily`,
                  durationSec: targetMin * 60,
                  durationMin: targetMin,
                  completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                  createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                });
                
                await setDoc(doc(db, "users", email, "momentum", dateKey), {
                  date: dateKey,
                  accountAgeDays: accountAgeDays,
                  totalRealCheckIns: checkInNumber,
                  
                  behaviorGrades: [
                    { name: "nutrition_pattern", grade: 100 },
                    { name: "energy_balance", grade: 100 },
                    { name: "protein", grade: 100 },
                    { name: "hydration", grade: 100 },
                    { name: "sleep", grade: 100 },
                    { name: "mindset", grade: 100 },
                    { name: "movement", grade: 100 },
                  ],
                  behaviorRatings: {
                    nutrition_pattern: "elite",
                    energy_balance: "elite",
                    protein: "elite",
                    hydration: "elite",
                    sleep: "elite",
                    mindset: "elite",
                    movement: "elite",
                  },
                  
                  primary: { habitKey: currentHabitKey, done: true },
                  stack: {},
                  foundations: {
                    protein: true,
                    hydration: true,
                    sleep: true,
                    nutrition: true,
                    movement: true,
                  },
                  
                  checkinType: "real",
                  dailyScore: 100,
                  rawMomentumScore: 100,
                  momentumScore: 100,
                  momentumTrend: 'up',
                  momentumDelta: 0,
                  momentumMessage: "Test data",
                  visualState: "solid",
                  
                  primaryHabitHit: true,
                  stackedHabitsCompleted: 0,
                  totalStackedHabits: 0,
                  moved: true,
                  hydrated: true,
                  slept: true,
                  nutritionScore: 12,
                  
                  exerciseCompleted: true,
                  exerciseTargetMinutes: targetMin,
                  
                  currentStreak: checkInNumber,
                  lifetimeStreak: checkInNumber,
                  streakSavers: 0,
                  
                  createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                });
              }
              
              showToast({ message: "14 days created + comparison active", type: "success" });
              await loadDashboardData();
              
            } catch (err) {
              console.error("Trigger level-up failed:", err);
              showToast({ message: "Failed", type: "error" });
            }
          }}
          className="bg-green-600 hover:bg-green-700 text-white rounded-md py-1 text-sm"
        >
          Trigger Level-Up
        </button>

        {/* Test Gap Recovery */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            try {
              const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
              const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
              const thirtyDaysAgoDate = thirtyDaysAgo.toLocaleDateString("en-CA");
              
              await setDoc(doc(db, "users", email), {
                createdAt: thirtyDaysAgoISO
              }, { merge: true });
              
              await setDoc(doc(db, "users", email, "metadata", "accountInfo"), {
                firstCheckinDate: thirtyDaysAgoDate,
                createdAt: thirtyDaysAgoISO,
              }, { merge: true });
              
              const focusRef = doc(db, "users", email, "momentum", "currentFocus");
              const focusSnap = await getDoc(focusRef);
              
              if (!focusSnap.exists()) {
                showToast({ message: "No current focus found", type: "error" });
                return;
              }
              
              const currentHabitKey = focusSnap.data().habitKey;
              
              for (let i = 29; i >= 15; i--) {
                const dateKey = getLocalDateOffset(i);
                const checkInNumber = 30 - i;
                
                const checkInDate = new Date(dateKey + "T00:00:00");
                const firstDate = new Date(thirtyDaysAgoDate + "T00:00:00");
                const accountAgeDays = Math.floor((checkInDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                
                await setDoc(doc(db, "users", email, "momentum", dateKey), {
                  date: dateKey,
                  accountAgeDays: accountAgeDays,
                  totalRealCheckIns: checkInNumber,
                  
                  behaviorGrades: [
                    { name: "nutrition_pattern", grade: 100 },
                    { name: "energy_balance", grade: 100 },
                    { name: "protein", grade: 100 },
                    { name: "hydration", grade: 100 },
                    { name: "sleep", grade: 100 },
                    { name: "mindset", grade: 100 },
                    { name: "movement", grade: 100 },
                  ],
                  behaviorRatings: {
                    nutrition_pattern: "elite",
                    energy_balance: "elite",
                    protein: "elite",
                    hydration: "elite",
                    sleep: "elite",
                    mindset: "elite",
                    movement: "elite",
                  },
                  
                  primary: { habitKey: currentHabitKey, done: true },
                  stack: {},
                  foundations: {
                    protein: true,
                    hydration: true,
                    sleep: true,
                    nutrition: true,
                    movement: true,
                  },
                  
                  checkinType: "real",
                  dailyScore: 100,
                  rawMomentumScore: 100,
                  momentumScore: 100,
                  momentumTrend: 'up',
                  momentumDelta: 0,
                  momentumMessage: "Building streak",
                  visualState: "solid",
                  
                  primaryHabitHit: true,
                  stackedHabitsCompleted: 0,
                  totalStackedHabits: 0,
                  moved: true,
                  hydrated: true,
                  slept: true,
                  nutritionScore: 12,
                  
                  exerciseCompleted: true,
                  exerciseTargetMinutes: 10,
                  
                  currentStreak: checkInNumber,
                  lifetimeStreak: checkInNumber,
                  streakSavers: 0,
                  
                  createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                });
              }
              
              showToast({ 
                message: "15 check-ins created, 14-day gap before today", 
                type: "success" 
              });
              
              await loadDashboardData();
              
            } catch (err) {
              console.error("Test gap recovery failed:", err);
              showToast({ message: "Failed", type: "error" });
            }
          }}
          className="bg-orange-600 hover:bg-orange-700 text-white rounded-md py-1 text-sm"
        >
          🔬 Test Gap Recovery
        </button>

        {/* Generate 60 Days */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            try {
              const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
              const sixtyDaysAgoISO = sixtyDaysAgo.toISOString();
              const sixtyDaysAgoDate = sixtyDaysAgo.toLocaleDateString("en-CA");
              
              await setDoc(doc(db, "users", email), {
                createdAt: sixtyDaysAgoISO
              }, { merge: true });
              
              await setDoc(doc(db, "users", email, "metadata", "accountInfo"), {
                firstCheckinDate: sixtyDaysAgoDate,
                createdAt: sixtyDaysAgoISO,
              }, { merge: true });
              
              const focusRef = doc(db, "users", email, "momentum", "currentFocus");
              const focusSnap = await getDoc(focusRef);
              
              if (!focusSnap.exists()) {
                showToast({ message: "No current focus found", type: "error" });
                return;
              }
              
              const currentHabitKey = focusSnap.data().habitKey;
              const targetMin = extractMinutes(currentHabitKey) || 10;
              
              const randomRating = () => {
                const rand = Math.random();
                if (rand > 0.7) return "elite";
                if (rand > 0.4) return "solid";
                if (rand > 0.15) return "not_great";
                return "off";
              };
              
              const ratingToGrade = (rating: string) => {
                if (rating === "elite") return 100;
                if (rating === "solid") return 80;
                if (rating === "not_great") return 50;
                return 0;
              };
              
              for (let i = 60; i >= 1; i--) {
                const dateKey = getLocalDateOffset(i);
                const checkInNumber = 61 - i;
                
                const checkInDate = new Date(dateKey + "T00:00:00");
                const firstDate = new Date(sixtyDaysAgoDate + "T00:00:00");
                const accountAgeDays = Math.floor((checkInDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                
                const exerciseCompleted = Math.random() > 0.3;
                
                const nutritionRating = randomRating();
                const energyRating = randomRating();
                const proteinRating = randomRating();
                const hydrationRating = randomRating();
                const sleepRating = randomRating();
                const mindsetRating = randomRating();
                const movementRating = randomRating();
                
                const behaviorGrades = [
                  { name: "nutrition_pattern", grade: ratingToGrade(nutritionRating) },
                  { name: "energy_balance", grade: ratingToGrade(energyRating) },
                  { name: "protein", grade: ratingToGrade(proteinRating) },
                  { name: "hydration", grade: ratingToGrade(hydrationRating) },
                  { name: "sleep", grade: ratingToGrade(sleepRating) },
                  { name: "mindset", grade: ratingToGrade(mindsetRating) },
                  { name: "movement", grade: ratingToGrade(movementRating) },
                ];
                
                const avgGrade = behaviorGrades.reduce((sum, b) => sum + b.grade, 0) / 7;
                const dailyScore = Math.round(avgGrade);
                
                if (exerciseCompleted) {
                  await setDoc(doc(db, "users", email, "sessions", `walk_${dateKey}`), {
                    id: `walk_${dateKey}`,
                    date: dateKey,
                    type: "walk",
                    activityName: `Walk ${targetMin} minutes daily`,
                    durationSec: targetMin * 60,
                    durationMin: targetMin,
                    completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                    createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                  });
                }
                
                await setDoc(doc(db, "users", email, "momentum", dateKey), {
                  date: dateKey,
                  accountAgeDays: accountAgeDays,
                  totalRealCheckIns: checkInNumber,
                  
                  behaviorGrades: behaviorGrades,
                  behaviorRatings: {
                    nutrition_pattern: nutritionRating,
                    energy_balance: energyRating,
                    protein: proteinRating,
                    hydration: hydrationRating,
                    sleep: sleepRating,
                    mindset: mindsetRating,
                    movement: movementRating,
                  },
                  
                  primary: { habitKey: currentHabitKey, done: exerciseCompleted },
                  stack: {},
                  foundations: {
                    protein: proteinRating !== "off",
                    hydration: hydrationRating !== "off",
                    sleep: sleepRating !== "off",
                    nutrition: nutritionRating !== "off",
                    movement: movementRating !== "off",
                  },
                  
                  checkinType: "real",
                  dailyScore: dailyScore,
                  rawMomentumScore: dailyScore,
                  momentumScore: dailyScore,
                  momentumTrend: dailyScore >= 80 ? 'up' : dailyScore >= 50 ? 'stable' : 'down',
                  momentumDelta: 0,
                  momentumMessage: "Varied test data",
                  visualState: dailyScore >= 80 ? "solid" : dailyScore >= 50 ? "not_great" : "off",
                  
                  primaryHabitHit: exerciseCompleted,
                  stackedHabitsCompleted: 0,
                  totalStackedHabits: 0,
                  moved: movementRating !== "off",
                  hydrated: hydrationRating !== "off",
                  slept: sleepRating !== "off",
                  nutritionScore: ratingToGrade(nutritionRating) / 10,
                  
                  exerciseCompleted: exerciseCompleted,
                  exerciseTargetMinutes: targetMin,
                  
                  currentStreak: checkInNumber,
                  lifetimeStreak: checkInNumber,
                  streakSavers: 0,
                  
                  createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                });
              }
              
              showToast({ 
                message: "60 days of varied data created! 30-day comparison ready", 
                type: "success" 
              });
              
              await loadDashboardData();
              
            } catch (err) {
              console.error("60-day test failed:", err);
              showToast({ message: "Failed", type: "error" });
            }
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-md py-1 text-sm"
        >
          📊 Generate 60 Days
        </button>

        {/* Toggle Exercise Gate */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            const today = getLocalDate();
            const todayRef = doc(db, "users", email, "momentum", today);
            const todaySnap = await getDoc(todayRef);
            
            if (!todaySnap.exists()) {
              showToast({ message: "No check-in today", type: "error" });
              return;
            }
            
            const currentValue = todaySnap.data().exerciseCompleted;
            await setDoc(todayRef, {
              exerciseCompleted: !currentValue
            }, { merge: true });
            
            showToast({ 
              message: `Exercise: ${!currentValue ? "COMPLETED" : "SKIPPED"}`, 
              type: "success" 
            });
            
            loadDashboardData();
          }}
          className="bg-cyan-600 hover:bg-cyan-700 text-white rounded-md py-1 text-sm"
        >
          🏃 Toggle Exercise Gate
        </button>

        {/* Reset Level-Up Test */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            try {
              const focusData = {
                habit: "Walk 10 minutes daily",
                habitKey: "walk_10min",
                level: 1,
                target: 10,
                startedAt: getLocalDate(),
                lastLevelUpAt: null,
                consecutiveDays: 0,
                eligibleForLevelUp: false,
              };
              
              await setDoc(doc(db, "users", email, "momentum", "currentFocus"), focusData);
              
              const commitRef = doc(db, "users", email, "momentum", "commitment");
              await setDoc(commitRef, {
                levelUpPrompts: {},
              }, { merge: true });
              
              const sessionsSnap = await getDocs(collection(db, "users", email, "sessions"));
              for (const doc of sessionsSnap.docs) {
                await deleteDoc(doc.ref);
              }
              
              showToast({ message: "Reset to walk_10min, cleared sessions", type: "success" });
              loadDashboardData();
            } catch (err) {
              console.error("Reset failed:", err);
              showToast({ message: "Reset failed", type: "error" });
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white rounded-md py-1 text-sm"
        >
          Reset Level-Up Test
        </button>

        {/* Clear Today's Check-In */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            const today = getLocalDate();
            const todayRef = doc(db, "users", email, "momentum", today);
            await deleteDoc(todayRef);
            
            showToast({ message: "Cleared today's check-in", type: "success" });
            setTimeout(() => loadDashboardData(), 500);
          }}
          className="bg-yellow-600 hover:bg-yellow-700 text-white rounded-md py-1 text-sm"
        >
          Clear Today's Check-In
        </button>

        {/* Fresh Start */}
        <button
          onClick={async () => {
            const email = getEmail();
            if (!email) return;
            
            try {
              const momentumSnap = await getDocs(collection(db, "users", email, "momentum"));
              for (const d of momentumSnap.docs) {
                if (d.id.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  await deleteDoc(d.ref);
                }
              }
              
              const sessionsSnap = await getDocs(collection(db, "users", email, "sessions"));
              for (const d of sessionsSnap.docs) {
                await deleteDoc(d.ref);
              }
              
              const eventsSnap = await getDocs(collection(db, "users", email, "habitEvents"));
              for (const d of eventsSnap.docs) {
                await deleteDoc(d.ref);
              }
              
              await setDoc(doc(db, "users", email, "momentum", "currentFocus"), {
                habitKey: "walk_10min",
                habit: "Walk 10 minutes",
                level: 1,
                target: 10,
                startedAt: getLocalDate(),
                lastLevelUpAt: null,
                consecutiveDays: 0,
                eligibleForLevelUp: false,
              });
              
              const sevenDaysFromNow = new Date();
              sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
              
              await setDoc(doc(db, "users", email, "momentum", "commitment"), {
                habit: "Walk 10 minutes",
                habitKey: "walk_10min",
                acceptedAt: getLocalDate(),
                endsAt: sevenDaysFromNow.toLocaleDateString("en-CA"),
                isActive: true,
                levelUpPrompts: {},
              });
              
              await setDoc(doc(db, "users", email, "momentum", "habitStack"), {
                habits: [],
              });
              
              showToast({ message: "Fresh start ready!", type: "success" });
              setTimeout(() => window.location.reload(), 1000);
              
            } catch (err) {
              console.error("Reset failed:", err);
              showToast({ message: "Reset failed", type: "error" });
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white rounded-md py-1 text-sm"
        >
          🔄 Fresh Start
        </button>
      </div>
    </details>
  </div>
)}
</motion.div>
</motion.main>
  );
}