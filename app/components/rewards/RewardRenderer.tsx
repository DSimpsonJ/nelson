"use client";

import { useEffect, useRef } from "react";
import { RewardPayload } from "@/app/services/rewardEngine";
import HeroCard from "./HeroCard";
import Confetti from "./Confetti";
import Fireworks from "./Fireworks";
import RingPulse from "./RingPulse";
import Burst from "./Burst";
import { motion } from "framer-motion";

export default function RewardRenderer({ 
  reward, 
  onComplete 
}: { 
  reward: RewardPayload | null;
  onComplete?: () => void;
}) {
  const completedRef = useRef<string | null>(null);
  const rewardKey = reward?.text ?? null;
  
  // Guard: only call onComplete once per reward identity
  const handleComplete = () => {
    if (!rewardKey) return;
    if (completedRef.current === rewardKey) return;
    completedRef.current = rewardKey;
    onComplete?.();
  };
  
  // Early exit if no reward
  if (!reward || reward.animation === "none") return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {reward.animation === "pulse" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-24 left-1/2 transform -translate-x-1/2 pointer-events-auto z-50"
        >
          <div className="bg-white border-2 border-blue-500 px-6 py-3 rounded-xl shadow-lg">
            <p className="text-sm font-medium text-gray-800">{reward.text}</p>
          </div>
        </motion.div>
      )}
      
      {reward.animation === "ring" && <RingPulse text={reward.text} />}
      
      {reward.animation === "confetti" && (
        <Confetti 
          intensity={reward.intensity} 
          text={reward.text}
          onComplete={handleComplete}
        />
      )}
      
      {reward.animation === "burst" && (
        <Burst 
          intensity={reward.intensity} 
          text={reward.text}
          onComplete={handleComplete}
        />
      )}
      
      {reward.animation === "fireworks" && (
        <Fireworks 
          intensity={reward.intensity} 
          text={reward.text}
          onComplete={handleComplete}
        />
      )}
      
      {reward.animation === "hero" && (
        <HeroCard 
          text={reward.text} 
          shareable={reward.shareable} 
          onClose={handleComplete}
        />
      )}
    </div>
  );
}