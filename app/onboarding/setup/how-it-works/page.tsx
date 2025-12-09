"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function HowItWorksPage() {
  const router = useRouter();

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
          How Nelson works
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/70 mb-10 text-center"
        >
          Simple daily check-ins. No overthinking.
        </motion.p>

        {/* Steps */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-6 mb-10"
        >
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-600/20 border-2 border-blue-600/50 rounded-full flex items-center justify-center text-white font-bold">
              1
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Check in once daily</h3>
              <p className="text-white/70 text-sm">
                Rate 7 areas of your day. Takes 60 seconds.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-600/20 border-2 border-blue-600/50 rounded-full flex items-center justify-center text-white font-bold">
              2
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Build momentum</h3>
              <p className="text-white/70 text-sm">
                Consistency creates a streak. Streaks earn rewards.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-amber-500/20 border-2 border-amber-500/50 rounded-full flex items-center justify-center text-white font-bold">
              3
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Level up your habits</h3>
              <p className="text-white/70 text-sm">
                When ready, increase your movement time. Small steps, big gains.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Key principle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 mb-8"
        >
          <p className="text-white text-center">
            The goal isn't perfection. It's <span className="text-amber-300 font-semibold">showing up every day</span>.
          </p>
        </motion.div>

        <div className="flex justify-center">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            onClick={() => router.push("/onboarding/setup/checkin-time")}
            className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
          >
            Continue
          </motion.button>
        </div>
      </motion.div>
    </main>
  );
}