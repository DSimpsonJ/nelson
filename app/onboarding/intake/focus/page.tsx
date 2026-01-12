"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion } from "framer-motion";
import IntakeProgress from "@/app/components/onboarding/IntakeProgress";

const options = [
  { value: "consistency", label: "Build consistency" },
  { value: "stronger_leaner", label: "Feel stronger and leaner" },
  { value: "energy", label: "Have more daily energy" },
  { value: "control", label: "Get back in control" },
  { value: "long_term_health", label: "Improve my long-term health" },
];

export default function FocusPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("there");
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", email));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.firstName) {
            setFirstName(data.firstName);
          }
        }
      } catch (err) {
        console.error("Error loading user:", err);
      }
    };

    loadUser();
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
        primaryFocus: value,
        onboardingStep: "checkin-time",
      });

      router.push("/onboarding/intake/complete");
    } catch (err) {
      console.error("Error saving focus:", err);
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
        <IntakeProgress current={5} total={6} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-3">
            What brought you here?
          </h1>
          <p className="text-white/60">
            Pick the one that resonates the most right now.
          </p> 
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="space-y-3">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                disabled={loading}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                  selected === option.value
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/30"
                } disabled:opacity-50`}
              >
                <span className="text-lg font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </main>
  );
}