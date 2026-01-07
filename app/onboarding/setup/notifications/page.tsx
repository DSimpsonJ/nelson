"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function NotificationsPage() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);

  const handleContinue = () => {
    // TODO: Save notification preference
    router.push("/onboarding/setup/identity");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-10"
        >
          <div className="text-6xl mb-6">🔔</div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Daily Reminder
          </h1>
          <p className="text-white/70">
          This helps you remember to check in.
          </p>
        </motion.div>

        {/* Toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 mb-10"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold mb-1">Enable notifications</h3>
              <p className="text-white/60 text-sm">You can change this anytime in settings</p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                enabled ? "bg-blue-600" : "bg-slate-600"
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                  enabled ? "translate-x-6" : ""
                }`}
              />
            </button>
          </div>
        </motion.div>

        <div className="flex justify-center">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            onClick={handleContinue}
            className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
          >
            Continue
          </motion.button>
        </div>
      </motion.div>
    </main>
  );
}