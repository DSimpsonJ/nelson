"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function MovementEducationPage() {
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
          className="text-3xl font-bold text-white mb-6 text-center"
        >
          Movement is the Commitment
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-6 mb-8"
        >
          <p className="text-white/90 text-lg leading-relaxed">
            To build momentum, you need one action that can be repeated daily with minimal friction. Movement fills that role.
          </p>

          <p className="text-white/90 text-lg leading-relaxed">
            The type is irrelevant. What matters is that it happens.
          </p>

          <div className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6">
            <p className="text-white/80 mb-4">Examples:</p>
            <ul className="space-y-2 text-white/70">
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>A short walk</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>Cycling, indoors or out</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>Calisthenics</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>Weight training or any intentional exercise</span>
              </li>
            </ul>
          </div>

          <p className="text-white/90 text-lg leading-relaxed">
            Next, you'll choose the minimum amount of exercise you're willing to commit to each day.
          </p>

          <p className="text-amber-300 text-lg leading-relaxed font-semibold">
            This isn't a goal. It's the floor.
          </p>

          <p className="text-white/90 text-lg leading-relaxed">
            Other bonus movement is reported during your daily check-in. It's counted, but it doesn't replace your commitment.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-blue-600/30 rounded-xl p-6 mb-8"
        >
          <p className="text-white/90 text-center">
            You decide the minimum. Pick what you can do on your worst day, not your best.
          </p>
        </motion.div>

        <div className="flex justify-center">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            onClick={() => router.push("/onboarding/setup/movement-commitment")}
            className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
          >
            Continue
          </motion.button>
        </div>
      </motion.div>
    </main>
  );
}