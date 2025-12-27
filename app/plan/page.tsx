"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getEmail } from "../utils/getEmail";
import {
  CalendarIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  BoltIcon,
} from "@heroicons/react/24/solid";
const habitReasons: Record<string, string> = {
  "Hit your protein target": "Protein makes it easier to control hunger and preserves lean mass while you're losing fat.",
  "Drink 100 oz of water": "Hydration improves energy, appetite control, and training performance.",
  "Take a 10-minute walk after dinner": "Post-meal walking improves blood sugar control and digestion.",
  "Sleep 7+ hours": "Solid sleep improves recovery, cravings, and your ability to stick to the plan.",
  "Log your check-in": "Daily reflection builds consistency. Most people fail because they never track their behavior.",
};
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
            It looks like I couldn’t load your plan. Please return to the dashboard.
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
          Your Plan Is Ready
        </h1>
  
        <p className="text-gray-600 mb-6">
          Based on your intake, here’s where we’ll start.
        </p>
  
        {/* Week One Focus */}
<div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 text-left">
  <h2 className="flex items-center gap-2 text-lg font-semibold text-blue-800 mb-2">
  <BoltIcon className="w-5 h-5 text-amber-500" />
    Week One Focus
  </h2>

  <p className="text-blue-900 leading-relaxed">
    {plan.weekOneFocus}
  </p>
</div>
  
       {/* Daily Habits */}
<div className="mb-6 text-left">
  <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
    <CheckCircleIcon className="w-5 h-5 text-amber-500" />
    Daily Habits
  </h2>

  <ul className="space-y-3">
    {plan.dailyHabits.map((h: string, idx: number) => (
      <li
        key={idx}
        className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-green-600 mt-1" />
          <div>
            <p className="font-medium text-gray-900">{h}</p>

            {habitReasons[h] && (
              <p className="text-sm text-gray-600 mt-1">
                {habitReasons[h]}
              </p>
            )}
          </div>
        </div>
      </li>
    ))}
  </ul>
</div>
  
        {/* Weekly Schedule */}
<div className="mb-6">
  <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
    <CalendarIcon className="w-5 h-5 text-blue-600" />
    Weekly Schedule
  </h2>

  <ul className="space-y-3">
    {plan.schedule.map((day: any, idx: number) => (
      <li
        key={idx}
        className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 border-l-4 border-l-amber-400"
      >
        {/* Day bubble */}
        <span className="
          inline-flex 
          items-center 
          justify-center 
          px-3 
          py-1.5 
          rounded-full 
          text-xs 
          font-semibold 
          bg-blue-600 
          text-white 
          whitespace-nowrap
        ">
          {day.day}
        </span>

        {/* Right side */}
        <div className="flex-1">
          <p className="font-semibold text-amber-700">{day.focus}</p>

          <p className="text-gray-600 text-sm mt-1">
            {day.task}
          </p>
        </div>
      </li>
    ))}
  </ul>
</div>
  
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