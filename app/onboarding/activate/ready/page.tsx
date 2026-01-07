"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function ReadyPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-7xl mb-8"
        >
          🚀
        </motion.div>

        <motion.h1
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.4 }}
  className="text-4xl font-bold text-white mb-4"
>
  You're ready.
</motion.h1>

<motion.p
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.5 }}
  className="text-xl text-white/80 mb-12"
>
  Let's do your first check-in.
</motion.p>

<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.6 }}
  className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 mb-10 max-w-xs mx-auto"
>
  <p className="text-white/90 text-center mb-3">
    Today includes a little guidance.
  </p>
  <p className="text-white/90 text-center">
    After this, <span className="text-amber-300 font-semibold">it's quick and repeatable.</span>
  </p>
</motion.div>

<div className="flex justify-center">
  <motion.button
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.8 }}
    onClick={() => router.push("/onboarding/activate/checkin")}
    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/30"
  >
    Start First Check-In
  </motion.button>
</div>
      </motion.div>
    </main>
  );
}