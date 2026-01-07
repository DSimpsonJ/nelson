"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function ConnectPage() {
  const router = useRouter();

  const handleConnect = () => {
    // TODO: Implement Apple Health connection
    router.push("/onboarding/activate/ready");
  };

  const handleSkip = () => {
    router.push("/onboarding/activate/ready");
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
          <div className="text-6xl mb-6">❤️</div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Connect Apple Health
          </h1>
          <p className="text-white/70">
          Optional. This automatically captures activity so you don’t have to.
          </p>
        </motion.div>

        {/* Benefits */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6 mb-10"
        >
          <ul className="space-y-3 text-white/80">
            <li className="flex items-start gap-3">
              <span className="text-green-400 flex-shrink-0">✓</span>
              <span>Auto-sync workout data</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 flex-shrink-0">✓</span>
              <span>Track daily steps</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 flex-shrink-0">✓</span>
              <span>Your data stays private and secure</span>
            </li>
          </ul>
        </motion.div>

        {/* Buttons */}
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.6 }}
  className="flex flex-col items-center gap-3"
>
  <button
    onClick={handleConnect}
    className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all duration-200"
  >
    Connect
  </button>

  <button
    onClick={handleSkip}
    className="w-full max-w-xs bg-slate-700 hover:bg-slate-600 text-white font-semibold py-4 rounded-lg transition-all duration-200"
  >
    Skip for now
  </button>
</motion.div>

        <p className="text-white/50 text-xs text-center mt-6">
          You can connect this later in settings
        </p>
      </motion.div>
    </main>
  );
}