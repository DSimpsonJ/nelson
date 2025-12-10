"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import IntakeProgress from "@/app/components/onboarding/IntakeProgress";

export default function IntakeCompletePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      {/* Progress bar */}
      <div className="absolute top-8 left-0 right-0 px-6">
      <IntakeProgress current={6} total={6} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-6xl mb-8"
        >
          ✓
        </motion.div>

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-3xl font-bold text-white mb-6"
        >
          Perfect. I've got what I need.
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-8 mb-10"
        >
          <p className="text-white/90 text-lg leading-relaxed mb-4">
  Next, we'll build your personalized plan and set up your daily commitment. Time to become infinite-minded.
</p>

<div className="w-12 h-px bg-amber-500/30 mx-auto my-6" />

<p className="text-white/70">
  "Infinite-minded people understand that "best" is not a permanent state..."
</p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          onClick={() => router.push("/onboarding/intake/movement-education")}
          className="w-full max-w-xs mx-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
        >
          Continue
        </motion.button>
      </motion.div>
    </main>
  );
}