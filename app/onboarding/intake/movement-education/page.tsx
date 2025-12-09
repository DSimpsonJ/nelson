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
          Movement Is Your Foundation
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-6 mb-8"
        >
          <p className="text-white/90 text-lg leading-relaxed">
            To build momentum, you need one habit you can rely on every day: a small dose of intentional movement. Any form of dedicated exercise you choose is foundational to longevity and good health, even if it's just five minutes.
          </p>

          <div className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6">
            <p className="text-white/80 mb-4">That might mean:</p>
            <ul className="space-y-2 text-white/70">
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>A short walk outside</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>A quick mobility routine</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>Cycling indoors or outdoors</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-300 flex-shrink-0">•</span>
                <span>Or a full-out resistance training gym session</span>
              </li>
            </ul>
          </div>

          <p className="text-white/90 text-lg leading-relaxed">
            This is how we transform "I should exercise more" into{" "}
            <span className="text-amber-300 font-semibold">
              "I'm the kind of person who moves every day."
            </span>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-blue-600/30 rounded-xl p-6 mb-8"
        >
          <p className="text-white/90 text-center">
            Next, you'll choose the amount of movement you can commit to{" "}
            <span className="text-blue-400 font-semibold">every single day</span>
            , your personal non-negotiable.
          </p>
          <p className="text-white/70 text-sm text-center mt-3">
            Pick what you can do on your worst day, not your best.
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