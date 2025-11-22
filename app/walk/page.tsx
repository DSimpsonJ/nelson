"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";

export default function WalkPage() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [targetMinutes, setTargetMinutes] = useState(10);
  const [habitName, setHabitName] = useState("Walk");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load user's target from currentFocus
    const loadTarget = async () => {
      const email = getEmail();
      if (!email) return;

      const focusRef = doc(db, "users", email, "momentum", "currentFocus");
      const snap = await getDoc(focusRef);
      
      if (snap.exists()) {
        const data = snap.data();
        setHabitName(data.habit || "Walk");
        
        const match = data.habitKey?.match(/(\d+)min/);
        if (match) {
          setTargetMinutes(parseInt(match[1], 10));
        }
      }
    };

    loadTarget();
  }, []);

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isPaused]);

  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  const handleStop = () => {
    setIsRunning(false);
    setIsPaused(false);
  };

  const handleSave = async () => {
    if (seconds === 0) return;

    setSaving(true);
    try {
      const email = getEmail();
      if (!email) throw new Error("No user email found");

      const today = new Date().toISOString().split("T")[0];
      const sessionId = `walk_${Date.now()}`;

      await setDoc(doc(db, "users", email, "sessions", sessionId), {
        id: sessionId,
        date: today,
        type: "walk",
        activityName: habitName,
        durationSec: seconds,
        durationMin: Math.round(seconds / 60),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to save walk session:", err);
      alert("Failed to save session. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const minutes = Math.floor(seconds / 60);
  const targetReached = minutes >= targetMinutes;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:text-blue-700 mb-6 flex items-center gap-2"
        >
          ← Back
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{habitName}</h1>
            <p className="text-sm text-gray-600">
              Goal: {targetMinutes} minutes
            </p>
            {targetReached && (
              <div className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold mt-2">
                ✓ Goal Reached!
              </div>
            )}
          </div>

          <div className="text-center mb-8">
            <div className={`text-7xl font-bold transition-colors ${
              targetReached ? "text-green-600" : "text-gray-900"
            }`}>
              {formatTime(seconds)}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              {minutes} {minutes === 1 ? "minute" : "minutes"}
            </p>
          </div>

          <div className="space-y-3">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-4 text-lg transition"
              >
                Start Timer
              </button>
            ) : (
              <div className="flex gap-3">
                {isPaused ? (
                  <button
                    onClick={handleResume}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg py-4 transition"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg py-4 transition"
                  >
                    Pause
                  </button>
                )}
                
                <button
                  onClick={handleStop}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg py-4 transition"
                >
                  Stop
                </button>
              </div>
            )}

            {!isRunning && seconds > 0 && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg py-4 text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save & Finish"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}