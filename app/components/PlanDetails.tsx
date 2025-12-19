/**
 * PLAN DETAILS CARD
 * 
 * Collapsible card showing user's daily targets:
 * - Protein range (based on weight)
 * - Hydration target
 * - Movement commitment
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PlanDetailsProps {
  proteinMin: number;
  proteinMax: number;
  hydrationMin: number;
  hydrationMax: number;
  movementMinutes: number;
}

export default function PlanDetails({
  proteinMin,
  proteinMax,
  hydrationMin,
  hydrationMax,
  movementMinutes,
}: PlanDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌟</span>
          <h3 className="text-base font-semibold text-white">Daily Ranges</h3>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/60"
        >
          ▼
        </motion.div>
      </button>

      {/* Collapsible Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 space-y-3 border-t border-slate-700/30 pt-4">
              {/* Protein */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🥩</span>
                  <span className="text-sm text-white/80">Protein</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {proteinMin}-{proteinMax}g
                </span>
              </div>

              {/* Hydration */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💧</span>
                  <span className="text-sm text-white/80">Hydration</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {hydrationMin}-{hydrationMax}oz
                </span>
              </div>

              {/* Movement */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚶</span>
                  <span className="text-sm text-white/80">Movement</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {movementMinutes} min daily
                </span>
              </div>

              {/* Note */}
              <p className="text-xs text-white/50 italic mt-3 pt-3 border-t border-slate-700/30">
                These are your daily non-negotiables. Hit these and watch momentum build.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}