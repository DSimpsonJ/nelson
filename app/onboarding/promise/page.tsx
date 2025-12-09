"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion } from "framer-motion";

export default function PromisePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("there");
  const [loading, setLoading] = useState(false);

  // Load first name and redirect if not logged in
  useEffect(() => {
    const loadUser = async () => {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", email));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.firstName) {
            setFirstName(data.firstName);
          }
        }
      } catch (err) {
        console.error("Error loading user:", err);
      }
    };

    loadUser();
  }, [router]);

  const handleContinue = async () => {
    setLoading(true);

    try {
      const email = getEmail();
      if (email) {
        await updateDoc(doc(db, "users", email), {
          onboardingStep: "intake",
        });
      }
      router.push("/onboarding/intake/age");
    } catch (err) {
      console.error("Error updating step:", err);
      router.push("/onboarding/intake/age");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg text-center"
      >
        {/* Personalized greeting */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-3xl font-bold text-white mb-8"
        >
          Nice to meet you, {firstName}.
        </motion.h1>

        {/* Promise card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-2xl p-8 shadow-2xl mb-8"
        >
          <p className="text-xl text-white leading-relaxed mb-6">
          I’ll keep you accountable and focused on what works: consistent action backed by real science.
          </p>
          <p className="text-xl text-white leading-relaxed">
            Forget perfection.{" "}
            <span className="text-amber-300 font-semibold">
              Just show up every day.
            </span>
          </p>
        </motion.div>

        {/* Visual loop explanation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="flex items-center justify-center gap-4 mb-10"
        >
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-blue-600/20 border-2 border-blue-600/50 rounded-full flex items-center justify-center mb-2">
              <span className="text-2xl">✓</span>
            </div>
            <span className="text-white/80 text-xs font-medium">Check In</span>
          </div>

          <div className="text-amber-500/60 text-2xl">→</div>

          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-blue-600/20 border-2 border-blue-600/50 rounded-full flex items-center justify-center mb-2">
              <span className="text-2xl">📈</span>
            </div>
            <span className="text-white/80 text-xs font-medium">Build Momentum</span>
          </div>

          <div className="text-amber-500/60 text-2xl">→</div>

          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-amber-500/20 border-2 border-amber-500/50 rounded-full flex items-center justify-center mb-2">
              <span className="text-2xl">⬆️</span>
            </div>
            <span className="text-white/80 text-xs font-medium">Level Up</span>
          </div>
        </motion.div>

        {/* Continue button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          onClick={handleContinue}
          disabled={loading}
          className="w-full max-w-xs mx-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30"
        >
          {loading ? "Loading..." : "Continue"}
        </motion.button>
      </motion.div>
    </main>
  );
}