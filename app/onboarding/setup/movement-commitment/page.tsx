"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion } from "framer-motion";

export default function MovementCommitmentPage() {
  const router = useRouter();
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCommit = async () => {
    if (selectedTime === null) return;
    
    setLoading(true);
    try {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      const userRef = doc(db, "users", email);

      // Write commitment data and activate system
      await setDoc(
        userRef,
        {
          hasCommitment: true,
          notStartedAt: null,  // Clear timestamp since they're committing
          commitment: {
            type: "movement",
            minutes: selectedTime,
            createdAt: new Date().toISOString()
          }
        },
        { merge: true }
      );

      // Write to profile/plan for backward compatibility
      await setDoc(
        doc(db, "users", email, "profile", "plan"),
        { movementCommitment: selectedTime },
        { merge: true }
      );

      // Write to momentum/currentFocus
      await setDoc(
        doc(db, "users", email, "momentum", "currentFocus"),
        {
          habit: `Move ${selectedTime} minutes daily`,
          habitKey: `movement_${selectedTime}min`,
          level: 1,
          target: selectedTime,
          startedAt: new Date().toLocaleDateString("en-CA"),
          lastLevelUpAt: null,
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );

      router.push("/onboarding/setup/identity");
    } catch (err) {
      console.error("Error saving movement commitment:", err);
      setLoading(false);
    }
  };

  const handleExit = async () => {
    setLoading(true);
    try {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      // Write hasCommitment=false and timestamp for first-visit detection
      await setDoc(
        doc(db, "users", email),
        { 
          hasCommitment: false,
          notStartedAt: new Date().toISOString()  // Track when they declined
        },
        { merge: true }
      );

      router.push("/not-started");
    } catch (err) {
      console.error("Error exiting commitment flow:", err);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold text-white mb-3 text-center"
        >
          Your Movement Floor
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/70 text-center mb-8"
        >
          Pick an amount you can complete on your worst days. Walking, cycling, dancing, calisthenics, resistance training — the type doesn't matter. <br></br><span className="text-amber-400 font-semibold">What matters is that it happens.</span>
        </motion.p>

        {/* Time options */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-3 mb-8"
        >
          <button
            onClick={() => setSelectedTime(5)}
            className={`w-full text-left p-6 rounded-xl border-2 transition-all ${
              selectedTime === 5
                ? "bg-blue-600/20 border-blue-600"
                : "bg-slate-800/40 border-amber-500/30 hover:border-amber-500/50"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-xl">5 minutes</span>
              {selectedTime === 5 && (
                <span className="text-blue-400 text-2xl">✓</span>
              )}
            </div>
            <p className="text-white/60 text-sm">
              A practical starting point if movement hasn't been consistent
            </p>
          </button>

          <button
            onClick={() => setSelectedTime(10)}
            className={`w-full text-left p-6 rounded-xl border-2 transition-all ${
              selectedTime === 10
                ? "bg-blue-600/20 border-blue-600"
                : "bg-slate-800/40 border-amber-500/30 hover:border-amber-500/50"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-xl">10 minutes</span>
              {selectedTime === 10 && (
                <span className="text-blue-400 text-2xl">✓</span>
              )}
            </div>
            <p className="text-white/60 text-sm">
              A steady baseline that holds up for many schedules
            </p>
          </button>

          <button
            onClick={() => setSelectedTime(15)}
            className={`w-full text-left p-6 rounded-xl border-2 transition-all ${
              selectedTime === 15
                ? "bg-blue-600/20 border-blue-600"
                : "bg-slate-800/40 border-amber-500/30 hover:border-amber-500/50"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-xl">15+ minutes</span>
              {selectedTime === 15 && (
                <span className="text-blue-400 text-2xl">✓</span>
              )}
            </div>
            <p className="text-white/60 text-sm">
              A higher baseline if you're already active
            </p>
          </button>
        </motion.div>

        {/* Not ready message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mb-8"
        >
          <p className="text-white/50 text-sm text-center mb-4">
            If you're not ready to commit yet, no judgment. Come back when you are.
          </p>
        </motion.div>

        {/* Action buttons */}
        <div className="flex justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="space-y-3 w-full max-w-xs"
          >
            <button
              onClick={handleCommit}
              disabled={selectedTime === null || loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "I will move daily"}
            </button>

            <button
              onClick={handleExit}
              disabled={loading}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-4 rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              Exit without committing
            </button>
          </motion.div>
        </div>
      </motion.div>
    </main>
  );
}