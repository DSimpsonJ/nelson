"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function RewardsPage() {
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
          You'll earn rewards
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/70 mb-10 text-center"
        >
          Hit milestones, get celebrated.
        </motion.p>

        {/* Rewards list */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4 mb-10"
        >
          <div className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="text-4xl">🔥</div>
              <div>
                <h3 className="text-white font-semibold">Check-in streaks</h3>
                <p className="text-white/60 text-sm">3, 7, 14, 30, 100 days in a row</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="text-4xl">⬆️</div>
              <div>
                <h3 className="text-white font-semibold">Habit level-ups</h3>
                <p className="text-white/60 text-sm">When you increase your movement commitment</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-sm border border-green-500/30 rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="text-4xl">✨</div>
              <div>
                <h3 className="text-white font-semibold">Elite performances</h3>
                <p className="text-white/60 text-sm">Special moments when everything clicks</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 mb-8"
        >
          <p className="text-white text-center">
            Every celebration is <span className="text-amber-300 font-semibold">earned</span>, not given.
          </p>
        </motion.div>

        <div className="flex justify-center">
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          onClick={() => router.push("/onboarding/setup/connect")}
          className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
        >
          Continue
        </motion.button>
        </div>
      </motion.div>
    </main>
  );
}