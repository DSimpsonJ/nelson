"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export default function Burst({ 
    intensity, 
    text,
    onComplete 
  }: { 
    intensity: string; 
    text: string;
    onComplete?: () => void;
  }) {
    const [replayKey, setReplayKey] = useState(0);
  
    const handleReplay = () => {
      setReplayKey(prev => prev + 1);
    };

  return (
    <motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
  onClick={() => {
    if (onComplete) onComplete();
  }}
>
      <motion.div
        key={replayKey}
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 50 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Replay button */}
        <button
          onClick={handleReplay}
          className="absolute top-6 right-6 text-gray-400 hover:text-blue-600 transition-colors z-10"
          title="Replay"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Decorative gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-green-50 opacity-60" />
        
        {/* Flexing bicep with pulse */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
          className="relative w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center shadow-lg"
        >
          <span className="text-5xl">💪</span>
        </motion.div>

        {/* Text content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative text-center"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            {text}
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            The past has passed, let's keep our eyes on the road ahead.
          </p>
        </motion.div>

        {/* Continue button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative"
        >
          <button
 onClick={(e) => {
    e.stopPropagation();
    if (onComplete) {
      onComplete();
    } else {
      console.error("onComplete is undefined!");
    }
  }}
  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
>
  Continue
</button>
        </motion.div>

        {/* Subtle pulse rings */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ 
            scale: [0.5, 1.5, 2], 
            opacity: [0.6, 0.3, 0] 
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity,
            repeatDelay: 0.5
          }}
          className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-4 border-blue-400 pointer-events-none"
        />
      </motion.div>
    </motion.div>
  );
}