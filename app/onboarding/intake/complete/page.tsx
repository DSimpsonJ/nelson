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
  Good. Let's get to work.
</motion.h1>

<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.6 }}
  className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-8 mb-10"
>
  <div className="space-y-6 text-white/90 leading-relaxed">
    <p className="text-lg">
      First, you'll set a <span className="text-amber-400 font-semibold">daily commitment</span>. This is an action you're agreeing to repeat.
    </p>

    <div className="h-px bg-white/10" />

    <p className="text-base">
      Each day, you'll check in across key areas to report what actually happened yesterday. Those inputs are important, but <span className="font-semibold">the commitment is your only promise</span>.
    </p>

    <div className="h-px bg-white/10" />

    <p className="text-base text-white/80">
      Momentum builds when your commitment and your check-in stay aligned over time.
    </p>
  </div>
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