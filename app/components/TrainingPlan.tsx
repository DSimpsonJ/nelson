"use client";

import React, { useMemo, useState, useEffect } from "react";
import { isDeloadWeek, getISOWeekId } from "@/app/utils/programMeta";
import { getEmail } from "@/app/utils/getEmail";
import { useToast } from "@/app/context/ToastContext";

/* ========= Controlled vocabularies ========= */
export const EQUIPMENT = [
  "Barbell","Dumbbells","Kettlebell","Bodyweight","Cable","Machine",
  "Smith Machine","Trap Bar","Landmine","Suspension","Band","Plate Loaded","Plate Only",
] as const;

export const PATTERNS = [
  "Squat","Hinge","Horizontal Push","Horizontal Pull","Vertical Push","Vertical Pull",
  "Lunge","Core","Accessory",
] as const;

export type Difficulty = "Beginner" | "Intermediate" | "Advanced";

/* ========= Types ========= */
export type WorkoutSet = {
  reps: number | null;
  score: number | null;       // null = not logged yet, 2 = good, 3 = crushed
  completed: boolean;
};

interface Exercise {
  name: string;
  muscles: string[];
  type: "compound" | "accessory";
  pattern: (typeof PATTERNS)[number];
  equipment: (typeof EQUIPMENT)[number];
  difficulty: Difficulty;
  sets?: WorkoutSet[];        // optional until a user logs
}
// Sorting helper: compounds first, alphabetical secondary
function sortExercises(list: Exercise[]): Exercise[] {
    return [...list].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "compound" ? -1 : 1;
    });
  }
interface TrainingPlanProps {
  goal: string;
  experience: string;
  frequency: string; // "2"..."6"
}

interface WeekCompletion {
  byFocus: Record<string, boolean>;
  byDay: Record<string, boolean>; // "day-1", "day-2", etc.
  weekId: string;                 // e.g. "2025-W44"
  weekStart: "monday" | "sunday";
  updatedAt?: number;
}


/* ========= Component ========= */
export default function TrainingPlan({ goal, experience, frequency }: TrainingPlanProps) {
    // ===== Rest Alert Helpers =====
// Keep one unlocked audio instance for iOS + Safari
let restSound: HTMLAudioElement | null = null;

function playRestSound() {
  if (!restSound) {
    restSound = new Audio("/sounds/rest-complete.mp3");
  }
  restSound.currentTime = 0; // restart sound if it already played
  restSound.play().catch(() => {});
}
  
  function vibratePhone() {
    if (typeof window !== "undefined" &&
        "navigator" in window &&
        "vibrate" in navigator) {
      navigator.vibrate(200);
    }
  }
  // ✅ Unlock audio + vibration when the user taps anywhere inside workout details
function unlockMedia() {
    if (!audioUnlocked) {
      playRestSound();
      vibratePhone();
      setAudioUnlocked(true);
      console.log("✅ Audio + vibration unlocked");
    }
  }
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // focus key like "push"
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null); // 0-based index in plan list
  // swap + add-exercise state
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [swapOptions, setSwapOptions] = useState<Exercise[]>([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [tick, setTick] = useState(0);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [programMeta, setProgramMeta] = useState<{ blockStartWeekId: string } | null>(null);
  // Used only to force re-render for timer UI


  // loading state for opening a day and reading Firestore
  const [loadingDay, setLoadingDay] = useState<string | null>(null);
// === Rest Timer state ===
const [activeTimer, setActiveTimer] = useState<{
    exerciseIdx: number;
    setIdx: number;
    endsAt: number;
  } | null>(null);
  // cached workouts by focus key, and weekly completion state
  const [workouts, setWorkouts] = useState<Record<string, Exercise[]>>({});
  const [completion, setCompletion] = useState<WeekCompletion | null>(null);

// load completion on mount
useEffect(() => {
    loadWeekCompletion("monday");
  
    // ✅ Hide success banner whenever dashboard loads fresh
    setShowSuccess(false);
  }, []);
  // === Timer Tick Logic ===
useEffect(() => {
    if (!activeTimer) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
    }, 500);
    return () => clearInterval(id);
  }, [activeTimer]);
  // Fire sound + vibration exactly once when timer completes
useEffect(() => {
    if (!activeTimer || !audioUnlocked) return;
  
    const remaining = activeTimer.endsAt - Date.now();
  
    if (remaining <= 0) {
      playRestSound();
      vibratePhone();
      // Do NOT clear activeTimer here, just stop beeping
    }
  }, [tick, activeTimer, audioUnlocked]);
    // Fire sound + vibration exactly once when timer completes
useEffect(() => {
    if (!activeTimer || !audioUnlocked) return;
  
    const remaining = activeTimer.endsAt - Date.now();
  
    if (remaining <= 0) {
      playRestSound();
      vibratePhone();
      // Do NOT clear activeTimer here, just stop beeping
    }
  }, [tick, activeTimer, audioUnlocked]);

  /* ========= Templates (seed lists per focus) ========= */
  const exerciseLibrary: Record<string, Exercise[]> = {
    push: [
      { name:"Bench Press", muscles:["Chest","Triceps"], type:"compound", pattern:"Horizontal Push", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Incline Dumbbell Press", muscles:["Chest","Shoulders"], type:"compound", pattern:"Horizontal Push", equipment:"Dumbbells", difficulty:"Beginner" },
      { name:"Overhead Press", muscles:["Shoulders","Triceps"], type:"compound", pattern:"Vertical Push", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Triceps Dips", muscles:["Triceps","Chest"], type:"accessory", pattern:"Accessory", equipment:"Bodyweight", difficulty:"Intermediate" },
    ],
    pull: [
      { name:"Pull-up", muscles:["Back","Biceps"], type:"compound", pattern:"Vertical Pull", equipment:"Bodyweight", difficulty:"Intermediate" },
      { name:"Barbell Row", muscles:["Back"], type:"compound", pattern:"Horizontal Pull", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Face Pull", muscles:["Rear Delts"], type:"accessory", pattern:"Horizontal Pull", equipment:"Cable", difficulty:"Beginner" },
      { name:"Biceps Curl", muscles:["Biceps"], type:"accessory", pattern:"Accessory", equipment:"Dumbbells", difficulty:"Beginner" },
    ],
    legs: [
      { name:"Back Squat", muscles:["Quads","Glutes"], type:"compound", pattern:"Squat", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Romanian Deadlift", muscles:["Hamstrings"], type:"compound", pattern:"Hinge", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Walking Lunge", muscles:["Legs"], type:"compound", pattern:"Lunge", equipment:"Dumbbells", difficulty:"Beginner" },
      { name:"Leg Press", muscles:["Quads"], type:"accessory", pattern:"Squat", equipment:"Machine", difficulty:"Beginner" },
    ],
    full: [
      { name:"Clean & Press", muscles:["Full Body"], type:"compound", pattern:"Hinge", equipment:"Barbell", difficulty:"Advanced" },
      { name:"Front Squat", muscles:["Quads"], type:"compound", pattern:"Squat", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Pull-up", muscles:["Back"], type:"compound", pattern:"Vertical Pull", equipment:"Bodyweight", difficulty:"Intermediate" },
      { name:"Push-up", muscles:["Chest"], type:"accessory", pattern:"Horizontal Push", equipment:"Bodyweight", difficulty:"Beginner" },
    ],
    squat: [
      { name:"Back Squat", muscles:["Quads","Glutes"], type:"compound", pattern:"Squat", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Leg Press", muscles:["Quads"], type:"accessory", pattern:"Squat", equipment:"Machine", difficulty:"Beginner" },
      { name:"Bulgarian Split Squat", muscles:["Quads","Glutes"], type:"compound", pattern:"Lunge", equipment:"Dumbbells", difficulty:"Intermediate" },
      { name:"Hamstring Curl", muscles:["Hamstrings"], type:"accessory", pattern:"Hinge", equipment:"Machine", difficulty:"Beginner" },
    ],
    bench: [
      { name:"Barbell Bench Press", muscles:["Chest","Triceps"], type:"compound", pattern:"Horizontal Push", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Incline DB Press", muscles:["Chest","Shoulders"], type:"compound", pattern:"Horizontal Push", equipment:"Dumbbells", difficulty:"Beginner" },
      { name:"Dips", muscles:["Triceps","Chest"], type:"accessory", pattern:"Accessory", equipment:"Bodyweight", difficulty:"Intermediate" },
      { name:"Push-ups", muscles:["Chest"], type:"accessory", pattern:"Horizontal Push", equipment:"Bodyweight", difficulty:"Beginner" },
    ],
    deadlift: [
      { name:"Conventional Deadlift", muscles:["Posterior Chain"], type:"compound", pattern:"Hinge", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Barbell Row", muscles:["Back"], type:"compound", pattern:"Horizontal Pull", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Good Morning", muscles:["Hamstrings"], type:"accessory", pattern:"Hinge", equipment:"Barbell", difficulty:"Advanced" },
      { name:"Pull-up", muscles:["Back","Biceps"], type:"compound", pattern:"Vertical Pull", equipment:"Bodyweight", difficulty:"Intermediate" },
    ],
    overhead: [
      { name:"Overhead Press", muscles:["Shoulders","Triceps"], type:"compound", pattern:"Vertical Push", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Lateral Raise", muscles:["Medial Delts"], type:"accessory", pattern:"Accessory", equipment:"Dumbbells", difficulty:"Beginner" },
      { name:"Arnold Press", muscles:["Shoulders"], type:"compound", pattern:"Vertical Push", equipment:"Dumbbells", difficulty:"Intermediate" },
      { name:"Triceps Extension", muscles:["Triceps"], type:"accessory", pattern:"Accessory", equipment:"Cable", difficulty:"Beginner" },
    ],
    "upper-lower": [
      { name:"Bench Press", muscles:["Chest","Triceps"], type:"compound", pattern:"Horizontal Push", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Pull-up", muscles:["Back"], type:"compound", pattern:"Vertical Pull", equipment:"Bodyweight", difficulty:"Intermediate" },
      { name:"Squat", muscles:["Quads","Glutes"], type:"compound", pattern:"Squat", equipment:"Barbell", difficulty:"Intermediate" },
      { name:"Romanian Deadlift", muscles:["Hamstrings"], type:"compound", pattern:"Hinge", equipment:"Barbell", difficulty:"Intermediate" },
    ],
  };

  /* ========= Plan by goal + frequency ========= */
  const plan = useMemo(() => {
    const f = frequency;
    if (goal === "muscle") {
      if (f === "2") return [
        { title: "Day 1 — Full Body A", focus: "full" },
        { title: "Day 2 — Full Body B", focus: "full" },
      ];
      if (f === "3") return [
        { title: "Day 1 — Push", focus: "push" },
        { title: "Day 2 — Pull", focus: "pull" },
        { title: "Day 3 — Legs", focus: "legs" },
      ];
      if (f === "4") return [
        { title: "Day 1 — Push", focus: "push" },
        { title: "Day 2 — Pull", focus: "pull" },
        { title: "Day 3 — Legs", focus: "legs" },
        { title: "Day 4 — Full Body Accessories", focus: "full" },
      ];
      if (f === "5") return [
        { title: "Day 1 — Upper", focus: "upper-lower" },
        { title: "Day 2 — Lower", focus: "upper-lower" },
        { title: "Day 3 — Push", focus: "push" },
        { title: "Day 4 — Pull", focus: "pull" },
        { title: "Day 5 — Legs", focus: "legs" },
      ];
      if (f === "6") return [
        { title: "Day 1 — Upper", focus: "upper-lower" },
        { title: "Day 2 — Lower", focus: "upper-lower" },
        { title: "Day 3 — Push", focus: "push" },
        { title: "Day 4 — Pull", focus: "pull" },
        { title: "Day 5 — Legs", focus: "legs" },
        { title: "Day 6 — Full Body Accessories", focus: "full" },
      ];
    }
    return [
      { title: "Day 1 — Squat Focus", focus: "squat" },
      { title: "Day 2 — Bench Focus", focus: "bench" },
      { title: "Day 3 — Deadlift Focus", focus: "deadlift" },
      { title: "Day 4 — Overhead & Accessories", focus: "overhead" },
    ];
  }, [goal, frequency]);

  /* ========= Volume by experience ========= */
  const volume = useMemo(() => {
    if (experience === "beginner") return { sets: 3, reps: "8–10", rest: "90s" };
    if (experience === "intermediate") return { sets: 4, reps: "8–12", rest: "75s" };
    return { sets: 5, reps: "6–8", rest: "60s" };
  }, [experience]);

  /* ========= Helpers: Firestore ========= */
  const getEmail = () => {
    try {
      const raw = localStorage.getItem("nelsonUser");
      if (!raw) return null;
      return JSON.parse(raw)?.email || null;
    } catch {
      return null;
    }
  };

  async function loadWeekCompletion(weekStart: "monday" | "sunday" = "monday") {
    const email = getEmail();
    if (!email) return;

    const weekId = getISOWeekId(new Date());
    const { db } = await import("../firebase/config");
    const { doc, getDoc, setDoc } = await import("firebase/firestore");

    const ref = doc(db, "users", email, "weeks", weekId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as WeekCompletion;
      setCompletion({ ...data, weekId, weekStart: data.weekStart || weekStart });
      return;
    }

    const blank: WeekCompletion = {
      byFocus: {},
      byDay: {},
      weekId,
      weekStart,
      updatedAt: Date.now(),
    };
    await setDoc(ref, blank, { merge: true });
    setCompletion(blank);
  }

  async function setCompleted(focus: string, dayIndex: number, done: boolean) {
    const email = getEmail();
    if (!email) return;

    const weekStart: "monday" | "sunday" = completion?.weekStart || "monday";
    const currentWeek = getISOWeekId(new Date());
    const { db } = await import("../firebase/config");
    const { doc, setDoc } = await import("firebase/firestore");

    const ref = doc(db, "users", email, "weeks", currentWeek);
    const dayKey = `day-${dayIndex + 1}`;

    const updatedByDay = { ...(completion?.byDay || {}) };
    if (done) updatedByDay[dayKey] = true;
    else delete updatedByDay[dayKey];

    const next: WeekCompletion = {
      byFocus: { ...(completion?.byFocus || {}) },
      byDay: updatedByDay,
      weekId: currentWeek,
      weekStart,
      updatedAt: Date.now(),
    };

    await setDoc(ref, next, { merge: true });
    setCompletion(next);
  }

  // Open a day (seed or load workout)
  async function openDay(focus: string, index: number) {
    setLoadingDay(focus);

    if (!completion) await loadWeekCompletion("monday");

    const email = getEmail();
    if (email) {
      const { db } = await import("../firebase/config");
      const { doc, getDoc, setDoc } = await import("firebase/firestore");
      const wRef = doc(db, "users", email, "workouts", focus);
      const wSnap = await getDoc(wRef);

      if (wSnap.exists()) {
        const data = wSnap.data() as { exercises?: Exercise[] };
        if (data?.exercises && data.exercises.length > 0) {
            setWorkouts(prev => ({
                ...prev,
                [focus]: sortExercises(data.exercises!)
              }));
        } else {
          const seed = exerciseLibrary[focus] || [];
          await setDoc(wRef, { type: focus, exercises: seed }, { merge: true });
          setWorkouts(prev => ({
            ...prev,
            [focus]: sortExercises(seed)
          }));
        }
    } else {
        const seed = exerciseLibrary[focus] || [];
        await setDoc(wRef, { type: focus, exercises: seed }, { merge: true });
        setWorkouts(prev => ({
          ...prev,
          [focus]: sortExercises(seed)
        }));
      }
      } else {
        setWorkouts(prev => ({
          ...prev,
          [focus]: sortExercises(exerciseLibrary[focus] || [])
        }));
      }
      
      setSelectedDay(focus);
      setSelectedDayIndex(index);
      setLoadingDay(null);
  }

  /* ========= Persist a single exercise's sets ========= */
  async function updateWorkoutSet(focus: string, exIndex: number, updatedSets: WorkoutSet[]) {
    // Local first
    setWorkouts(prev => {
      const copy = { ...prev };
      const dayList = [...(copy[focus] || [])];
      dayList[exIndex] = { ...dayList[exIndex], sets: updatedSets };
      copy[focus] = dayList;
      return copy;
    });

    // Firestore
    const email = getEmail();
    if (!email) return;

    const { db } = await import("../firebase/config");
    const { doc, setDoc } = await import("firebase/firestore");
    const ref = doc(db, "users", email, "workouts", focus);

    const latest = (workouts[focus] || exerciseLibrary[focus] || []).map((e, i) =>
      i === exIndex ? { ...e, sets: updatedSets } : e
    );

    await setDoc(ref, { type: focus, exercises: latest }, { merge: true });
  }

  /* ========= Swap exercise, keep logged sets if present ========= */
  async function commitSwap(option: Exercise) {
    if (selectedDay == null || swapIndex == null) {
      setShowSwapModal(false);
      return;
    }
  
    const focus = selectedDay;
    const current = workouts[focus] || exerciseLibrary[focus] || [];
    const updated = [...current];
  
    // preserve sets so user does not lose logged progress
    const prevSets = current[swapIndex]?.sets;
    const swapped = { ...option, sets: prevSets };
  
    updated[swapIndex] = swapped;
  
    // ✅ Re-sort after swap
    const reSorted = sortExercises(updated);
  
    const email = getEmail();
    if (email) {
      const { db } = await import("../firebase/config");
      const { doc, setDoc } = await import("firebase/firestore");
      const ref = doc(db, "users", email, "workouts", focus);
  
      await setDoc(ref, { type: focus, exercises: reSorted }, { merge: true });
    }
  
    setWorkouts(prev => ({ ...prev, [focus]: reSorted }));
    setShowSwapModal(false);
    setSwapIndex(null);
    setSelectedDayIndex(null);
    setSwapIndex(null);
  }
// ===== Move exercise up/down but keep compounds above accessories =====
function moveExercise(focus: string, index: number, direction: "up" | "down") {
    const list = [...(workouts[focus] || [])];
  
    const newIndex = index + (direction === "up" ? -1 : 1);
    if (newIndex < 0 || newIndex >= list.length) return;
  
    const current = list[index];
    const target = list[newIndex];
  
    // Respect type rules: compounds must remain above accessories
    if (current.type === "accessory" && target.type === "compound") return;
  
    // Swap items
    [list[index], list[newIndex]] = [list[newIndex], list[index]];
  
    const email = getEmail();
    if (email) {
      import("../firebase/config").then(async ({ db }) => {
        const { doc, setDoc } = await import("firebase/firestore");
        const ref = doc(db, "users", email, "workouts", focus);
        await setDoc(ref, { type: focus, exercises: list }, { merge: true });
      });
    }
  
    setWorkouts(prev => ({ ...prev, [focus]: list }));
  }
/* ========= Derived ========= */
const exercises: Exercise[] = selectedDay
  ? (workouts[selectedDay] || exerciseLibrary[selectedDay] || [])
  : [];

// Determine if *this day* is fully complete
const dayCompleted = useMemo(() => {
  if (!selectedDay) return false;
  const list = exercises;
  if (!list.length) return false;

  return list.every(ex =>
    ex.sets?.length &&
    ex.sets.every(s => s.completed === true)
  );
}, [selectedDay, exercises]);

// Weekly completion count
const completedCount = useMemo(() => {
  if (!completion) return 0;
  return plan.reduce((acc, _, i) => {
    const dayKey = `day-${i + 1}`;
    return acc + (completion.byDay?.[dayKey] ? 1 : 0);
  }, 0);
}, [completion, plan]);

const percent = Math.round((completedCount / plan.length) * 100);

  /* ========= Render ========= */
  return (
    <section className="bg-white p-8 rounded-2xl shadow mb-8 relative">
        {completeMessage && (
  <div className="absolute top-2 right-2 bg-green-600 text-white text-sm px-3 py-2 rounded shadow animate-fade-in">
    ✅ {completeMessage}
  </div>
)}
     <h2 className="text-xl font-bold text-gray-800 mb-2">
  Your {goal === "muscle" ? "Muscle-Building" : goal === "strength" ? "Strength" : "Recomp"} Plan
</h2>

{/* Success banner */}
{completeMessage && (
  <div className="mb-3 rounded-lg bg-green-50 border border-green-200 text-green-800 px-3 py-2 text-sm">
    {completeMessage}
  </div>
)}

{!audioUnlocked && (
  <button
    onClick={() => {
      let startSound = new Audio("/sounds/rest-complete.mp3");
      startSound.play().then(() => {
        setAudioUnlocked(true);
      }).catch(() => {});
    }}
    className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg mb-4"
  >
    Enable Sounds & Vibration 🔊
  </button>
)}
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-600">Week Progress</span>
          <span className="text-sm text-gray-700">{completedCount}/{plan.length}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-2 bg-green-500" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {completion?.weekId || getISOWeekId()} • Patience • Perseverance • Progress
        </p>
      </div>
      {showSuccess && (
  <div className="mb-4 p-3 bg-green-500 text-white text-center rounded-md font-semibold">
    I'm proud of the way you finished. ✅
  </div>
)}
      {/* Day list */}
      <ul className="space-y-3">
        {plan.map((day, index) => {
          const dayKey = `day-${index + 1}`;
          const isDone = completion?.byDay?.[dayKey] || false;
          return (
            <li
              key={index}
              className={`p-4 rounded-lg flex justify-between items-center ${
                isDone ? "bg-green-50 border border-green-200" : "bg-gray-100"
              }`}
            >
              <span className="text-gray-800">
                {day.title} {isDone ? "✅" : ""}
              </span>
              <button
                onClick={() => openDay(day.focus, index)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                disabled={loadingDay === day.focus}
              >
                {loadingDay === day.focus ? "Loading..." : isDone ? "View / Edit" : "View"}
              </button>
            </li>
          );
        })}
      </ul>

      {/* View Workout Modal */}
{selectedDay && selectedDayIndex !== null && (
  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl z-20">
   <div
  className="bg-white text-gray-800 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[75vh] overflow-y-auto"
  onTouchStart={unlockMedia}
  onMouseDown={unlockMedia}
>
      <h3 className="text-lg font-bold text-gray-800 mb-3">Workout Details</h3>

            {/* Coaching message */}
            <p className="text-sm text-gray-700 mb-4 italic">
              {(() => {
                const list = exercises;
                if (!list || list.length === 0) {
                  return "You showed up and that matters. Start with one big lift. I will lead from there.";
                }
                const primaryCount = list.filter(ex => ex.type === "compound").length;
                const dayKey = `day-${selectedDayIndex! + 1}`;
                const isDone = completion?.byDay?.[dayKey] || false;
                if (isDone) return "Locked in. You showed up and finished. I respect that win.";
                if (primaryCount === 0) return "You are putting in work. Add one big lift and I will help you push your strength forward.";
                if (primaryCount === 1) return "Strong foundation today. Lead with that primary lift. I have your back.";
                return "Strength first. You are leading with power moves. Keep it up.";
              })()}
            </p>

            {/* Exercise list with sets */}
            <ul className="space-y-4 mb-4">
              {exercises.map((ex, i) => {
                const focus = selectedDay!;
                const totalSets = volume.sets;
                const current = workouts[focus]?.[i];

                // Ensure sets exist
                const sets: WorkoutSet[] =
                  current?.sets && Array.isArray(current.sets)
                    ? current.sets
                    : Array.from({ length: totalSets }, () => ({ reps: null, score: null, completed: false }));

                    return (
                        <li key={i} className="border-b border-gray-200 pb-3">
                         <div className="flex justify-between items-start mb-2">
  <div>
    <div className="font-semibold">{ex.name}</div>
    <div className="text-xs text-gray-500">
      {volume.sets} × {volume.reps} • {ex.pattern} • {ex.equipment}
    </div>
  </div>

  {/* Action buttons: Move Up / Move Down / Swap / Delete */}
  <div className="flex items-center gap-1">
    {/* Move Up */}
    <button
      className="text-xs text-gray-600 hover:text-gray-900 px-1"
      onClick={() => moveExercise(focus, i, "up")}
      title="Move Up"
    >
      ▲
    </button>

    {/* Move Down */}
    <button
      className="text-xs text-gray-600 hover:text-gray-900 px-1"
      onClick={() => moveExercise(focus, i, "down")}
      title="Move Down"
    >
      ▼
    </button>

    {/* Swap */}
    <button
      onClick={() => {
        setSwapIndex(i);
        setSwapOptions(exerciseLibrary[selectedDay] || []);
        setShowSwapModal(true);
      }}
      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
    >
      Swap
    </button>

   {/* Delete */}
<button
  className="text-xs text-red-600 hover:text-red-800 px-1 font-semibold"
  onClick={async () => {
    if (!confirm(`Remove ${ex.name}?`)) return;

    const updated = [...(workouts[focus] || [])];
    updated.splice(i, 1);

    const sorted = sortExercises(updated);
    setWorkouts(prev => ({ ...prev, [focus]: sorted }));

    const email = getEmail();
    if (email) {
      const { db } = await import("../firebase/config");
      const { doc, setDoc } = await import("firebase/firestore");
      const ref = doc(db, "users", email, "workouts", focus);
      await setDoc(ref, { type: focus, exercises: sorted }, { merge: true });
    }
  }}
  title="Remove Exercise"
>
  ❌
</button>
  </div>
</div>
                          {/* Set rows */}
                          <div className="space-y-2">
                      {sets.map((set, sIdx) => {
                        // Set 1 editable; later sets unlock after previous completed
                        const previousDone = sets.slice(0, sIdx).every(s => s.completed);
                        return (
                            <div key={sIdx} className="flex items-center gap-2">
                            <span className="text-xs w-10">Set {sIdx + 1}</span>
                          
                            <input
                              type="number"
                              min={0}
                              className="w-16 border border-gray-300 rounded p-1 text-xs text-gray-800"
                              value={set.reps ?? ""}
                              disabled={!previousDone}
                              onChange={(e) => {
                                const reps = e.target.value === "" ? null : Number(e.target.value);
                                const updated = [...sets];
                                updated[sIdx] = { ...updated[sIdx], reps };
                                updateWorkoutSet(focus, i, updated);
                              }}
                            />
                          
                            {/* Score button */}
                            <button
                              disabled={!previousDone || set.reps === null}
                              onClick={() => {
                                const updated = [...sets];
                                const wasCompleted = set.completed;
                              
                                if (wasCompleted) {
                                  updated[sIdx] = { reps: set.reps, completed: false, score: null };
                                  setActiveTimer(null);
                                } else {
                                  updated[sIdx] = { reps: set.reps, completed: true, score: 2 };
                              
                                  const now = Date.now();
                                  const restMs = parseInt(volume.rest) * 1000;
                                  setActiveTimer({ exerciseIdx: i, setIdx: sIdx, endsAt: now + restMs });
                              
                                  if (audioUnlocked) {
                                    playRestSound();
                                    vibratePhone();
                                  }
                                }
                              
                                updateWorkoutSet(focus, i, updated);
                              }}
                              onDoubleClick={() => {
                                const updated = [...sets];
                                updated[sIdx] = { reps: set.reps, completed: true, score: 3 };
                                updateWorkoutSet(focus, i, updated);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                const updated = [...sets];
                                updated[sIdx] = { reps: set.reps, completed: false, score: null };
                                setActiveTimer(null);
                                updateWorkoutSet(focus, i, updated);
                              }}
                              className={`text-xs px-2 py-1 rounded font-semibold transition ${
                                set.score === 3
                                  ? "bg-[#00AEEF] text-white"
                                  : set.score === 2
                                  ? "bg-green-600 text-white"
                                  : "bg-gray-200 text-gray-400"
                              }`}
                              title="Tap=Good, Double=Crushed, Long-press=Undo"
                            >
                              {set.score === 3 ? "🔥" : set.score === 2 ? "✅" : "…"}
                            </button>
                          
                            {/* Visible Undo if completed */}
                            {set.completed && (
                              <button
                                className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600"
                                onClick={() => {
                                  const updated = [...sets];
                                  updated[sIdx] = { reps: set.reps, score: null, completed: false };
                                  updateWorkoutSet(focus, i, updated);
                                }}
                              >
                                Undo
                              </button>
                            )}
                          
                            {/* Rest Timer */}
                            {activeTimer &&
  activeTimer.exerciseIdx === i &&
  activeTimer.setIdx === sIdx &&
  (() => {
    const remaining = Math.max(0, Math.ceil((activeTimer.endsAt - Date.now()) / 1000));

    // Play alert once when timer completes
    if (remaining === 0 && audioUnlocked) {
      playRestSound();
      vibratePhone();
    }

    return (
      <span className="text-xs ml-2 font-semibold text-blue-600">
        {remaining > 0 ? `Rest: ${remaining}s` : "Rest finished"}
        {remaining === 0 && (
          <span className="ml-1 text-green-600">Ready ✅</span>
        )}
      </span>
    );
  })()}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Toggle day complete */}
{/* Manual Day Complete / Override */}
<button
  onClick={() => {
    if (selectedDayIndex === null || !selectedDay) return;

    const dayKey = `day-${selectedDayIndex + 1}`;

    // ✅ Mark complete in UI
    setCompleted(selectedDay, selectedDayIndex, true);

    // ✅ Show banner
    setCompleteMessage("You finished strong. I am proud of the way you closed.");
    setShowSuccess(true);

    // ✅ Auto-hide after 3 seconds
    setTimeout(() => setShowSuccess(false), 3000);

    // ✅ Close modal
    setSelectedDay(null);
    setSwapIndex(null);
    setShowSwapModal(false);
  }}
  className="w-full py-2 rounded-lg font-semibold mb-2 bg-indigo-600 hover:bg-indigo-700 text-white"
>
  Mark Complete ✅
</button>

<button
  onClick={() => {
    setSelectedDay(null);
    setSwapIndex(null);
    setShowSwapModal(false);
  }}
  className="w-full mt-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold"
>
  Close
</button>
          </div>
        </div>
      )}

      {/* Swap Modal */}
      {showSwapModal && selectedDay && swapIndex !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 rounded-2xl z-30">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Swap Exercise</h3>

            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {swapOptions.map((option, idx) => (
                <li
                  key={idx}
                  className="p-2 border border-gray-200 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-100"
                  onClick={() => commitSwap(option)}
                >
                  <div>
                    <div className="font-medium">{option.name}</div>
                    <div className="text-xs text-gray-500">
                      {option.pattern} • {option.equipment} • {option.difficulty}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 mt-4">
              <button
                onClick={() => {
                  setShowSwapModal(false);
                  setShowAddExerciseModal(true);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold"
              >
                + Add New Exercise
              </button>

              <button
                className="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold"
                onClick={() => setShowSwapModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Exercise Modal */}
      {showAddExerciseModal && selectedDay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 rounded-2xl z-40">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Add Exercise</h3>

            <input
              type="text"
              placeholder="Exercise name"
              className="w-full border border-gray-300 rounded-lg p-2 mb-3"
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
            />

            <p className="text-xs text-gray-500 mb-4">
              More options coming soon
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  if (!newExerciseName.trim() || !selectedDay) return;

                 // Default with fallback to accessories so we do not break sort rules
const newEx: Exercise = {
    name: newExerciseName.trim(),
    muscles: [],
    type: "accessory",
    pattern: "Accessory",
    equipment: "Bodyweight",
    difficulty: experience === "beginner" ? "Beginner" : "Intermediate",
    sets: Array.from({ length: volume.sets }, () =>
      ({ reps: null, completed: false, score: null })
    ),
  };
  
  const updated = sortExercises([...(workouts[selectedDay] || []), newEx]);
  setWorkouts(prev => ({ ...prev, [selectedDay]: updated }));
  setNewExerciseName("");

                  const email = getEmail();
                  if (email) {
                    const { db } = await import("../firebase/config");
                    const { doc, setDoc } = await import("firebase/firestore");
                    const ref = doc(db, "users", email, "workouts", selectedDay);
                    await setDoc(ref, { type: selectedDay, exercises: updated }, { merge: true });
                  }

                  setShowAddExerciseModal(false);
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold"
              >
                Add to Workout ✅
              </button>

              <button
                onClick={() => setShowAddExerciseModal(false)}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}