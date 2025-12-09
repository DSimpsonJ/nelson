"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";

export default function NamePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const email = getEmail();
    if (!email) router.replace("/");
  }, [router]);

  const handleContinue = async () => {
    if (!firstName.trim()) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }

      await updateDoc(doc(db, "users", email), {
        firstName: firstName.trim(),
        onboardingStep: "promise",
      });

      const stored = localStorage.getItem("nelsonUser");
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.firstName = firstName.trim();
        localStorage.setItem("nelsonUser", JSON.stringify(parsed));
      }

      router.push("/onboarding/promise");
    } catch (err) {
      console.error("Error saving name:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && firstName.trim()) {
      handleContinue();
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg text-center">
        <div className="mb-10">
          <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">👋</span>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4">
            Hey, I'm Nelson.
          </h1>
          <p className="text-xl text-slate-300">
            I'm glad you're here. What's your name?
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl">
          <input
            type="text"
            placeholder="Your first name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onKeyPress={handleKeyPress}
            autoFocus
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-4 text-white text-lg text-center placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />

          {error && (
            <p className="text-red-400 text-sm mt-3">
              {error}
            </p>
          )}

          <button
            onClick={handleContinue}
            disabled={loading || !firstName.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg mt-6 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </main>
  );
}