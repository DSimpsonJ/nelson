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
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-lg w-full text-center animate-fade-up">
  
        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Your Personalized Plan Is Ready
        </h1>
  
        <p className="text-gray-600 mb-6">
          Based on your intake, here’s where we’ll start.
        </p>
  
        {/* Week One Focus */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 text-left">
          <h2 className="text-lg font-semibold text-blue-800 mb-1">
            Week One Focus
          </h2>
          <p className="text-blue-900">{plan.weekOneFocus}</p>
        </div>
  
        {/* Daily Habits */}
        {plan.dailyHabits && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 text-left">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Your Daily Habits
            </h2>
            <ul className="list-disc list-inside text-gray-700 space-y-1">
              {plan.dailyHabits.map((h: string, i: number) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        )}
  
        {/* Weekly Schedule */}
        {plan.schedule && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 text-left shadow-inner">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Your Weekly Structure
            </h2>
            <ul className="space-y-1 text-gray-700">
              {plan.schedule.map((d: any, i: number) => (
                <li key={i}>
                  <strong>{d.day}:</strong> {d.focus}
                </li>
              ))}
            </ul>
          </div>
        )}
  
        {/* Start Button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all w-full font-semibold"
        >
          Let’s Begin
        </button>
      </div>
    </main>
  );
  }