"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getEmail } from "../utils/getEmail";

export default function PlanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const email = getEmail();
        if (!email) {
          router.replace("/signup");
          return;
        }
        const planRef = doc(db, "users", email, "profile", "intake");
        const snap = await getDoc(planRef);
        if (snap.exists()) {
          const data = snap.data();
          setPlan(data.plan);
        }
      } catch (err) {
        console.error("Failed to load plan:", err);
      } finally {
        setLoading(false);
        // Simulate a short “generating” delay for realism
        setTimeout(() => setGenerating(false), 3000);
      }
    };
    loadPlan();
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-700 font-medium animate-pulse">Loading...</p>
      </main>
    );
  }

  if (generating) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="bg-white shadow-md rounded-2xl px-10 py-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Generating your plan…
          </h1>
          <p className="text-gray-600">
            I’m tailoring everything based on your intake. This usually takes a few seconds.
          </p>
        </div>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No Plan Found</h1>
          <p className="text-gray-600 mb-4">
            It looks like we couldn’t load your plan. Please return to the dashboard.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Your Plan Is Ready
        </h1>
        <p className="text-gray-700 mb-6">
          Based on your intake, here’s your starting focus:
        </p>
        <ul className="text-left text-gray-800 space-y-2">
          <li><strong>Goal:</strong> {plan.goal}</li>
          <li><strong>Training Days:</strong> {plan.trainingDays}</li>
          <li><strong>Equipment:</strong> {plan.equipment}</li>
          <li><strong>Hydration:</strong> {plan.hydrationTarget} L/day</li>
          <li><strong>Sleep:</strong> {plan.sleepTarget} hrs/night</li>
          <li><strong>Coaching Style:</strong> {plan.coachingStyle}</li>
        </ul>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
        >
          Continue to Dashboard
        </button>
      </div>
    </main>
  );
}