"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  where,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "../../firebase/config";
import { getEmail } from "../../utils/getEmail";
import { useToast } from "../../context/ToastContext";
import { saveCheckin, getCheckin, type Checkin } from "../../utils/checkin";
import { getISOWeekId } from "../../utils/programMeta";
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
import { onSnapshot, } from "firebase/firestore";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { updateWeeklyStats } from "../../utils/updateWeeklyStats";
import DashboardDevTools from "./DashboardDevTools";  
import { TrendStats, CheckinTrend } from "../../types/trends";
import { withFirestoreError } from "../../utils/withFirestoreError";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { calculateDailyMomentumScore, determinePrimaryHabitHit, applyMomentumCap } from "../../utils/momentumCalculation";
import { getDayVisualState } from "../../utils/history/getDayVisualState";
import { logHabitEvent, getRecentHabitEvents } from "@/app/utils/habitEvents";
import { checkLevelUpEligibility as checkEligibilityPure } from "@/app/utils/checkLevelUpEligibility";
import type { DailyDoc } from "@/app/utils/checkLevelUpEligibility";
import { runBackfill } from "@/app/utils/backfillMomentumStructure";
import { writeDailyMomentum } from "@/app/services/writeDailyMomentum";

import { getLocalDate, getLocalDateOffset, daysBetween } from "@/app/utils/date";
import RewardRenderer from "@/app/components/rewards/RewardRenderer";
import CheckinSuccessAnimation from "@/app/components/rewards/CheckinSuccessAnimation";
import { detectAndHandleMissedCheckIns } from '@/app/services/missedCheckIns';
import { selectMomentumMessage } from '@/app/services/messagingGuide';
import MomentumTooltip from '@/app/components/MomentumTooltip';
import HistoryAccess from "@/app/components/HistoryAccess";
import CoachAccess from "@/app/components/CoachAccess";
import { NelsonLogo, NelsonLogoAnimated  } from '@/app/components/logos';
import { resolveReward, type RewardPayload } 
from "@/app/services/rewardEngine";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import LevelUpSlider from "@/app/components/LevelUpSlider";
import { WeightCard } from '@/app/components/WeightCard';
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], weight: ['500', '700'] })

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
  console.count("[DASHBOARD RENDER]");
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
  const [completedLast7Days, setCompletedLast7Days] = useState(0);
  const [averageDuration, setAverageDuration] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showAdjustOptions, setShowAdjustOptions] = useState(false);
  const [adjustOptions, setAdjustOptions] = useState<'increase' | 'decrease'>('increase');
  const [levelUpReason, setLevelUpReason] = useState<string>("");
  const [levelUpNextStep, setLevelUpNextStep] = useState<string>("");
const [pendingReward, setPendingReward] = useState<any | null>(null);
  const [checkinSuccess, setCheckinSuccess] = useState(false);
  const [showMomentumTooltip, setShowMomentumTooltip] = useState(false);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);
  const [consistencyPercentage, setConsistencyPercentage] = useState<number>(0);
  // Animated momentum score
  const [displayedScore, setDisplayedScore] = useState(0);
  // Track if animation has played this session
  const [hasAnimated, setHasAnimated] = useState(false);

  

  const hasCompletedCheckin = (): boolean => {
    // Check canonical completion field
    return todayMomentum?.checkinCompleted === true;
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
// Animate momentum score on load (only once per day)
useEffect(() => {
  if (!todayMomentum?.momentumScore) return;
  
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const lastAnimatedDate = sessionStorage.getItem('lastMomentumAnimation');
  
  // If already animated today, show final value immediately
  if (lastAnimatedDate === today) {
    setDisplayedScore(todayMomentum.momentumScore);
    setHasAnimated(true);
    return;
  }
  
  const targetScore = todayMomentum.momentumScore;
  const duration = 2300; // milliseconds
  const startTime = Date.now();
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out)
    const eased = 1 - Math.pow(1 - progress, 3);
    
    setDisplayedScore(Math.round(eased * targetScore));
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // Mark animation as complete for today
      sessionStorage.setItem('lastMomentumAnimation', today);
      setHasAnimated(true);
    }
  };
  
  requestAnimationFrame(animate);
}, [todayMomentum?.momentumScore]);
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

// Then inside the component:
const loadDashboardData = async () => {
    console.count("[DASHBOARD LOAD COUNT]");
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser?.email) {
        // Don't redirect - layout guard handles this
        return;
      }
    
      const email = currentUser.email;
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
// ===== CHECK LEVEL-UP ELIGIBILITY =====
const loadedFocus = focusSnap.exists() ? focusSnap.data() : null;

if (loadedFocus) {
  // Query last 7 days of momentum docs
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const momentumSnap = await getDocs(
    query(
      collection(db, "users", email, "momentum"),  // Remove "daily"
      where("date", ">=", sevenDaysAgo.toLocaleDateString("en-CA")),
      orderBy("date", "desc")
    )
  );

  // Count real check-ins where exercise was completed
  const completed = momentumSnap.docs.filter(doc => {
    const data = doc.data();
    return data.checkinType === "real" && data.exerciseCompleted === true;
  }).length;

  const daysSinceLastDecision = loadedFocus.lastLevelUpAt
    ? daysBetween(loadedFocus.lastLevelUpAt, today)
    : 999;

  console.log('[LevelUp Debug]', {
    completed,
    lastLevelUpAt: loadedFocus.lastLevelUpAt,
    daysSinceLastDecision,
    eligible: completed >= 5 && daysSinceLastDecision >= 7
  });

  setCompletedLast7Days(completed);
  setLevelUpEligible(completed >= 5 && daysSinceLastDecision >= 7);
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
const todayKey = getLocalDate(); // Single date source
console.log('[DATE DEBUG]', {
  todayKey,
  actualToday: new Date().toLocaleDateString("en-CA"),
  rawDate: new Date().toString()
});

// Has real check-in today?
const hasCheckedInToday = todayMomentumSnap.exists() && 
  todayMomentumSnap.data()?.checkinType === "real";

// Calculate stats the same way Lab does - count all real check-ins
const lifetimeCheckIns = momentumSnaps.docs.filter(d => 
  d.data()?.checkinType === "real"
).length;

// Current streak from today's doc (or most recent if today doesn't exist)
const currentStreak = todayMomentumSnap.exists()
  ? (todayMomentumSnap.data()?.currentStreak ?? 0)
  : (() => {
      const sorted = momentumSnaps.docs
        .filter(d => d.id.match(/^\d{4}-\d{2}-\d{2}$/))
        .sort((a, b) => b.id.localeCompare(a.id));
      return sorted.length > 0 ? (sorted[0].data()?.currentStreak ?? 0) : 0;
    })();

// 3. MONTHLY CONSISTENCY: Calculate from firstCheckinDate
const metadataRef = doc(db, "users", email, "metadata", "accountInfo");
const metadataSnap = await getDoc(metadataRef);
const firstCheckinDate = metadataSnap.data()?.firstCheckinDate;

if (!firstCheckinDate) {
  console.error("No firstCheckinDate found");
  setHistoryStats({ currentStreak, totalCheckIns: lifetimeCheckIns, monthlyConsistency: 0 });
  return;
}

// Calculate account age (Canon formula - Section 7)
const start = new Date(firstCheckinDate);
const end = new Date(todayKey);
const diffTime = end.getTime() - start.getTime();
const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
const accountAge = diffDays + 1; // Day 1 = first check-in day

// Effective window excludes today if no check-in yet (with underflow protection)
const effectiveDays = hasCheckedInToday 
  ? accountAge 
  : Math.max(accountAge - 1, 0);
const windowSize = Math.min(effectiveDays, 30);

// Window end is yesterday (since no check-in today)
const windowEndKey = hasCheckedInToday ? todayKey : (() => {
  const yesterday = new Date(todayKey + "T00:00:00");
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toLocaleDateString("en-CA");
})();

// Window start is windowSize days before the end (inclusive)
const windowStartDate = new Date(windowEndKey + "T00:00:00");
windowStartDate.setDate(windowStartDate.getDate() - (windowSize - 1));
const windowStartKey = windowStartDate.toLocaleDateString("en-CA");

// Count real check-ins in window (inclusive boundaries)
const realCheckInsInWindow = momentumSnaps.docs.filter(d => {
  const id = d.id;
  const data = d.data();
  if (!id.match(/^\d{4}-\d{2}-\d{2}$/)) return false;
  if (data.checkinType !== "real") return false;
  return id >= windowStartKey && id <= windowEndKey;
}).length;

const monthlyConsistency = windowSize > 0 
  ? Math.round((realCheckInsInWindow / windowSize) * 100)
  : 0;

setHistoryStats({ 
  currentStreak,
  totalCheckIns: lifetimeCheckIns,
  monthlyConsistency 
});

console.log(`[Dashboard] History stats: Streak ${currentStreak}, Total ${lifetimeCheckIns}, Month ${monthlyConsistency}%`);
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
}

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

          }
        } catch (err) {
          console.error("Weekly summary write failed:", err);
        }
      }
      // Read level-up prompt state (passive - no computation)
const promptRef = doc(db, "users", email, "momentum", "levelUpPrompt");
const promptSnap = await getDoc(promptRef);

if (promptSnap.exists()) {
  const promptData = promptSnap.data();
  if (promptData.pending) {
    setShowLevelUp(true);
    setLevelUpEligible(true);
  }
}

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
  // === LEVEL-UP ELIGIBILITY FUNCTIONS (Event-scoped, not render-scoped) ===

// IMPORTANT:
// gatherLevelUpInputs performs Firestore reads and MUST ONLY be called
// from event-driven flows (e.g. post check-in).
// Never call this from a render or dashboard lifecycle.

type LevelUpInputs =
| { canCheck: false; reason: string }
| {
    canCheck: true;
    currentHabit: string;
    lastPromptDate: string | null;
    last7Days: DailyDoc[];
    accountAgeDays: number;
    lastLevelUpDate: string | null;
  };

const gatherLevelUpInputs = async (
email: string,
today: string
): Promise<LevelUpInputs> => {
// Get current focus
const focusRef = doc(db, "users", email, "momentum", "currentFocus");
const focusSnap = await getDoc(focusRef);

if (!focusSnap.exists()) {
  return { canCheck: false, reason: "no_focus" };
}

const currentFocusData = focusSnap.data();
const currentHabit = currentFocusData.habitKey || "walk_10min";

// Check cooldown from dedicated document
const promptRef = doc(db, "users", email, "momentum", "levelUpPrompt");
const promptSnap = await getDoc(promptRef);

let lastPromptDate = null;
if (promptSnap.exists()) {
  lastPromptDate = promptSnap.data().lastShown;
}

// Get last 7 days from momentum docs (parallelized)
const dayPromises = Array.from({ length: 7 }, (_, i) => {
  const dateKey = getLocalDateOffset(i);
  const dayRef = doc(db, "users", email, "momentum", dateKey);
  return getDoc(dayRef).then(snap => ({
    dateKey,
    snap
  }));
});

const dayResults = await Promise.all(dayPromises);

const last7Days: DailyDoc[] = dayResults
  .filter(r => r.snap.exists())
  .map(r => {
    const data = r.snap.data();
    return {
      date: r.dateKey,
      primary: data?.primary || { habitKey: "", done: false }, // Preserve object structure
      checkinType: data?.checkinType || "real",
    };
  });

// Get account age
const metadataRef = doc(db, "users", email, "metadata", "accountInfo");
const metadataSnap = await getDoc(metadataRef);
const firstCheckinDate = metadataSnap.exists() 
  ? metadataSnap.data().firstCheckinDate 
  : today;

const accountAgeDays = Math.floor(
  (new Date(today).getTime() - new Date(firstCheckinDate).getTime()) / (1000 * 60 * 60 * 24)
) + 1;

return {
  canCheck: true,
  currentHabit,
  lastPromptDate,
  last7Days,
  accountAgeDays,
  lastLevelUpDate: currentFocusData.lastLevelUpAt || null,
};
};
const evaluateLevelUpEligibilityPure = (inputs: {
  currentHabit: string;
  lastPromptDate: string | null;
  last7Days: DailyDoc[];
  accountAgeDays: number;
  lastLevelUpDate: string | null;
  today: string;
}) => {
  // Check 7-day cooldown
  if (inputs.lastPromptDate) {
    const daysSincePrompt = daysBetween(
      inputs.lastPromptDate.split("T")[0], 
      inputs.today
    );
    
    if (daysSincePrompt < 7) {
      return { 
        isEligible: false, 
        reason: "cooldown_active",
        daysRemaining: 7 - daysSincePrompt 
      };
    }
  }
  
  // Use the existing pure eligibility function
  return checkEligibilityPure({
    dailyDocsLast7: inputs.last7Days,
    currentHabit: inputs.currentHabit,
    lastLevelUpDate: inputs.lastLevelUpDate,
    accountAgeDays: inputs.accountAgeDays,
  });
};
const handleAdjustLevel = async (minutes: number) => {
  const email = getEmail();
  if (!email) return;

  try {
    const focusRef = doc(db, "users", email, "momentum", "currentFocus");
    const focusSnap = await getDoc(focusRef);
    
    if (!focusSnap.exists()) {
      showToast({ message: "Focus not found", type: "error" });
      return;
    }

    const currentFocus = focusSnap.data();
    const oldTarget = currentFocus.target || 10;
    
    // Determine if this level gets proven status
    // If user hit 5+/7 at old level, old level becomes lastProven
    const shouldUpdateProven = completedLast7Days >= 5;
    
    await setDoc(focusRef, {
      ...currentFocus,
      target: minutes,
      habit: `Walk ${minutes} minutes daily`,
      habitKey: `walk_${minutes}min`,
      lastLevelUpAt: getLocalDate(),
      // Only update lastProvenTarget if they proved the old level
      lastProvenTarget: shouldUpdateProven ? oldTarget : (currentFocus.lastProvenTarget || oldTarget),
    }, { merge: true });

    showToast({ 
      message: `Commitment updated to ${minutes} minutes`, 
      type: "success" 
    });
    
    setLevelUpEligible(false);
    setTimeout(() => window.location.reload(), 1000);
    
  } catch (err) {
    console.error("Level adjustment failed:", err);
    showToast({ message: "Update failed", type: "error" });
  }
};
const handleKeepCurrent = async () => {
  const email = getEmail();
  if (!email) return; // ← Add 'return' here
  
  try {
    const focusRef = doc(db, "users", email, "momentum", "currentFocus");
    const focusSnap = await getDoc(focusRef);
    
    if (!focusSnap.exists()) return;
    
    const currentFocus = focusSnap.data();
    const currentTarget = currentFocus.target || 10;
    
    // If keeping current AND hit 5+/7, this level is now proven
    const shouldUpdateProven = completedLast7Days >= 5;
    
    await setDoc(focusRef, {
      ...currentFocus,
      lastLevelUpAt: getLocalDate(),
      // Mark current as proven if they hit 5+/7
      lastProvenTarget: shouldUpdateProven ? currentTarget : (currentFocus.lastProvenTarget || currentTarget),
    }, { merge: true });

    showToast({ 
      message: "Commitment maintained", 
      type: "success" 
    });
    
    setLevelUpEligible(false);
    setTimeout(() => window.location.reload(), 1000);
    
  } catch (err) {
    console.error("Keep current failed:", err);
    showToast({ message: "Update failed", type: "error" });
  }
};
const recordLevelUpPrompt = async (email: string, today: string) => {
const promptRef = doc(db, "users", email, "momentum", "levelUpPrompt");

await setDoc(promptRef, {
  pending: true,
  lastShown: new Date().toISOString(),
  shownDate: today,
}, { merge: true });
};
  
  useEffect(() => {
    loadDashboardData();
  }, []);
  
  
  
  // Check for celebrations after check-in
  const milestoneHandledRef = useRef(false);
  
  useEffect(() => {
    if (milestoneHandledRef.current) return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkin') === 'done') {
      milestoneHandledRef.current = true;
      
      const checkForMilestone = async () => {
        const email = getEmail();
        if (!email) return;
        
        const today = new Date().toLocaleDateString("en-CA");
        
        // Level-up eligibility (event-driven)
        const inputs = await gatherLevelUpInputs(email, today);
        
        if (inputs.canCheck) {
          const eligibility = evaluateLevelUpEligibilityPure({
            currentHabit: inputs.currentHabit,
            lastPromptDate: inputs.lastPromptDate,
            last7Days: inputs.last7Days,
            accountAgeDays: inputs.accountAgeDays,
            lastLevelUpDate: inputs.lastLevelUpDate,
            today,
          });
          
          if (eligibility.isEligible) {
            await recordLevelUpPrompt(email, today);
          }
        }
        
        setCheckinSubmitted(true);
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
    
  }
  return (
    <motion.main
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6"
    >
      {pendingReward && (
  <RewardRenderer 
    reward={pendingReward}
  />
)}
      <motion.div
        variants={containerVariants}
        className="max-w-3xl mx-auto space-y-6"
      >
     {/* Compact Greeting Strip - Shows before and after check-in */}
<motion.div variants={itemVariants}>
  <div className="bg-slate-800/20 backdrop-blur-sm rounded-lg py-3 px-4 mb-4">
    <p className="text-xl text-white/200 text-center">
      Hey {profile?.firstName || "there"}.
    </p>
    <p className="text-base text-white/60 text-center mt-1">
      {hasCompletedCheckin() && historyStats.currentStreak > 0
        ? `You've logged ${historyStats.currentStreak} consecutive check-ins.`
        : "Ready to check in?"}
    </p>
  </div>

  {/* Level-Up Prompt */}
  {levelUpEligible && completedLast7Days >= 5 && (
    <div className="mt-4 pt-4 border-t border-slate-700 animate-fadeIn">
      <p className="text-white mb-2 font-semibold">
        You've completed your exercise {completedLast7Days} out of 7 days.
      </p>
      <p className="text-white/80 mb-4 text-sm">
        What will you commit to for the upcoming week?
      </p>
      
      {!showAdjustOptions ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setAdjustOptions('increase'); setShowAdjustOptions(true); }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 transition"
          >
            Increase my commitment
          </button>
          
          <button
            onClick={handleKeepCurrent}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg py-2 transition"
          >
            Keep my current commitment
          </button>
          
          <button
            onClick={() => { setAdjustOptions('decrease'); setShowAdjustOptions(true); }}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg py-2 transition"
          >
            Decrease my commitment
          </button>
        </div>
      ) : (
        <LevelUpSlider
          currentTarget={currentFocus?.target || 10}
          lastProvenTarget={currentFocus?.lastProvenTarget || currentFocus?.target || 10}
          direction={adjustOptions}
          onSelect={handleAdjustLevel}
          onBack={() => setShowAdjustOptions(false)}
        />
      )}
    </div>
  )}
</motion.div>

{/* Momentum Engine */}
<motion.div
  variants={itemVariants}
  className="rounded-xl shadow-lg p-4 mb-6 transition-all duration-500 relative overflow-visible bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
>
  {/* Animated gradient orbs */}
  <div className="absolute inset-0 opacity-25 pointer-events-none">
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
        opacity: [0.35, 0.56, 0.35],
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
      <h2 className={`text-[24px] font-medium text-white/85 ${inter.className}`} style={{ letterSpacing: '0.05em' }}>Momentum</h2>
      </div>
      
      {/* Only show percentage if NOT Day 1 */}
      {todayMomentum && todayMomentum.accountAgeDays > 1 && (
        <div className="text-[56px] font-bold text-white leading-none" style={{ letterSpacing: '-0.02em' }}>
        {displayedScore}%
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
        
       {/* Progress bar - refined warm palette */}
       <div className="relative h-[10px] bg-white/[0.15] rounded-full overflow-hidden backdrop-blur-sm mb-2">
       <motion.div
            initial={{ width: hasAnimated ? `${todayMomentum.momentumScore}%` : 0 }}
            animate={{ width: `${todayMomentum.momentumScore}%` }}
            transition={{ duration: hasAnimated ? 0 : 2.7, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute h-full rounded-full ${
              todayMomentum.momentumScore === 100
                ? 'bg-gradient-to-r from-orange-400 to-orange-300'
                : todayMomentum.momentumScore >= 90
                ? 'bg-gradient-to-r from-orange-600 to-orange-500'
                : todayMomentum.momentumScore >= 80
                ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                : todayMomentum.momentumScore >= 60
                ? 'bg-gradient-to-r from-orange-400/80 to-amber-400/80'
                : todayMomentum.momentumScore >= 40
                ? 'bg-gradient-to-r from-orange-400/80 to-amber-400/80'
                : 'bg-gradient-to-r from-orange-300/60 to-amber-300/60'
            }`}
          />
        </div>
        
        {/* Trend layer */}
        <div className="flex items-center justify-between text-base font-medium mb-2">
          <div className="text-white/85">
            {todayMomentum.momentumDelta >= 5 ? (
              <div className="flex items-center gap-1">
                <span className="text-base">↗</span>
                <span>+{todayMomentum.momentumDelta} · Building</span>
              </div>
            ) : todayMomentum.momentumDelta <= -5 ? (
              <div className="flex items-center gap-1">
                <span className="text-base">↘</span>
                <span>{todayMomentum.momentumDelta} · Cooling</span>
              </div>
            ) : (
              <span>Steady</span>
            )}
          </div>
          
          {/* Commitment badge - right-aligned, same line */}
          {currentFocus?.target && (
            <div className="text-white/70">
              Exercise · {currentFocus.target} min+
            </div>
          )}
        </div>
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
  onComplete={async () => {
    setCheckinSuccess(false);
    setCheckinSubmitted(true);
    
    // Refresh only today's momentum doc (lightweight)
    const email = getEmail();
    const today = getLocalDate(); // Fresh date
    if (email) {
      const todayMomentumRef = doc(db, "users", email, "momentum", today);
      const snap = await getDoc(todayMomentumRef);
      if (snap.exists()) {
        setTodayMomentum(snap.data());
      }
    }
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
) : null}
{/* ===== COACH ACCESS ===== */}
<motion.div variants={itemVariants} className="mb-4">
  <CoachAccess
    userEmail={getEmail() || ''}
    onNavigate={() => router.push("/coach")}
  />
</motion.div>

{/* Weight Card - Muted */}
<motion.div variants={itemVariants} className="mb-4 opacity-50">
  <WeightCard />
</motion.div>

{/* FUTURE: Learn Card - Same compact styling as Weight */}
{/* <motion.div variants={itemVariants} className="mb-6">
  <LearnCard />
</motion.div> */}

{/* ===== HISTORY ACCESS - LAST ITEM ===== */}
<motion.div variants={itemVariants} className="opacity-50">
  <HistoryAccess
    onNavigate={() => router.push("/history")}
    currentStreak={historyStats.currentStreak}
    totalCheckIns={historyStats.totalCheckIns}
    monthlyConsistency={historyStats.monthlyConsistency}
  />
</motion.div>
{/* Tagline */}
<div className="text-center mt-4 mb-6">
  <p className="text-sm tracking-widest uppercase text-white/40 font-semibold">
    Patience • Perseverance • Progress
  </p>
</div>
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


        {/* Dev Tools - Extracted to separate component */}
        {process.env.NODE_ENV === "development" && (
          <DashboardDevTools 
            setTodayCheckin={setTodayCheckin}
            setTodayMomentum={setTodayMomentum}
            setCheckinSubmitted={setCheckinSubmitted}
          />
        )}
</motion.div>
</motion.main>
  );
}