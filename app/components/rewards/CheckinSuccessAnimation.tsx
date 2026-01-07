"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function CheckinSuccessAnimation({ onComplete }: { onComplete: () => void }) {
  const [showParticles, setShowParticles] = useState(false);

  useEffect(() => {
    setShowParticles(true);
  }, []);

  // Generate random particles
  const particles = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100 - 50,
    y: Math.random() * -60 - 20,
    delay: Math.random() * 0.3,
    duration: 1.5 + Math.random() * 0.5,
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
     className="relative rounded-2xl p-12 flex flex-col items-center justify-center min-h-[400px] overflow-hidden"
    >
      {/* Particles */}
      {showParticles && particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{ 
            x: 0, 
            y: 0, 
            opacity: 0,
            scale: 0 
          }}
          animate={{ 
            x: particle.x, 
            y: particle.y, 
            opacity: [0, 1, 0],
            scale: [0, 1, 0.5]
          }}
          transition={{ 
            duration: particle.duration, 
            delay: particle.delay,
            ease: "easeOut"
          }}
          className="absolute w-3 h-3 rounded-full bg-blue-500"
          style={{ 
            left: '50%', 
            top: '50%',
          }}
        />
      ))}

      {/* Checkmark Circle */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 200, 
          damping: 15,
          delay: 0.1
        }}
        className="relative w-32 h-32 rounded-full bg-green-500 flex items-center justify-center mb-6 shadow-2xl"
      >
        {/* Checkmark SVG */}
        <motion.svg
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
        >
          <motion.path
            d="M16 32L28 44L48 20"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.div>

      {/* Success Text */}
      <motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.4, duration: 0.5 }}
  className="text-center"
>
<h3 className="text-3xl font-bold text-white mb-4">
  Check-in complete!
</h3>
<p className="text-white/80 text-md mb-8">
  Momentum has been updated.
</p>
  
  <motion.button
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: 0.8, duration: 0.3 }}
    onClick={onComplete}
    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
  >
    Continue
  </motion.button>
</motion.div>

      {/* Pulse rings */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ 
          scale: [0.8, 1.2, 1.4], 
          opacity: [0.6, 0.3, 0] 
        }}
        transition={{ 
          duration: 1.5, 
          repeat: Infinity,
          repeatDelay: 0.5
        }}
        className="absolute w-40 h-40 rounded-full border-4 border-green-500"
        style={{ 
          left: '50%', 
          top: '35%',
          transform: 'translate(-50%, -50%)'
        }}
      />
    </motion.div>
  );
}