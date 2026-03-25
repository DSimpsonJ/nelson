"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion, AnimatePresence } from "framer-motion";
import { CALIBRATION_QUESTIONS, DragSource } from "@/app/services/weeklyCalibrationTypes";
import {
  FOCUS_BEHAVIOR_LABELS,
  FOCUS_BEHAVIORS,
  getSuggestedFocus,
  getCurrentWeekId,
} from "@/app/utils/focusBehavior";

function getWeekDateRange(weekId: string): { start: string; end: string } {
    const [year, weekStr] = weekId.split('-W');
    const weekNum = parseInt(weekStr);
    const jan1 = new Date(parseInt(year), 0, 1);
    const jan1Day = jan1.getDay();
    const firstMonday = new Date(parseInt(year), 0, 1);
    firstMonday.setDate(1 + ((jan1Day === 0 ? -6 : 1) - jan1Day));
    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return {
      start: weekStart.toLocaleDateString("en-CA"),
      end: weekEnd.toLocaleDateString("en-CA"),
    };
  }

// Exercise commitment increments in minutes
const COMMITMENT_INCREMENTS = [5, 10, 15, 20, 30, 45, 60];
const COMMITMENT_CAP = 60;

function getAdjacentIncrements(current: number): { lower: number | null; higher: number | null } {
  const idx = COMMITMENT_INCREMENTS.indexOf(current);
  if (idx === -1) {
    // Not a standard increment -- find nearest
    const lower = [...COMMITMENT_INCREMENTS].reverse().find(v => v < current) ?? null;
    const higher = COMMITMENT_INCREMENTS.find(v => v > current && v <= COMMITMENT_CAP) ?? null;
    return { lower, higher };
  }
  return {
    lower: idx > 0 ? COMMITMENT_INCREMENTS[idx - 1] : null,
    higher: idx < COMMITMENT_INCREMENTS.length - 1 && COMMITMENT_INCREMENTS[idx + 1] <= COMMITMENT_CAP
      ? COMMITMENT_INCREMENTS[idx + 1]
      : null,
  };
}

type Step = "drag" | "focus" | "exercise";

export default function WeeklyReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patternType = searchParams.get("pattern") ?? "";
  const weekId = searchParams.get("weekId") ?? getCurrentWeekId();

  const [step, setStep] = useState<Step>("drag");
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [focusBehavior, setFocusBehavior] = useState<string | null>(null);
  const [currentTarget, setCurrentTarget] = useState<number>(30);
  const [selectedTarget, setSelectedTarget] = useState<number>(30);
  const [exerciseDaysHit, setExerciseDaysHit] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const e = getEmail();
    if (!e) { router.push("/login"); return; }
    setEmail(e);
    loadExistingData(e);
  }, []);

  const loadExistingData = async (userEmail: string) => {
    // Load current exercise target
    const focusRef = doc(db, "users", userEmail, "momentum", "currentFocus");
    const focusSnap = await getDoc(focusRef);
    if (focusSnap.exists()) {
      const target = focusSnap.data().target ?? 30;
      setCurrentTarget(target);
      setSelectedTarget(target);
    }

    // Load exercise days hit from pattern evidence (passed via searchParams)
    // Load exercise days from user's momentum docs for the current week
    const { start, end } = getWeekDateRange(weekId);
    const momentumSnap = await getDocs(
      query(
        collection(db, "users", userEmail, "momentum"),
        where("date", ">=", start),
        where("date", "<=", end),
        where("checkinType", "==", "real")
      )
    );
    const days = momentumSnap.docs.filter(d => d.data().exerciseCompleted === true).length;
    setExerciseDaysHit(days);

    // Load existing focus behavior if set this week
    const userRef = doc(db, "users", userEmail);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.focusBehaviorSetWeek === weekId && data.focusBehavior) {
        setFocusBehavior(data.focusBehavior);
      }
    }
  };

  const handleDragSelect = (value: DragSource) => {
    setDragSource(value);
    setStep("focus");
  };

  const handleFocusSelect = (key: string) => {
    setFocusBehavior(key);
    setStep("exercise");
  };

  const handleComplete = async () => {
    if (!email || saving) return;
    setSaving(true);

    try {
      // 1. Save drag source (lightweight calibration)
      if (dragSource) {
        const { getAuth } = await import("firebase/auth");
        const auth = getAuth();
        const user = auth.currentUser;
        if (user) {
          const token = await user.getIdToken();
          await fetch("/api/save-weekly-calibration", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              email,
              weekId,
              answers: {
                dragSource,
                forceLevel: "steady_push",
                structuralState: "solid",
                goalAlignment: "clear_steady",
              },
            }),
          });
        }
      }

      // 2. Save focus behavior to user doc
      if (focusBehavior) {
        const userRef = doc(db, "users", email);
        await setDoc(userRef, {
          focusBehavior,
          focusBehaviorSetWeek: weekId,
        }, { merge: true });
      }

      // 3. Update exercise commitment if changed
      if (selectedTarget !== currentTarget) {
        const focusRef = doc(db, "users", email, "momentum", "currentFocus");
        await updateDoc(focusRef, { target: selectedTarget });
      }

      router.push("/dashboard");
    } catch (err) {
      console.error("Weekly review save failed:", err);
      setSaving(false);
    }
  };

  const suggestedFocus = getSuggestedFocus(patternType);
  const { lower, higher } = getAdjacentIncrements(currentTarget);

  // Auto-suggestion for exercise commitment based on days hit
  const exerciseSuggestion =
    exerciseDaysHit <= 2 && lower !== null
      ? `You hit your commitment ${exerciseDaysHit} of 7 days. Consider dropping to ${lower} min.`
      : exerciseDaysHit >= 6 && higher !== null
      ? `You hit your commitment ${exerciseDaysHit} of 7 days. Ready to push to ${higher} min?`
      : null;

  const stepIndex = ["drag", "focus", "exercise"].indexOf(step);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4"
    >
      <div className="max-w-2xl mx-auto pt-12">

        {/* Progress dots */}
        <div className="flex gap-2 justify-center mb-12">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                i <= stepIndex ? "bg-blue-500" : "bg-slate-700"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* Step 1: Drag */}
          {step === "drag" && (
            <motion.div
              key="drag"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-white text-xl font-semibold mb-8">
                {CALIBRATION_QUESTIONS.drag.text}
              </p>
              <div className="space-y-3">
                {CALIBRATION_QUESTIONS.drag.options.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleDragSelect(option.value as DragSource)}
                    className="w-full px-6 py-4 bg-slate-800/40 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-xl text-left transition-all"
                  >
                    <span className="text-white">{option.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Focus behavior */}
          {step === "focus" && (
            <motion.div
              key="focus"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-white text-xl font-semibold mb-2">
                What's your focus this week?
              </p>
              {suggestedFocus && (
                <p className="text-white/40 text-sm mb-8">
                  Based on your coaching, {FOCUS_BEHAVIOR_LABELS[suggestedFocus]?.toLowerCase()} stands out.
                </p>
              )}
              <div className="space-y-3">
                {FOCUS_BEHAVIORS.map((key) => {
                  const isSuggested = key === suggestedFocus;
                  const isCurrent = key === focusBehavior;
                  return (
                    <button
                      key={key}
                      onClick={() => handleFocusSelect(key)}
                      className={[
                        "w-full px-6 py-4 rounded-xl text-left transition-all border",
                        isCurrent
                          ? "bg-blue-600/30 border-blue-500/60 text-white"
                          : isSuggested
                          ? "bg-slate-800/60 border-blue-500/40 text-white"
                          : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/50 text-white",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between">
                        <span>{FOCUS_BEHAVIOR_LABELS[key]}</span>
                        {isSuggested && (
                          <span className="text-xs text-blue-400/70 uppercase tracking-wider">suggested</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 3: Exercise commitment */}
          {step === "exercise" && (
            <motion.div
              key="exercise"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-white text-xl font-semibold mb-2">
                Your exercise commitment
              </p>
              <p className="text-white/40 text-sm mb-8">
                Currently set to {currentTarget} min/day.
                {exerciseSuggestion && ` ${exerciseSuggestion}`}
              </p>

              {/* Increment picker */}
              <div className="flex flex-wrap gap-2 mb-10">
                {COMMITMENT_INCREMENTS.map((val) => (
                  <button
                    key={val}
                    onClick={() => setSelectedTarget(val)}
                    className={[
                      "px-4 py-2.5 rounded-lg text-sm font-medium transition-all border",
                      selectedTarget === val
                        ? "bg-blue-600 border-blue-500 text-white"
                        : val === currentTarget
                        ? "bg-slate-700/60 border-slate-500/60 text-white/80"
                        : "bg-slate-800/40 border-slate-700/50 text-white/60 hover:bg-slate-700/40",
                    ].join(" ")}
                  >
                    {val} min
                  </button>
                ))}
              </div>

              <button
                onClick={handleComplete}
                disabled={saving}
                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
              >
                {saving ? "Saving..." : "Done"}
              </button>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Skip */}
        {!saving && (
          <div className="text-center mt-8">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-white/30 hover:text-white/50 text-sm transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

      </div>
    </motion.main>
  );
}