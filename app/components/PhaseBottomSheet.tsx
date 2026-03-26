"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PHASES = [
  { name: "Initiation",    copy: "This is fragile. Every check-in is building the signal." },
  { name: "Activation",    copy: "Early patterns are forming." },
  { name: "Patterning",    copy: "You're starting to repeat this." },
  { name: "Integration",   copy: "This is getting easier to repeat." },
  { name: "Accumulation",  copy: "This is getting harder to break." },
  { name: "Consolidation", copy: "You don't have to push as hard anymore." },
  { name: "Resilience",    copy: "Off days won't knock you off track." },
  { name: "Identity",      copy: "This runs automatically now." },
] as const;

const ZONE_COPY =
  "The Zone is 11 of the last 14 days at 75% momentum or better. " +
  "No phase requirement — consistent execution gets you there.";

interface PhaseBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentPhaseIndex: number;
}

export default function PhaseBottomSheet({
  isOpen,
  onClose,
  currentPhaseIndex,
}: PhaseBottomSheetProps) {
  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-900 rounded-t-2xl px-6 pt-5 pb-10 max-h-[85vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

            {/* Current phase */}
            <p className="text-white/50 text-xs uppercase tracking-widest mb-1">Current Phase</p>
            <h2 className="text-white text-2xl font-bold mb-1">
              {PHASES[currentPhaseIndex].name}
            </h2>
            <p className="text-white/65 text-sm mb-8">
              {PHASES[currentPhaseIndex].copy}
            </p>

            {/* Phase arc */}
            <div className="flex flex-col gap-3 mb-8">
              {PHASES.map((phase, idx) => {
                const isPast    = idx < currentPhaseIndex;
                const isCurrent = idx === currentPhaseIndex;
                const isFuture  = idx > currentPhaseIndex;

                return (
                  <div
                    key={phase.name}
                    className={`flex items-start gap-3 ${isFuture ? "opacity-35" : ""}`}
                  >
                    {/* Indicator */}
                    <div
                      className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        isCurrent
                          ? "bg-orange-400"
                          : isPast
                          ? "bg-white/40"
                          : "bg-white/15"
                      }`}
                    />
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          isCurrent ? "text-white" : isPast ? "text-white/55" : "text-white/35"
                        }`}
                      >
                        {phase.name}
                        {isCurrent && (
                          <span className="ml-2 text-xs font-normal text-orange-400">
                            You are here
                          </span>
                        )}
                      </p>
                      {isCurrent && (
                        <p className="text-white/50 text-xs mt-0.5">{phase.copy}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* The Zone */}
            <div className="border border-white/10 rounded-xl p-4">
              <p className="text-white/80 text-sm font-semibold mb-1">The Zone</p>
              <p className="text-white/50 text-xs leading-relaxed">{ZONE_COPY}</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}