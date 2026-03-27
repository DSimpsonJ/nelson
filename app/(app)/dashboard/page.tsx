"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { getEmail } from "../../utils/getEmail";
import { useToast } from "../../context/ToastContext";
import { getCheckin, type Checkin } from "../../utils/checkin";
import DashboardDevTools from "./DashboardDevTools";  
import { motion } from "framer-motion";
import { checkLevelUpEligibility as checkEligibilityPure } from "@/app/utils/checkLevelUpEligibility";
import type { DailyDoc } from "@/app/utils/checkLevelUpEligibility";
import { getLocalDate, getLocalDateOffset, daysBetween } from "@/app/utils/date";
import RewardRenderer from "@/app/components/rewards/RewardRenderer";
import CheckinSuccessAnimation from "@/app/components/rewards/CheckinSuccessAnimation";
import { detectAndHandleMissedCheckIns } from '@/app/services/missedCheckIns';
import { selectMomentumMessage } from '@/app/services/messagingGuide';
import HistoryAccess from "@/app/components/HistoryAccess";
import CoachAccess from "@/app/components/CoachAccess";
import LearnBanner from "@/app/components/LearnBanner";
import PhaseBottomSheet from "@/app/components/PhaseBottomSheet";
import { NelsonLogoAnimated  } from '@/app/components/logos';
import { resolveReward, type RewardPayload } 
from "@/app/services/rewardEngine";
import { getAuth } from "firebase/auth";
import LevelUpSlider from "@/app/components/LevelUpSlider";
import { WeightCard } from '@/app/components/WeightCard';
import { Inter } from 'next/font/google'
import type { DailyMomentumDoc } from '../history/useMomentumHistory';
import NotificationPrompt from "@/app/components/NotificationPrompt";
import { getCurrentWeekId, FOCUS_BEHAVIOR_LABELS } from '@/app/utils/focusBehavior';
import { getPhaseIndex, MOMENTUM_PHASES as PHASE_BOUNDARIES } from '@/app/utils/momentumPhases';


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
};
// Maps internal behavior keys to display labels
const BEHAVIOR_LABELS: Record<string, string> = {
  nutrition_quality: "Nutrition",
  portion_control:   "Portions",
  protein:           "Protein",
  hydration:         "Hydration",
  sleep:             "Sleep",
  mindset:           "Mindset",
  movement:          "Movement",
};

const BEHAVIOR_SENTENCE_SUBJECTS: Record<string, string> = {
  nutrition_quality: "Nutrition quality",
  portion_control:   "Portion control",
  protein:           "Protein",
  hydration:         "Hydration",
  sleep:             "Sleep",
  mindset:           "Mindset",
  movement:          "Movement",
};

function getDominantBehavior(
  behaviorGrades: Array<{ name: string; grade: number }> | undefined,
  mode: "high" | "low"
): string | null {
  if (!behaviorGrades || behaviorGrades.length === 0) return null;
  const sorted = [...behaviorGrades].sort((a, b) =>
    mode === "high" ? b.grade - a.grade : a.grade - b.grade
  );
  return BEHAVIOR_LABELS[sorted[0].name] ?? null;
}
function getDominantBehaviorSubject(
  behaviorGrades: Array<{ name: string; grade: number }> | undefined,
  mode: "high" | "low"
): string | null {
  if (!behaviorGrades || behaviorGrades.length === 0) return null;
  const sorted = [...behaviorGrades].sort((a, b) =>
    mode === "high" ? b.grade - a.grade : a.grade - b.grade
  );
  return BEHAVIOR_SENTENCE_SUBJECTS[sorted[0].name] ?? null;
}
const MOMENTUM_PHASES = PHASE_BOUNDARIES.map((p, i) => ({
  ...p,
  copy: [
    "This is fragile. Every check-in is building the signal.",
    "Early patterns are forming.",
    "You're starting to repeat this.",
    "This is getting easier to repeat.",
    "This is getting harder to break.",
    "You don't have to push as hard anymore.",
    "Off days won't knock you off track.",
    "This runs automatically now.",
  ][i],
}));

function getMomentumPhase(totalCheckIns: number): {
  phase: string;
  copy: string;
  phaseIndex: number;
} {
  const idx = getPhaseIndex(totalCheckIns);
  const current = MOMENTUM_PHASES[idx];
  return {
    phase: current.name,
    copy: current.copy,
    phaseIndex: idx,
  };
}
function getFocusBehaviorSentenceName(key: string): string {
  const sentenceNames: Record<string, string> = {
    nutrition_quality: "nutrition quality",
    portion_control:   "portion control",
    protein:           "protein",
    hydration:         "hydration",
    sleep:             "sleep",
    mindset:           "mindset",
    movement:          "movement",
  };
  return sentenceNames[key] ?? key;
}
/** ---------- Component ---------- */
export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<Checkin | null>(null);
  const [checkinSubmitted, setCheckinSubmitted] = useState(false);
  const [currentFocus, setCurrentFocus] = useState<any>(null);
  const [weekFocusBehavior, setWeekFocusBehavior] = useState<string | null>(null);
  const [todayMomentum, setTodayMomentum] = useState<any>(null);
  const [recentMomentum, setRecentMomentum] = useState<DailyMomentumDoc[]>([]);
  const [forceDrag, setForceDrag] = useState<{ type: 'driver' | 'drag'; behavior: string } | null>(null);
  const [inTheZone, setInTheZone] = useState(false);
  const [commitment, setCommitment] = useState<any>(null);
  const [showCommitment, setShowCommitment] = useState(false);
  const [missedDays, setMissedDays] = useState(0);
  const today = getLocalDate();
  const [levelUpEligible, setLevelUpEligible] = useState(false);
  const [completedLast7Days, setCompletedLast7Days] = useState(0);
  const [showAdjustOptions, setShowAdjustOptions] = useState(false);
  const [adjustOptions, setAdjustOptions] = useState<'increase' | 'decrease'>('increase');
const [pendingReward, setPendingReward] = useState<any | null>(null);
  const [checkinSuccess, setCheckinSuccess] = useState(false);
  const [showPhaseSheet, setShowPhaseSheet] = useState(false);
  const [firstCheckinDate, setFirstCheckinDate] = useState<string | null>(null);
  const [readLearnSlugs, setReadLearnSlugs] = useState<string[]>([]);
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
  // Derive badDaysInWindow from last 5 real check-ins
  const last5Real = recentMomentum
  .filter((d: any) => d.checkinType === "real")
  .slice(-5);
const badDaysInWindow = last5Real.filter(d => d.dailyScore < 50).length;

// Single source of truth for momentum message
const momentumMessage = todayMomentum ? selectMomentumMessage({
momentumScore: todayMomentum.momentumScore,
trend: todayMomentum.momentumTrend as 'up' | 'down' | 'stable',
streak: todayMomentum.currentStreak,
dampeningApplied: todayMomentum.dampeningApplied || 0,
delta: todayMomentum.momentumDelta,
daysSinceLastCheckIn: missedDays,
badDaysInWindow,
frozenMomentum: recentMomentum.filter((d: any) => d.checkinType === "real").slice(-2)[0]?.momentumScore,
totalRealCheckIns: todayMomentum.totalRealCheckIns || 0,
}) : "";

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
        }
      } catch (err) {
      }
    };

    loadProfile();
  }, []);
// Animate momentum score on load (only once per day)
useEffect(() => {
  if (!todayMomentum?.momentumScore) return;
  
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const lastAnimatedDate = localStorage.getItem('lastMomentumAnimation');
  
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
      localStorage.setItem('lastMomentumAnimation', today);
      setHasAnimated(true);
    }
  };
  
  requestAnimationFrame(animate);
}, [todayMomentum?.momentumScore]);

// Then inside the component:
const loadDashboardData = async () => {
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
  setMissedDays(gapInfo.daysMissed);
}

      // ---- Load user's first name from root doc ----
      const userRef = doc(db, "users", email);
      const userSnap = await getDoc(userRef);

      let firstName = "there";
      let hasSeenWelcome = false;
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        firstName = userData.firstName ?? "there";
        hasSeenWelcome = userData.hasSeenDashboardWelcome ?? false;
        setReadLearnSlugs(userData.readLearnSlugs ?? []);

        const currentWeekId = getCurrentWeekId();
        if (
          userData.focusBehaviorSetWeek === currentWeekId &&
          userData.focusBehavior
        ) {
          setWeekFocusBehavior(userData.focusBehavior);
        }
      }
// ===== NEW: Show welcome if first time =====
if (!hasSeenWelcome) {
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

  setCompletedLast7Days(completed);
  setLevelUpEligible(completed >= 5 && daysSinceLastDecision >= 7);
  // Force/Drag cause layer — spec: 3+ elite = driver, 3+ low = drag, single behavior only
  const BEHAVIORS = ['nutrition_quality','portion_control','protein','hydration','sleep','mindset','movement'];
  const realLast7 = momentumSnap.docs
    .filter(d => d.data().checkinType === 'real')
    .map(d => d.data().behaviorRatings as Record<string, string> | undefined)
    .filter(Boolean) as Record<string, string>[];

  if (realLast7.length >= 3) {
    const driverBehaviors = BEHAVIORS.filter(b =>
      realLast7.filter(r => r[b] === 'elite').length >= 3
    );
    const dragBehaviors = BEHAVIORS.filter(b =>
      realLast7.filter(r => r[b] === 'not-great' || r[b] === 'off').length >= 3
    );

    const FORCE_DRAG_LABELS: Record<string, string> = {
      movement: 'Bonus activity',
    };
    if (driverBehaviors.length === 1) {
      const b = driverBehaviors[0];
      setForceDrag({ type: 'driver', behavior: FORCE_DRAG_LABELS[b] ?? BEHAVIOR_LABELS[b] ?? b });
    } else if (dragBehaviors.length === 1) {
      const b = dragBehaviors[0];
      setForceDrag({ type: 'drag', behavior: FORCE_DRAG_LABELS[b] ?? BEHAVIOR_LABELS[b] ?? b });
    } else {
      setForceDrag(null);
    }
  }
}

const commitRef = doc(db, "users", email, "momentum", "commitment");
const commitSnap = await getDoc(commitRef);
const commitmentData = commitSnap.exists() ? commitSnap.data() : null;
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
  // 🆕 If there's ANY momentum doc for today, mark check-in as done
  if (momentumData.date === today) {
    setCheckinSubmitted(true);
  }
}
// =========================================================
      const momentumColRef = collection(db, "users", email, "momentum");
      const momentumSnaps = await getDocs(momentumColRef);
      const allMomentum = momentumSnaps.docs
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.id))
      .map(d => ({ ...d.data(), date: d.id }) as DailyMomentumDoc)
      .sort((a, b) => a.date < b.date ? 1 : -1)
      .slice(0, 14);
      // Zone detection: 11 of last 14 real days at 75%+ momentum
      const last14Real = allMomentum
        .filter(d => d.checkinType === 'real')
        .slice(0, 14);
      if (last14Real.length >= 14) {
        const qualifyingDays = last14Real.filter(d => (d.momentumScore ?? 0) >= 75).length;
        setInTheZone(qualifyingDays >= 11);
      } else {
        setInTheZone(false);
      }
     // ===== NEW: Calculate consistency =====
if (todayMomentumSnap.exists()) {
  const todayData = todayMomentumSnap.data();
  const accountAgeDays = todayData.accountAgeDays || 1;
}

// ===== Calculate history stats for preview =====
const todayKey = getLocalDate(); // Single date source

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
setFirstCheckinDate(firstCheckinDate ?? null);

if (!firstCheckinDate) {
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

      // Read level-up prompt state (passive - no computation)
const promptRef = doc(db, "users", email, "momentum", "levelUpPrompt");
const promptSnap = await getDoc(promptRef);

if (promptSnap.exists()) {
  const promptData = promptSnap.data();
  if (promptData.pending) {
    setLevelUpEligible(true);
  }
}

} catch (err) {
  showToast({ message: "Error loading dashboard", type: "error" });
} finally {
  setLoading(false);
}
};

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
        // Read reward written by checkin/page.tsx
        const storedReward = sessionStorage.getItem('pendingReward');
        if (storedReward) {
          try {
            const reward = JSON.parse(storedReward);
            if (reward?.payload) {
              setPendingReward(reward.payload);
            }
          } catch (e) {
          } finally {
            sessionStorage.removeItem('pendingReward');
          }
        }

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
      {hasCompletedCheckin()
        ? weekFocusBehavior
          ? `You're focusing on ${getFocusBehaviorSentenceName(weekFocusBehavior)} this week.`
          : "Momentum updated."
        : "Ready to check in?"}
    </p>
  </div>
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
        {todayMomentum?.momentumDelta !== undefined && hasCompletedCheckin() && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-base">
              {todayMomentum.momentumDelta > 0 ? '↗' : todayMomentum.momentumDelta < 0 ? '↘' : '→'}
            </span>
            <span className="text-white/50 text-sm">
              {todayMomentum.momentumDelta > 0 ? `+${Math.round(todayMomentum.momentumDelta)}` : Math.round(todayMomentum.momentumDelta)}
            </span>
          </div>
        )}
      </div>
      
      {/* Always show percentage even on Day 1 */}
      {todayMomentum && todayMomentum.momentumScore > 0 && (
        <div className="text-[56px] font-bold text-white leading-none" style={{ letterSpacing: '-0.02em' }}>
        {displayedScore}%
      </div>
      )}
    </div>

    {/* DAY 1 STATE - Simple */}
    {todayMomentum && todayMomentum.accountAgeDays === 1 && !todayMomentum.momentumScore ? (
  <div className="py-4">
    <div className="relative h-2.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm mb-4">
      <div className="absolute h-full w-0 rounded-full bg-gradient-to-r from-gray-300 to-gray-400" />
    </div>
    
    <p className="text-base font-medium text-center text-white/90 mb-2">
      No momentum yet
    </p>
    <p className="text-sm text-white/60 text-center">
      Exercise commitment not met. Meet your movement floor and check-in tomorrow to start building.
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
          {(() => {
            const topBehavior = getDominantBehaviorSubject(todayMomentum.behaviorGrades, "high");
            const lowBehavior = getDominantBehaviorSubject(todayMomentum.behaviorGrades, "low");
            if (todayMomentum.momentumDelta >= 5) {
              return (
                <span>{topBehavior ? `${topBehavior} is pushing momentum up.` : "Momentum is building."}</span>
              );
            } else if (todayMomentum.momentumDelta <= -5) {
              return (
                <span>{lowBehavior ? `${lowBehavior} is pulling momentum down.` : "Momentum is cooling."}</span>
              );
             } else if (forceDrag?.type === 'driver') {
               return (
                 <span>{forceDrag.behavior} is driving momentum this week.</span>
               );
             } else if (forceDrag?.type === 'drag') {
               return (
                 <span>{forceDrag.behavior} is creating drag this week.</span>
               );
             } else {
               return (
                 <span>{topBehavior ? `${topBehavior} is keeping momentum steady.` : "Momentum is holding."}</span>
               );
             }
            })()}
          </div>

          {/* Commitment badge - right-aligned, same line */}
          {currentFocus?.target && (
            <div className="text-white/70 text-right leading-tight">
              <div>Exercise</div>
              <div>{currentFocus.target} min+</div>
            </div>
          )}
        </div>
         {/* Momentum message */}
         {momentumMessage && (
          <p className="text-sm text-white/60 mt-2">
            {momentumMessage}
          </p>
        )}

        {/* Momentum phase */}
        {(() => {
          const total = todayMomentum.totalRealCheckIns || 0;
          const { phase, phaseIndex } = getMomentumPhase(total);
          return (
            <button
              onClick={() => setShowPhaseSheet(true)}
              className="w-full text-sm text-white/55 text-center mt-1 hover:text-white/75 transition-colors"
            >
              <span className="font-semibold">{phase} Phase</span>
              {inTheZone && (
                <span className="ml-2 text-orange-400 font-normal">· In The Zone</span>
              )}
            </button>
          );
        })()}
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
</motion.div>
{/* Phase bottom sheet */}
<PhaseBottomSheet
          isOpen={showPhaseSheet}
          onClose={() => setShowPhaseSheet(false)}
          currentPhaseIndex={getMomentumPhase(todayMomentum?.totalRealCheckIns || 0).phaseIndex}
        />

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
{/* ===== LEARN BANNER ===== */}
<LearnBanner
  userEmail={getEmail() || ''}
  firstCheckinDate={firstCheckinDate}
  readLearnSlugs={readLearnSlugs}
/>

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
        {/* Dev Tools - Extracted to separate component */}
        {process.env.NODE_ENV === "development" && (
          <DashboardDevTools 
            setTodayCheckin={setTodayCheckin}
            setTodayMomentum={setTodayMomentum}
            setCheckinSubmitted={setCheckinSubmitted}
          />
        )}
</motion.div>
<NotificationPrompt />
</motion.main>
  );
}