"use client";

import { useState, useEffect, useRef } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";

type WalkTimerProps = {
  habitName: string;
  targetMinutes: number;
  onComplete: () => void;
};

export default function WalkTimer({ habitName, targetMinutes, onComplete }: WalkTimerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Timer logic
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

      // Save session to Firestore
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

      // Reset timer
      setSeconds(0);
      setIsRunning(false);
      setIsPaused(false);

      // Notify parent component
      onComplete();
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
    <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Track Your Movement</h2>
          <p className="text-sm text-gray-600 mt-1">
            Goal: {targetMinutes} minutes
          </p>
        </div>
        
        {targetReached && (
          <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
            ✓ Goal Reached!
          </div>
        )}
      </div>

      {/* Timer Display */}
      <div className="text-center mb-6">
        <div className={`text-6xl font-bold transition-colors ${
          targetReached ? "text-green-600" : "text-gray-900"
        }`}>
          {formatTime(seconds)}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {minutes} {minutes === 1 ? "minute" : "minutes"}
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {!isRunning ? (
          <button
            onClick={handleStart}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 transition"
          >
            Start Timer
          </button>
        ) : (
          <>
            {isPaused ? (
              <button
                onClick={handleResume}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg py-3 transition"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg py-3 transition"
              >
                Pause
              </button>
            )}
            
            <button
              onClick={handleStop}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg py-3 transition"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* Save Button (only shows when timer is stopped and has time recorded) */}
      {!isRunning && seconds > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg py-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Session"}
        </button>
      )}

      <p className="text-xs text-gray-500 text-center mt-4">
        This will count toward your daily momentum score
      </p>
    </div>
  );
}