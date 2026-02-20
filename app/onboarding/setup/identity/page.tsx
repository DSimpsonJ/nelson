"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function IdentityPage() {
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
          How you'll rate each category
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/70 mb-10 text-center"
        >
          Four simple choices. No perfection required.
        </motion.p>

        {/* Rating system */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-3 mb-8"
        >
          {/* Elite */}
          <div className="bg-gradient-to-r from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold">Elite</span>
              <span className="text-white/60 text-sm">Exceptional execution</span>
            </div>
          </div>

          {/* Solid */}
          <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold">Solid</span>
              <span className="text-white/60 text-sm">Target met</span>
            </div>
          </div>

          {/* Not Great */}
          <div className="bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold">Not Great</span>
              <span className="text-white/60 text-sm">Partial effort</span>
            </div>
          </div>

          {/* Off */}
          <div className="bg-gradient-to-r from-slate-600/20 to-slate-700/10 border border-slate-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold">Off</span>
              <span className="text-white/60 text-sm">Didn't happen</span>
            </div>
          </div>
        </motion.div>

        {/* Key message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 mb-8"
        >
          <p className="text-white text-center mb-3">
            Most consistent people average <span className="text-amber-300 font-semibold">Solid</span>.
          </p>
          <p className="text-white/70 text-sm text-center">
            Solid is success. Elite is rare by design. Off days are data, not failure.
          </p>
        </motion.div>

        <div className="flex justify-center">
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          onClick={() => router.push("/onboarding/activate/ready")}
          className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
        >
          Continue
        </motion.button>
        </div>
      </motion.div>
    </main>
  );
}