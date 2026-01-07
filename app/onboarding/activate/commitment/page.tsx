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

{/* Card 1: The ask */}
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.5 }}
  className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-8 mb-6"
>
  <h2 className="text-2xl font-bold text-white mb-4 text-center">
    Commit to 7 days
  </h2>
  <p className="text-white/80 text-center">
    Check in once a day for the next week. That's it.
  </p>
</motion.div>

{/* Card 2: The context */}
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.6 }}
  className="bg-slate-800/40 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6 mb-8"
>
<p className="text-white/80 text-center mb-2">
  This doesn't take time from your life.
</p>
<p className="text-white/80 text-center mb-4 font-semibold">
  It helps you see how you're actually living it.
</p>
  <p className="text-white/70 text-center text-sm">
    7 days is enough to move past single-day noise and start seeing patterns.
  </p>
</motion.div>

{/* Outside: Starting point + button */}
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.7 }}
  className="text-center"
>
  <p className="text-white/60 text-md mb-6">
    This is a starting point. You decide what comes next.
  </p>

  <button
    onClick={handleCommit}
    disabled={loading}
    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30"
  >
    {loading ? "Setting up..." : "I'm in for 7 days"}
  </button>
</motion.div>
      </motion.div>
    </main>
  );
}