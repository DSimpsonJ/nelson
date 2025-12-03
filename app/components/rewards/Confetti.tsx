"use client";

import { useEffect, useCallback } from "react";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";

export default function Confetti({ 
  intensity, 
  text,
  onComplete 
}: { 
  intensity: string; 
  text: string;
  onComplete?: () => void;
}) {
  const fireConfetti = useCallback(() => {
    const count = intensity === "large" ? 200 : intensity === "medium" ? 100 : 50;
    const spread = intensity === "large" ? 100 : intensity === "medium" ? 70 : 50;

    confetti({
      particleCount: count,
      spread: spread,
      origin: { y: 0.6 },
      colors: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'],
      disableForReducedMotion: true,
    });

    // Fire a second burst slightly offset
    setTimeout(() => {
      confetti({
        particleCount: count / 2,
        spread: spread - 20,
        origin: { y: 0.5 },
        colors: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'],
        disableForReducedMotion: true,
      });
    }, 200);
  }, [intensity]);

  // Fire confetti on mount
  useEffect(() => {
    fireConfetti();
  }, [fireConfetti]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 50 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -50 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none"
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md pointer-events-auto relative">
        {/* Replay button */}
        <button
          onClick={fireConfetti}
          className="absolute top-4 right-4 text-gray-400 hover:text-blue-600 transition-colors"
          title="Replay"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-2xl font-bold text-gray-900 mb-4">{text}</h3>
        <p className="text-sm text-gray-600 mb-6">Keep going!</p>
        
        <button
          onClick={onComplete}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}