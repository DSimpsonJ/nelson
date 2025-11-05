"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, collection } from "firebase/firestore";
import { db } from "../firebase/config";
import { useToast } from "../context/ToastContext";
import { getEmail } from "../utils/getEmail";
import { getISOWeekId } from "../utils/programMeta";
import { endSession } from "../utils/session";

type Goal = "muscle" | "strength" | "recomp";
type Experience = "beginner" | "intermediate" | "advanced";
type BaseItem = { name: string; isMain?: boolean };

type UserProfile = {
  firstName: string;
  email: string;
  goal?: Goal;
  experience?: Experience;
  frequency?: string; // "2".."6"
};

type Exercise = {
  name: string;
  sets: number;
  targetReps: string;
  isMain?: boolean;
};

type SessionPlan = {
  dayType: "Upper" | "Lower";
  exercises: Exercise[];
};

type ProgressState = {
    weekId: string;
    sessions: number;
  };
  // --- per-set tracking for reps & weight ---
type SetCell = {
    completed: boolean;
    reps: number | null;
    weight: number | null;
  };
  // --- Session History Tracking ---
  type SessionHistoryEntry = {
    id: string;
    date: string; // ISO date string
    dayType: "Upper" | "Lower";
    totalSets: number;
    completedSets: number;
    durationSec: number;
  };
  
  function loadHistory(): SessionHistoryEntry[] {
    try {
      const raw = localStorage.getItem("nelsonHistory");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  
  function saveHistory(entries: SessionHistoryEntry[]) {
    try {
      localStorage.setItem("nelsonHistory", JSON.stringify(entries));
    } catch {}
  }

// ---------- helpers ----------
function parseFrequency(freq?: string): number {
  const n = Number(freq);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function dayTypeForToday(progress: ProgressState): "Upper" | "Lower" {
  return progress.sessions % 2 === 0 ? "Upper" : "Lower";
}

function repsFor(goal: Goal | undefined, isMain: boolean): string {
  switch (goal) {
    case "strength":
      return isMain ? "4–6" : "6–8";
    case "recomp":
      return isMain ? "8–12" : "10–15";
    case "muscle":
    default:
      return isMain ? "6–10" : "10–15";
  }
}

function setsFor(exp: Experience | undefined): number {
  if (!exp || exp === "beginner") return 3;
  return 4;
}

function selectExercises(
  day: "Upper" | "Lower",
  goal: Goal | undefined,
  exp: Experience | undefined
): Exercise[] {
  const S = setsFor(exp);

  if (day === "Upper") {
    const main: BaseItem[] =
      goal === "strength"
        ? [
            { name: "Barbell Bench Press", isMain: true },
            { name: "Barbell Row", isMain: true },
            { name: "Overhead Press", isMain: true },
          ]
        : [
            { name: "Flat DB Press", isMain: true },
            { name: "Chest-Supported Row", isMain: true },
            { name: "Seated DB Shoulder Press", isMain: true },
          ];

    const assist: BaseItem[] =
      goal === "strength"
        ? [
            { name: "Weighted Pull-ups" },
            { name: "Close-Grip Bench Press" },
            { name: "EZ-Bar Curl" },
          ]
        : [
            { name: "Lat Pulldown" },
            { name: "Cable Lateral Raise" },
            { name: "Cable Triceps Pressdown" },
            { name: "Incline DB Curl" },
          ];

    const base: BaseItem[] = [...main, ...assist].slice(0, 6);

    return base.map((e): Exercise => ({
      name: e.name,
      isMain: !!e.isMain,
      sets: S,
      targetReps: repsFor(goal, !!e.isMain),
    }));
  }

  // LOWER
  const main: BaseItem[] =
    goal === "strength"
      ? [
          { name: "Back Squat", isMain: true },
          { name: "Conventional Deadlift", isMain: true },
        ]
      : [
          { name: "Back Squat", isMain: true },
          { name: "Romanian Deadlift", isMain: true },
        ];

  const assist: BaseItem[] =
    goal === "strength"
      ? [
          { name: "Walking Lunge" },
          { name: "Leg Press" },
          { name: "Hanging Leg Raise" },
        ]
      : [
          { name: "Bulgarian Split Squat" },
          { name: "Seated Leg Curl" },
          { name: "Standing Calf Raise" },
          { name: "Cable Crunch" },
        ];

  const base: BaseItem[] = [...main, ...assist].slice(0, 6);

  return base.map((e): Exercise => ({
    name: e.name,
    isMain: !!e.isMain,
    sets: S,
    targetReps: repsFor(goal, !!e.isMain),
  }));
}

function buildSession(profile: UserProfile, progress: ProgressState): SessionPlan {
  const day = dayTypeForToday(progress);
  const exercises = selectExercises(day, profile.goal, profile.experience);
  return { dayType: day, exercises };
}

// ---------- lookup tables ----------
const exerciseCues: Record<string, string> = {
  "Barbell Bench Press": "Pin shoulder blades back. Mid-chest touch. Drive feet.",
  "Barbell Row": "Pull to lower ribs. Keep torso stable.",
  "Overhead Press": "Brace hard. Press straight overhead.",
  "Flat DB Press": "Press up then in. Keep elbows ~45 degrees.",
  "Chest-Supported Row": "Squeeze shoulder blades. Don’t shrug.",
  "Seated DB Shoulder Press": "Lower slowly. Finish biceps by ears.",

  "Weighted Pull-ups": "Chest up. Pull elbows down.",
  "Close-Grip Bench Press": "Elbows near body. Triceps drive.",
  "EZ-Bar Curl": "Elbows stay fixed. No swinging.",
  "Lat Pulldown": "Pull to upper chest. Don’t lean way back.",
  "Cable Lateral Raise": "Lead with elbows. Small bend arm.",
  "Cable Triceps Pressdown": "Lock elbows at sides.",
  "Incline DB Curl": "Stretch at bottom. Slow up.",

  "Back Squat": "Knees out. Chest proud. Hip crease below knee.",
  "Conventional Deadlift": "Brace. Push floor away. Hips and shoulders rise together.",
  "Romanian Deadlift": "Hips back. Feel hamstrings. Back neutral.",
  "Walking Lunge": "Long step. Push through heel.",
  "Leg Press": "Don’t lock knees.",
  "Hanging Leg Raise": "Don’t swing. Hips curl up.",
  "Cable Crunch": "Ribs to hips. Don’t pull with arms."
};

const swapOptions: Record<string, string[]> = {
    "Weighted Pull-ups": ["Lat Pulldown", "Seated Row"],
    "Close-Grip Bench Press": ["Triceps Dips", "Cable Triceps Pressdown"],
    "EZ-Bar Curl": ["Dumbbell Curl", "Hammer Curl"],
    "Lat Pulldown": ["Assisted Pull-up", "Band Pulldown"],
    "Cable Lateral Raise": ["DB Lateral Raise", "Lean-Away Raise"],
    "Cable Triceps Pressdown": ["Overhead Rope Extension", "Skull Crushers"],
    "Incline DB Curl": ["Preacher Curl", "Cable Curl"],
  
    "Bulgarian Split Squat": ["Lunge", "Leg Press"],
    "Seated Leg Curl": ["Lying Leg Curl", "Nordic Hamstring Curl"],
    "Standing Calf Raise": ["Seated Calf Raise", "Donkey Calf Raise"],
    "Cable Crunch": ["Hanging Knee Raise", "Ab Wheel"],
    "Leg Press": ["Front Squat", "Goblet Squat"],
    "Walking Lunge": ["Step-Up", "Reverse Lunge"]
  };
  
  // --- helpers for robust name lookups ---
  function normalizeName(s: string): string {
    return s.toLowerCase().replace(/\s+/g, " ").trim();
  }
  
  // build a normalized swap map once
  const swapOptionsNorm: Record<string, string[]> = {};
  for (const key in swapOptions) {
    swapOptionsNorm[normalizeName(key)] = swapOptions[key];
  }
// ---------- component ----------
export default function ProgramPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    weekId: getISOWeekId(new Date()),
    sessions: 0,
  });

  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [todayExercises, setTodayExercises] = useState<Exercise[]>([]);
  const [checks, setChecks] = useState<boolean[][]>([]);
  const [sessionNotes, setSessionNotes] = useState("");
  const [repsData, setRepsData] = useState<Record<string, string>>({});
  // --- Weight data tracking ---
const [weightData, setWeightData] = useState<Record<string, string>>({});
  // --- Session tracking state ---
const [sessionStart, setSessionStart] = useState<Date | null>(null);
const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>(() => loadHistory());
// Rest timer state
const [restSeconds, setRestSeconds] = useState(0);
const [isResting, setIsResting] = useState(false);
const [isPaused, setIsPaused] = useState(false);
const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
// Manual rest timer controls
const handleStartRest = () => {
    if (!isResting) {
      setIsResting(true);
    }
  };
  
  const handleStopRest = () => {
    if (isResting) {
      setIsResting(false);
      setRestSeconds(0);
    }
  };
// Track which exercise triggered the timer
const [activeRestIndex, setActiveRestIndex] = useState<number | null>(null);
// Refs for scrolling to the active exercise

const exerciseRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  // load profile + weekly progress
  
  // ✅ Updated advanced rest timer logic
  useEffect(() => {
    if (!isResting) return;
  
    let timer: NodeJS.Timeout | null = null;
  
    if (!isPaused) {
      timer = setInterval(() => {
        setRestSeconds(prev => {
          if (prev <= 1) {
            if (timer) clearInterval(timer);
            setIsResting(false);
            return 0;
          }
          return prev - 1; // ← purely relative countdown
        });
      }, 1000);
    }
  
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isResting, isPaused]);
  useEffect(() => {
    const init = async () => {
      let email: string | null = null;
      try {
        const raw = localStorage.getItem("nelsonUser");
        if (raw) {
          const parsed = JSON.parse(raw) as { email?: string };
          email = parsed?.email ?? null;
        }
      } catch {}
      if (!email) email = getEmail();

      if (!email) {
        showToast({ message: "Please sign in first.", type: "error" });
        router.replace("/signup");
        return;
      }

      try {
        const ref = doc(db, "users", email);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          showToast({ message: "Profile not found. Complete signup.", type: "error" });
          router.replace("/signup");
          return;
        }
        const data = snap.data() as UserProfile;
        setProfile({ ...data, email });

        const nowWeek = getISOWeekId(new Date());
        let stored: ProgressState | null = null;
        try {
          const raw = localStorage.getItem("nelsonProgress");
          stored = raw ? (JSON.parse(raw) as ProgressState) : null;
        } catch {}

        if (!stored || stored.weekId !== nowWeek) {
          const fresh = { weekId: nowWeek, sessions: 0 };
          localStorage.setItem("nelsonProgress", JSON.stringify(fresh));
          setProgress(fresh);
        } else {
          setProgress(stored);
        }
      } catch (err) {
        console.error("Program load error:", err);
        showToast({ message: "Could not load program.", type: "error" });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router, showToast]);

  const swapOptions: Record<string, string[]> = {
  "Weighted Pull-ups": ["Lat Pulldown", "Seated Row"],
  "Close-Grip Bench Press": ["Triceps Dips", "Cable Triceps Pressdown"],
  "EZ-Bar Curl": ["Dumbbell Curl", "Hammer Curl"],
  "Lat Pulldown": ["Assisted Pull-up", "Band Pulldown"],
  "Cable Lateral Raise": ["DB Lateral Raise", "Lean-Away Raise"],
  "Cable Triceps Pressdown": ["Overhead Rope Extension", "Skull Crushers"],
  "Incline DB Curl": ["Preacher Curl", "Cable Curl"],

  "Bulgarian Split Squat": ["Lunge", "Leg Press"],
  "Seated Leg Curl": ["Lying Leg Curl", "Nordic Hamstring Curl"],
  "Standing Calf Raise": ["Seated Calf Raise", "Donkey Calf Raise"],
  "Cable Crunch": ["Hanging Knee Raise", "Ab Wheel"],
  "Leg Press": ["Front Squat", "Goblet Squat"],
  "Walking Lunge": ["Step-Up", "Reverse Lunge"]
};

// --- helpers for robust name lookups ---
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// build a normalized swap map once
const swapOptionsNorm: Record<string, string[]> = {};
for (const key in swapOptions) {
  swapOptionsNorm[normalizeName(key)] = swapOptions[key];
}// build plan once profile/progress are available
useEffect(() => {
    if (!profile) return;
    const built = buildSession(profile, progress);
    setPlan(built);
  
    // try to restore a saved session first
    try {
      const savedRaw = localStorage.getItem("nelsonSessionExercises");
      const saved = savedRaw ? (JSON.parse(savedRaw) as Exercise[]) : null;
      if (saved && Array.isArray(saved) && saved.length) {
        setTodayExercises(saved);
        return;
      }
    } catch {}
  
    // if nothing saved, seed from new build
    setTodayExercises(built.exercises);
  }, [profile, progress]);
  useEffect(() => {
    if (todayExercises.length && !sessionStart) {
      setSessionStart(new Date());
    }
  }, [todayExercises]);
 // --- Restore saved session state (one-time) ---
useEffect(() => {
    try {
      const savedState = localStorage.getItem("nelsonSessionState");
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.checks) setChecks(parsed.checks);
        if (parsed.restSeconds) setRestSeconds(parsed.restSeconds);
        if (parsed.isResting) {
            setRestSeconds(parsed.restSeconds || 0);
          
            // Auto-resume only if it wasn’t paused
            if (!parsed.isPaused) {
              setIsResting(true);
            } else {
              setIsResting(false);
            }
          }
          
          if (parsed.isPaused !== undefined) {
            setIsPaused(parsed.isPaused);
          }
        if (parsed.activeRestIndex !== undefined) setActiveRestIndex(parsed.activeRestIndex);
      }
    } catch {}
  }, []); // ← empty dependency array prevents re-renders
  // whenever today's exercises change (swap, etc.), reset checks
  useEffect(() => {
    if (!todayExercises.length) return;
  
    try {
      const savedState = localStorage.getItem("nelsonSessionState");
      if (savedState) {
        const parsed = JSON.parse(savedState);
        // ✅ only rebuild checks if no saved checks found
        if (parsed.checks && parsed.checks.length) {
          setChecks(parsed.checks);
          return;
        }
      }
    } catch (err) {
      console.error("Failed to load saved session state:", err);
    }
  
    // default: create a fresh unchecked grid
    setChecks(todayExercises.map(ex => Array(ex.sets).fill(false)));
  }, [todayExercises]);
  // --- Auto-scroll when rest timer starts (with offset correction) ---
useEffect(() => {
    if (!isResting || activeRestIndex === null) return;
  
    const el = exerciseRefs.current[activeRestIndex];
    if (el) {
      const yOffset = -80; // adjust this number based on your header height
      const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
  
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, [isResting, activeRestIndex]);
// --- Autosave session state ---
useEffect(() => {
    const data = {
      checks,
      restSeconds,
      isResting,
      isPaused, // ✅ key addition
      activeRestIndex,
    };
    try {
      localStorage.setItem("nelsonSessionState", JSON.stringify(data));
    } catch {}
  }, [checks, restSeconds, isResting, isPaused, activeRestIndex]);
  

// --- Persist reps & weight (robust + one-time restore) ---
const mountedRef = useRef(false);

// --- One-time restore when exercises & checks are ready ---
useEffect(() => {
  if (!todayExercises.length || !checks.length) return;

  try {
    const repsRaw = localStorage.getItem("nelsonRepsData");
    const weightsRaw = localStorage.getItem("nelsonWeightData");

    if (repsRaw) {
      const parsed = JSON.parse(repsRaw);
      if (Object.keys(parsed).length > 0) setRepsData(parsed);
    }

    if (weightsRaw) {
      const parsed = JSON.parse(weightsRaw);
      if (Object.keys(parsed).length > 0) setWeightData(parsed);
    }
  } catch (err) {
    console.error("Failed to load reps/weights:", err);
  } finally {
    // signal ready for autosaving
    mountedRef.current = true;
  }
}, [todayExercises, checks]);

// --- Autosave reps AFTER initial restore ---
useEffect(() => {
  if (!mountedRef.current) return;
  try {
    localStorage.setItem("nelsonRepsData", JSON.stringify(repsData));
  } catch (err) {
    console.error("Failed to save reps:", err);
  }
}, [repsData]);

// --- Autosave weight AFTER initial restore ---
useEffect(() => {
  if (!mountedRef.current) return;
  try {
    localStorage.setItem("nelsonWeightData", JSON.stringify(weightData));
  } catch (err) {
    console.error("Failed to save weights:", err);
  }
}, [weightData]);
  const frequency = useMemo(() => parseFrequency(profile?.frequency), [profile?.frequency]);

  const allChecked = useMemo(() => {
    if (!checks.length) return false;
    return checks.every(exRow => exRow.every(Boolean));
  }, [checks]);

  const completedSets = useMemo(() => {
    return checks.flat().filter(Boolean).length;
  }, [checks]);
  
  const totalSets = useMemo(() => {
    return checks.flat().length || 0;
  }, [checks]);
  
  const progressPercent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
  const toggleCheck = (i: number, j: number) => {
    setChecks(prev => {
      const next = prev.map(row => row.slice());
      const wasChecked = next[i][j];
      next[i][j] = !wasChecked;
  
      // If the user just completed a set (turned true), start rest timer
      if (!wasChecked) {
        setIsResting(false); // reset first to trigger a fresh effect
        setTimeout(() => {
          setActiveRestIndex(i);
          setRestSeconds(60);
          setIsResting(true);
      
          // --- Immediate scroll into view when timer starts ---
          const el = exerciseRefs.current[i];
          if (el) {
            const yOffset = -80;
            const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
            window.scrollTo({ top: y, behavior: "smooth" });
          }
          setHighlightedIndex(i);
setTimeout(() => setHighlightedIndex(null), 1000);
        }, 0);
      }
  
      return next;
    });
  };

  const handleSwap = (exIndex: number) => {
    // normalize the current exercise name
    const currentName = todayExercises[exIndex].name;
    const key = normalizeName(currentName);
  
    // find swap pool using normalized key
    let pool = swapOptionsNorm[key] ?? [];
  
    // fallback: any other assist exercises in session
    if (!pool.length) {
      pool = todayExercises
        .filter((e, i) => i !== exIndex && !e.isMain)
        .map(e => e.name);
    }
  
    if (!pool.length) {
      setTimeout(() => {
        showToast({
          message: "No swap options available for this exercise.",
          type: "info",
        });
      }, 0);
      return;
    }
  
    // pick a different name if possible
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (normalizeName(next) === key && pool.length > 1) {
      const alt = pool.find(n => normalizeName(n) !== key);
      if (alt) next = alt;
    }
  
    // update UI and reset checks
    const updated = todayExercises.map((ex, i) =>
      i === exIndex ? { ...ex, name: next, isMain: false } : ex
    );
    setTodayExercises(updated);
    setChecks(updated.map(ex => Array(ex.sets).fill(false)));
  
    // persist to localStorage so refresh doesn’t revert
    try {
      localStorage.setItem("nelsonSessionExercises", JSON.stringify(updated));
    } catch {}
  
    setTimeout(() => {
      showToast({ message: "Exercise swapped!", type: "success" });
    }, 0);
  };
  
  // --- move exercise up/down handlers ---
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setTodayExercises(prev => {
      const updated = [...prev];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      return updated;
    });
    setChecks(prev => {
      const updated = [...prev];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      return updated;
    });
  };
  
  const handleMoveDown = (index: number) => {
    setTodayExercises(prev => {
      if (index === prev.length - 1) return prev;
      const updated = [...prev];
      [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
      return updated;
    });
    setChecks(prev => {
      if (index === prev.length - 1) return prev;
      const updated = [...prev];
      [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
      return updated;
    });
  };
  const handleResetSession = () => {
    if (!plan) return;
  
    // Restore the original plan’s exercises
    const restored = plan.exercises;
  
    // Reset local state
    setTodayExercises(restored);
    setChecks(restored.map(ex => Array(ex.sets).fill(false)));
    setIsResting(false);
    setIsPaused(false);
    setRestSeconds(0);
    setActiveRestIndex(null);
    // Clear saved session from localStorage
    try {
      localStorage.removeItem("nelsonSessionExercises");
    } catch {}
  
    showToast({ message: "Session reset to original plan.", type: "info" });
  };
  // --- Handle session completion ---
const handleComplete = async () => {
  if (!allChecked) {
    showToast({
      message: "Finish all sets to complete the session.",
      type: "info",
    });
    return;
  }

  const currentWeek = getISOWeekId(new Date());
  let updated: ProgressState = { weekId: currentWeek, sessions: 0 };

  try {
    const raw = localStorage.getItem("nelsonProgress");
    const prev = raw ? (JSON.parse(raw) as ProgressState) : null;
    if (prev && prev.weekId === currentWeek) {
      updated = { weekId: currentWeek, sessions: prev.sessions + 1 };
    } else {
      updated = { weekId: currentWeek, sessions: 1 };
    }
  } catch {
    updated = { weekId: currentWeek, sessions: 1 };
  }

  localStorage.setItem("nelsonProgress", JSON.stringify(updated));
  setProgress(updated);

  // --- ✅ Build structured exercise data for Firestore ---
  const structuredData = todayExercises.map((ex, i) => ({
    name: ex.name,
    sets: checks[i].map((_, j) => ({
      reps: repsData[`${i}-${j}`] ?? null,
      weight: weightData[`${i}-${j}`] ?? null,
    })),
  }));

  // --- ✅ Build full session payload ---
  const newSession = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    dayType: plan?.dayType || "Unknown",
    totalSets,
    completedSets,
    durationSec: sessionStart
      ? Math.floor((Date.now() - sessionStart.getTime()) / 1000)
      : 0,
    notes: sessionNotes || "",
    exercises: structuredData, // full structured data
    repsData,                  // include raw mapping
    weightData,                // include raw mapping
    createdAt: new Date().toISOString(),
  };

  // --- ✅ Save to Firestore ---
  try {
    const email = getEmail();
    if (!email) throw new Error("No user email found");

    // ✅ use addDoc for unique IDs automatically
    const sessionsRef = collection(db, "users", email, "sessions");
    await setDoc(doc(sessionsRef, newSession.id), newSession);
// --- ✅ Update personal records locally ---
try {
    const stored = localStorage.getItem("personalRecords");
    const prs = stored ? JSON.parse(stored) : {};
  
    for (const ex of newSession.exercises) {
      for (const set of ex.sets) {
        const w = Number(set.weight);
        if (!prs[ex.name] || w > prs[ex.name]) {
          prs[ex.name] = w;
        }
      }
    }
  
    localStorage.setItem("personalRecords", JSON.stringify(prs));
  } catch (err) {
    console.error("Failed to update personal records:", err);
  }
    // ✅ clear temp session storage after successful save
    localStorage.removeItem("nelsonRepsData");
    localStorage.removeItem("nelsonWeightData");
  } catch (err) {
    console.error("Failed to save session:", err);
    showToast({
      message: "Failed to sync to cloud. Data saved locally.",
      type: "error",
    });
  }

  showToast({ message: "Nice work — session logged!", type: "success" });
  setTimeout(() => router.replace("/dashboard"), 600);

  setIsResting(false);
  setActiveRestIndex(null);
  setRestSeconds(0);
};
    
    if (loading || !plan) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="bg-white shadow-lg rounded-xl px-8 py-6">
            <p className="text-gray-700 font-semibold animate-pulse">
              Loading today’s session…
            </p>
          </div>
        </main>
      );
    }

  const { dayType } = plan;
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            {dayType} Day • {profile?.firstName ? `${profile.firstName}` : "Athlete"}
          </h1>
          <p className="mt-1 text-gray-600">
            {frequency
              ? `Week target: ${frequency} sessions`
              : "Set your weekly target in profile."}
          </p>
        </div>

        {/* Exercise list with set checkboxes */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="space-y-6">
            {todayExercises.map((ex, i) => (
              <div
                key={`${ex.name}-${i}`}
                ref={(el) => {
                    exerciseRefs.current[i] = el;
                  }}
                className={`border rounded-xl p-4 transition-all duration-500 ${
                  highlightedIndex === i
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{ex.name}</p>
                    <p className="text-sm text-gray-700 font-medium">
                      {ex.sets} sets × {ex.targetReps} reps
                      {ex.isMain && <span className="text-blue-600 ml-1">• Main Lift</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {exerciseCues[ex.name] ?? ""}
                    </p>
                  </div>
                </div>

                {!ex.isMain && (
                  <button
                    type="button"
                    onClick={() => handleSwap(i)}
                    className="text-xs text-blue-600 font-semibold hover:underline mt-1"
                  >
                    Swap Exercise
                  </button>
                )}

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(i)}
                    className="text-xs text-gray-500 hover:text-blue-600 font-semibold"
                  >
                    ↑ Move Up
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(i)}
                    className="text-xs text-gray-500 hover:text-blue-600 font-semibold"
                  >
                    ↓ Move Down
                  </button>
                </div>

                {(isResting || restSeconds > 0) && activeRestIndex === i && (
                  <div className="mt-2 text-center">
                    <p className="text-sm text-blue-600 font-semibold">
                      Rest: {restSeconds}s
                    </p>
                    <div className="flex justify-center gap-2 mt-2">
                      <button
                        onClick={() => {
                          if (isPaused) setIsResting(true);
                          setIsPaused((prev) => !prev);
                        }}
                        className="px-3 py-1 bg-yellow-500 text-white rounded-md text-xs font-semibold hover:bg-yellow-600 transition"
                      >
                        {isPaused ? "Resume" : "Pause"}
                      </button>
                      <button
                        onClick={() => {
                          setIsResting(false);
                          setIsPaused(false);
                          setRestSeconds(0);
                          setActiveRestIndex(null);
                        }}
                        className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs font-semibold hover:bg-blue-600 transition"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => setRestSeconds((prev) => prev + 10)}
                        className="px-3 py-1 bg-green-500 text-white rounded-md text-xs font-semibold hover:bg-green-600 transition"
                      >
                        +10s
                      </button>
                    </div>
                  </div>
                )}

                {/* ✅ START SET BLOCK */}
                <div className="mt-4 ml-1 sm:ml-3">
                  <div className="flex flex-col gap-1">
                    {checks[i]?.map((checked, j) => (
                      <div
                        key={j}
                        className="flex flex-wrap items-center gap-2 mb-1 sm:gap-3 sm:mb-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCheck(i, j)}
                          className={`px-3 py-2 rounded-md text-sm font-semibold border ${
                            checked
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-800 border-gray-300"
                          }`}
                          aria-pressed={checked}
                        >
                          Set {j + 1}
                        </button>

                        <label className="text-gray-700 text-xs">Reps:</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={repsData[`${i}-${j}`] ?? ""}
                          onChange={(e) =>
                            setRepsData((prev) => ({
                              ...prev,
                              [`${i}-${j}`]: e.target.value,
                            }))
                          }
                          className="w-14 sm:w-16 px-2 py-[3px] border border-gray-300 rounded-md text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />

                        <label className="text-gray-700 text-xs ml-1">Wt:</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="lb"
                          value={weightData[`${i}-${j}`] ?? ""}
                          onChange={(e) =>
                            setWeightData((prev) => ({
                              ...prev,
                              [`${i}-${j}`]: e.target.value,
                            }))
                          }
                          className="w-14 sm:w-16 px-2 py-[3px] border border-gray-300 rounded-md text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* ✅ END SET BLOCK */}
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>
                {completedSets} of {totalSets} sets completed
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Session Notes */}
          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Session Notes
            </label>
            <textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="How did today’s session go?"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-600">
              Check off every set to complete today’s session.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleResetSession}
                type="button"
                className="px-4 py-2 rounded-lg font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
              >
                Reset Session
              </button>

              <button
                onClick={handleComplete}
                type="button"
                disabled={!allChecked}
                className={`px-5 py-3 rounded-lg font-semibold ${
                  allChecked
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                Mark Session Complete
              </button>
            </div>
          </div>
        </div>
      </div>

{/* Only show Finish Workout once all sets are complete */}
{allChecked && (
  <button
    onClick={async () => {
      try {
        const email = getEmail();
        if (!email) {
          showToast({ message: "No user email found", type: "error" });
          return;
        }

        // Count completed sets safely (works for nested or flat arrays)
        const totalSetsCompleted = Array.isArray(checks[0])
          ? checks.flat().filter(Boolean).length
          : checks.filter(Boolean).length;

        await endSession(email, today, totalSetsCompleted);

        showToast({ message: "Workout saved!", type: "success" });
        router.push("/dashboard");
      } catch (err) {
        console.error("Error ending workout:", err);
        showToast({ message: "Error saving workout", type: "error" });
      }
    }}
    className="w-full bg-green-600 text-white py-2 rounded-md font-semibold mt-4 hover:bg-green-700 transition"
  >
    Finish Workout
  </button>
)}

    </main>
  );
} // END ProgramPage