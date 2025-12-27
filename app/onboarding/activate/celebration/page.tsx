"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function CelebrationPage() {
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Auto-advance after 3 seconds
    const timer = setTimeout(() => {
      router.push("/onboarding/activate/commitment");
    }, 7000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent pointer-events-none" />

      {/* Confetti effect (simple version with emojis) */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-4xl"
              initial={{
                top: "-10%",
                left: `${Math.random() * 100}%`,
                rotate: 0,
              }}
              animate={{
                top: "110%",
                rotate: 360,
              }}
              transition={{
                duration: 3 + Math.random() * 3,
                delay: Math.random() * 2,
                ease: "linear",
              }}
            >
              {["🎉", "✨", "🔥", "⭐"][Math.floor(Math.random() * 4)]}
            </motion.div>
          ))}
        </div>
      )}

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: "spring" }}
        className="relative z-10 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 1] }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-8xl mb-6"
        >
          🎉
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-4xl font-bold text-white mb-4"
        >
          Great!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-xl text-white/80 mb-8"
        >
          You just completed your first check-in.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 max-w-md mx-auto"
        >
          <p className="text-white/90">
            That's how easy it is. Do this daily, and you'll build{" "}
            <span className="text-amber-300 font-semibold">unstoppable momentum</span>.
          </p>
        </motion.div>
      </motion.div>
    </main>
  );
}