"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion } from "framer-motion";
import IntakeProgress from "@/app/components/onboarding/IntakeProgress";

export default function WeightPage() {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const email = getEmail();
    if (!email) router.replace("/");
  }, [router]);

  const handleContinue = async () => {
    const weightNum = parseInt(weight);
    
    if (!weight || isNaN(weightNum)) {
      setError("Please enter your weight.");
      return;
    }

    if (weightNum < 50 || weightNum > 700) {
      setError("Please enter a valid weight.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      await updateDoc(doc(db, "users", email), {
        weight: weightNum,
        onboardingStep: "movement",
      });

      router.push("/onboarding/intake/focus");
    } catch (err) {
      console.error("Error saving weight:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && weight) {
      handleContinue();
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-lg"
      >
        <IntakeProgress current={3} total={6} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-3">
            What's your current weight?
          </h1>
          <p className="text-white/60">
            This helps me personalize your protein targets. I won't use it for calories or weight-loss tracking, but you can if you like.
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-4">
            <input
              type="number"
              inputMode="numeric"
              placeholder="165"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
              min={50}
              max={700}
              className="w-32 bg-white/10 border border-white/20 rounded-lg px-4 py-4 text-white text-3xl text-center placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <span className="text-white/60 text-xl">lbs</span>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm text-center mt-4"
            >
              {error}
            </motion.p>
          )}

          <button
            onClick={handleContinue}
            disabled={loading || !weight}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg mt-8 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30"
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </div>
      </motion.div>
    </main>
  );
}