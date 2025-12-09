"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmail } from "@/app/utils/getEmail";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

type Plan = {
  primaryHabit: {
    targetMinutes: number;
  };
  hydrationTargetOz: number;
  proteinTargetG: number;
};

export default function PlanOverviewPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("there");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const email = getEmail();
        if (!email) {
          router.replace("/signup");
          return;
        }

        // Load user name
        const userRef = doc(db, "users", email);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          setFirstName(userData.firstName || "there");
        }

        // Load plan
        const planRef = doc(db, "users", email, "profile", "plan");
        const planSnap = await getDoc(planRef);

        if (planSnap.exists()) {
          setPlan(planSnap.data() as Plan);
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to load plan:", err);
        setLoading(false);
      }
    };

    loadPlan();
  }, [router]);

  const handleContinue = () => {
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50 px-6 py-12">
      <div className="max-w-2xl w-full">
        <div className="bg-white p-8 rounded-xl shadow-md mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Great work, {firstName}!
          </h1>
          <p className="text-lg text-gray-700">
            Your plan is ready. Here's how Nelson works:
          </p>
        </div>

        {/* Card 1 - Daily Check-In */}
        <div className="bg-white p-6 rounded-xl shadow-md mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Your Daily Check-In
          </h2>
          <p className="text-gray-700">
            Every day, you'll complete a quick check-in. This is your opportunity to reflect 
            on yesterday - the good, the bad, and the "did I do that?". Once you're used to 
            it, it takes less than a minute.
          </p>
        </div>

        {/* Card 2 - Movement Target */}
        <div className="bg-white p-6 rounded-xl shadow-md mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Your Movement Target
          </h2>
          <p className="text-gray-700">
            Daily movement is your foundation. You chose{" "}
            <strong>{plan?.primaryHabit.targetMinutes || 10} minutes</strong>, so we'll 
            build slowly from there.
          </p>
        </div>

        {/* Card 3 - Momentum */}
        <div className="bg-white p-6 rounded-xl shadow-md mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Momentum
          </h2>
          <p className="text-gray-700">
            Momentum shows how consistent you've been in recent days. If you simply complete 
            your commitment, momentum will start to build slowly at first, increasing over time. 
            80% or higher is your target.
          </p>
        </div>

        {/* Card 4 - First Step */}
        <div className="bg-white p-6 rounded-xl shadow-md mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Your First Step
          </h2>
          <p className="text-gray-700">
            You'll complete your first check-in next. This starts your streak and activates 
            your plan. Keep your streak alive by simply checking in with me every day.
          </p>
        </div>

        <button
          onClick={handleContinue}
          className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 transition"
        >
          Let's Go
        </button>
      </div>
    </main>
  );
}