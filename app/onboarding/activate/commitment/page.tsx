"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { getLocalDate } from "@/app/utils/date";
import { motion } from "framer-motion";

export default function CommitmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCommit = async () => {
    setLoading(true);
  
    try {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }
  
      const today = getLocalDate();
      
      // Calculate end date (6 days from now = 7-day commitment)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 6);
  
      // Get movement commitment from plan
      const planDoc = await getDoc(doc(db, "users", email, "profile", "plan"));
      const movementMinutes = planDoc.exists() 
        ? (planDoc.data().movementCommitment || 10)
        : 10;
  
      // Create 7-day commitment
      await setDoc(doc(db, "users", email, "momentum", "commitment"), {
        startDate: today,
        endDate: endDate.toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
        status: "active",
        daysCompleted: 1, // First check-in counts
        targetDays: 7,
        // NEW FIELDS for dashboard display:
        habitOffered: `Move ${movementMinutes} minutes daily`,
        habitKey: `movement_${movementMinutes}min`,
        accepted: true,
        isActive: true,
      });
  
      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      console.error("Error creating commitment:", err);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-6xl mb-6"
        >
          🤝
        </motion.div>

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold text-white mb-4"
        >
          One more thing
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-white/70 mb-10"
        >
          Let's make this official.
        </motion.p>

       {/* The ask */}
       <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-8 mb-8"
        >
          <h2 className="text-2xl font-bold text-white mb-4 text-center">
            Commit to 7 days
          </h2>

          <p className="text-white/80 mb-6 text-center">
            Check in daily for the next week. That's it.
          </p>

          <div className="space-y-3 max-w-xs mx-auto">
            <div className="flex items-start gap-3">
              <span className="text-amber-300 flex-shrink-0 text-xl">✓</span>
              <span className="text-white/80">
                Just 60 seconds a day
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-300 flex-shrink-0 text-xl">✓</span>
              <span className="text-white/80">
                Build your first streak
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-300 flex-shrink-0 text-xl">✓</span>
              <span className="text-white/80">
                Earn your first reward
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mb-6"
        >
          <p className="text-white/60 text-sm mb-6">
            Small commitments create big momentum.
          </p>

          <button
            onClick={handleCommit}
            disabled={loading}
            className="w-full max-w-xs mx-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30"
          >
            {loading ? "Setting up..." : "I'm in for 7 days"}
          </button>
        </motion.div>

        <p className="text-white/40 text-xs">
          You can always adjust this later
        </p>
      </motion.div>
    </main>
  );
}