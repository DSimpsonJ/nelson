"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion } from "framer-motion";

const options = [
  { 
    value: "morning", 
    label: "Morning",
    icon: "🌅"
  },
  { 
    value: "afternoon", 
    label: "Afternoon",
    icon: "☀️"
  },
  { 
    value: "evening", 
    label: "Evening",
    icon: "🌙"
  },
];

export default function CheckinTimePage() {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const email = getEmail();
    if (!email) router.replace("/");
  }, [router]);

  const handleSelect = async (value: string) => {
    setSelected(value);
    setLoading(true);

    try {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      await updateDoc(doc(db, "users", email), {
        preferredCheckinTime: value,
        onboardingStep: "setup",
      });

      // Bucket 2 complete, move to Bucket 3 (Setup)
      router.push("/onboarding/setup/notifications");
    } catch (err) {
      console.error("Error saving checkin time:", err);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-lg"
      >

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-3">
            What time of day are you typically available to check in?
          </h1>
          <p className="text-white/60">
            I recommend mornings, but you can always change this later.
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="space-y-3">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                disabled={loading}
                className={`w-full text-left p-5 rounded-xl border transition-all duration-200 flex items-center gap-4 ${
                  selected === option.value
                    ? "bg-blue-600 border-blue-500"
                    : "bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30"
                } disabled:opacity-50`}
              >
                <span className="text-2xl">{option.icon}</span>
                <span className="text-lg font-medium text-white">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </main>
  );
}