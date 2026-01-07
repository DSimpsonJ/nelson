"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { NelsonLogo } from "@/app/components/logos";

export default function NotStartedPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkVisitStatus();
  }, []);

  const checkVisitStatus = async () => {
    try {
      // Get user email from localStorage
      const userStr = localStorage.getItem("nelsonUser");
      if (!userStr) {
        setIsLoading(false);
        return;
      }

      const user = JSON.parse(userStr);
      const email = user.email;
      setFirstName(user.firstName || "");

      // Check notStartedAt timestamp
      const userRef = doc(db, "users", email);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        const notStartedAt = userData.notStartedAt;

        if (notStartedAt) {
          const notStartedTime = new Date(notStartedAt).getTime();
          const now = Date.now();
          const fiveMinutesInMs = 5 * 60 * 1000;

          // If less than 5 minutes, show first-visit message
          if (now - notStartedTime < fiveMinutesInMs) {
            setIsFirstVisit(true);
          }
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Error checking visit status:", error);
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("nelsonUser");
    window.location.href = "/";
  };

  // Don't render until we know which state to show
  if (isLoading) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <NelsonLogo />
        </div>

        {/* Greeting */}
        <h1 className="text-3xl font-bold text-white mb-8 text-center">
          {isFirstVisit
            ? firstName
              ? `No problem, ${firstName}.`
              : "No problem."
            : firstName
            ? `Welcome back, ${firstName}.`
            : "Welcome back."}
        </h1>

        {/* Conditional message */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 mb-8">
          {isFirstVisit ? (
            <p className="text-white/90 text-lg leading-relaxed text-center">
              Come back when you're ready to start.
            </p>
          ) : (
            <p className="text-white/90 text-lg leading-relaxed text-center">
              The next step is setting a daily movement commitment. Are you ready to set yours?
            </p>
          )}
        </div>

        {/* Single action - centered with auto width */}
        <div className="flex flex-col items-center gap-6">
          <button
            onClick={() => router.push("/onboarding/setup/movement-commitment")}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg py-4 px-8 rounded-lg transition-all duration-200"
          >
            Set My Commitment
          </button>

          {/* Sign out option */}
          <button
            onClick={handleSignOut}
            className="text-slate-400 hover:text-slate-300 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}