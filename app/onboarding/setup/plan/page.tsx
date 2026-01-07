"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion } from "framer-motion";

export default function PlanPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [plan, setPlan] = useState({
    proteinMin: 0,
    proteinMax: 0,
    hydrationMin: 0,
    hydrationMax: 0,
    movement: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlan = async () => {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", email));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setFirstName(data.firstName || "");
          
         // Get plan from profile or calculate from intake data
         const profileDoc = await getDoc(doc(db, "users", email, "profile", "plan"));
          
         // Always get weight from user doc and calculate protein/hydration
         const weight = data.weight || 170;
const cappedWeight = Math.min(weight, 240); // Cap at 240 lbs lean mass
const proteinMin = Math.round(cappedWeight * 0.6);
const proteinMax = Math.round(cappedWeight * 1.0);
const hydrationMin = 64;
const hydrationMax = 100;
         
         // Get movement from profile if exists, otherwise from user doc
         const movement = profileDoc.exists() 
           ? (profileDoc.data().movementCommitment || data.movementCommitment || 10)
           : (data.movementCommitment || 10);
         
           setPlan({
            proteinMin,
            proteinMax,
            hydrationMin,
            hydrationMax,
            movement,
          });
          }
        setLoading(false);
      } catch (err) {
        console.error("Error loading plan:", err);
        setLoading(false);
      }
    };

    loadPlan();
  }, [router]);

  const handleContinue = () => {
    router.push("/onboarding/setup/how-it-works");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg text-center"
      >
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold text-white mb-3"
        >
          Alright {firstName}. Here's the plan.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/70 mb-10"
        >
          This is what will be tracked each day:
        </motion.p>

        {/* Plan cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-4 mb-10"
        >
          {/* Movement */}
          <div className="bg-slate-800/40 backdrop-blur-sm border border-blue-600/30 rounded-xl p-6 text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold mb-1">Movement</h3>
                <p className="text-white/60 text-sm">Minimum exercise commitment</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-amber-300">{plan.movement}</div>
                <div className="text-white/60 text-sm">minutes</div>
              </div>
            </div>
          </div>

          {/* Protein */}
          <div className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold mb-1">Protein</h3>
                <p className="text-white/60 text-sm">Target intake range based on body weight</p>
              </div>
              <div className="text-right">
              <div className="text-3xl font-bold text-amber-300">{plan.proteinMin}-{plan.proteinMax}g</div>
                <div className="text-white/60 text-sm">per day</div>
              </div>
            </div>
          </div>

          {/* Hydration */}
          <div className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold mb-1">Hydration</h3>
                <p className="text-white/60 text-sm">Fluid intake range</p>
              </div>
              <div className="text-right">
              <div className="text-3xl font-bold text-amber-300">{plan.hydrationMin}-{plan.hydrationMax}</div>
                <div className="text-white/60 text-sm">oz</div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-white/60 text-sm mb-8"
        >
          Plus 4 more focus areas tracked during check-in.
        </motion.p>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          onClick={handleContinue}
          className="w-full max-w-xs mx-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
        >
          Continue
        </motion.button>
      </motion.div>
    </main>
  );
}