"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";
import { getDayVisualState, DayVisualState } from "../utils/history/getDayVisualState";

type DayData = {
  date: string;
  visualState: DayVisualState;
  primaryHabitHit: boolean;
  moved: boolean;
  hydrated: boolean;
  slept: boolean;
  nutritionScore: number;
  momentumScore: number;
  workoutSession?: any;
};

export default function HistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [days, setDays] = useState<DayData[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  useEffect(() => {
    loadMonthData();
  }, [currentMonth]);

  const loadMonthData = async () => {
    const email = getEmail();
    if (!email) {
      router.replace("/signup");
      return;
    }

    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const startDate = new Date(year, month, 1).toISOString().split("T")[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

      // Load momentum data
      const momentumRef = collection(db, "users", email, "momentum");
      const momentumQuery = query(
        momentumRef,
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date", "asc")
      );
      const momentumSnap = await getDocs(momentumQuery);
      
      const loadedDays: DayData[] = momentumSnap.docs.map(doc => {
        const data = doc.data();
        return {
          date: data.date,
          visualState: data.visualState || "empty",
          primaryHabitHit: data.primaryHabitHit || false,
          moved: data.moved || false,
          hydrated: data.hydrated || false,
          slept: data.slept || false,
          nutritionScore: data.nutritionScore || 0,
          momentumScore: data.momentumScore || 0,
        };
      });

      setDays(loadedDays);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading history...</p>
      </main>
    );
  }
  const calculatePrimaryPercent = () => {
    const last7 = days.slice(-7);
    if (!last7.length) return 0;
    const hits = last7.filter(d => d.primaryHabitHit).length;
    return Math.round((hits / last7.length) * 100);
  };

  const calculateStackPercent = () => {
    // TODO: Add stack tracking to momentum docs
    // For now, return 0
    return 0;
  };

  const calculateLifestylePercent = () => {
    const last7 = days.slice(-7);
    if (!last7.length) return 0;
    const hits = last7.filter(d => 
      (d.nutritionScore >= 9 ? 1 : 0) + 
      (d.hydrated ? 1 : 0) + 
      (d.slept ? 1 : 0) + 
      (d.moved ? 1 : 0)
    );
    const total = last7.length * 4; // 4 lifestyle behaviors
    const score = last7.reduce((sum, d) => {
      return sum + 
        (d.nutritionScore >= 9 ? 1 : 0) + 
        (d.hydrated ? 1 : 0) + 
        (d.slept ? 1 : 0) + 
        (d.moved ? 1 : 0);
    }, 0);
    return Math.round((score / total) * 100);
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const calendar = [];
    let dayNum = 1;

    for (let week = 0; week < 6; week++) {
      const weekDays = [];
      for (let day = 0; day < 7; day++) {
        if ((week === 0 && day < firstDay) || dayNum > daysInMonth) {
          weekDays.push(<div key={`empty-${week}-${day}`} className="w-12 h-12" />);
        } else {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          const dayData = days.find(d => d.date === dateStr);
          const state = dayData?.visualState || "empty";
          
          weekDays.push(
            <button
              key={dateStr}
              onClick={() => dayData && setSelectedDay(dayData)}
              className={`w-12 h-12 rounded-lg transition-all flex items-center justify-center ${
                state === "solid"
                  ? "bg-blue-600 border-2 border-blue-600"
                  : state === "outline"
                  ? "border-2 border-blue-600 bg-white"
                  : "border-2 border-gray-200 bg-gray-50"
              }`}
            >
              <span className={`text-sm font-semibold ${
                state === "solid" ? "text-white" : "text-gray-700"
              }`}>
                {dayNum}
              </span>
            </button>
          );
          dayNum++;
        }
      }
      calendar.push(
        <div key={`week-${week}`} className="flex gap-1 justify-between">
          {weekDays}
        </div>
      );
      if (dayNum > daysInMonth) break;
    }

    return calendar;
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading history...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Calendar Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="text-gray-600 hover:text-gray-900 font-semibold"
            >
              ← Prev
            </button>
            <h1 className="text-xl font-bold text-gray-900">
              {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h1>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="text-gray-600 hover:text-gray-900 font-semibold"
            >
              Next →
            </button>
          </div>

          {/* Day Labels */}
          <div className="flex gap-1 justify-between mb-3">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="w-12 text-center text-xs font-semibold text-gray-500">{d}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="space-y-1">
            {renderCalendar()}
           

          {/* Weekly Rings */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-base font-semibold text-gray-900 mb-6 text-center">Last 7 Days</h2>
            <div className="grid grid-cols-3 gap-4">
              {/* Primary Ring */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <svg className="transform -rotate-90 w-20 h-20">
                    <circle cx="40" cy="40" r="32" stroke="#E5E7EB" strokeWidth="8" fill="none" />
                    <circle
                      cx="40" cy="40" r="32"
                      stroke="#2563EB" strokeWidth="8" fill="none"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - calculatePrimaryPercent() / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-gray-900">{calculatePrimaryPercent()}%</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-700 mt-2 text-center">Primary</p>
              </div>

              {/* Stack Ring */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <svg className="transform -rotate-90 w-20 h-20">
                    <circle cx="40" cy="40" r="32" stroke="#E5E7EB" strokeWidth="8" fill="none" />
                    <circle
                      cx="40" cy="40" r="32"
                      stroke="#8B5CF6" strokeWidth="8" fill="none"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - calculateStackPercent() / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-gray-900">{calculateStackPercent()}%</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-700 mt-2 text-center">Stack</p>
              </div>

              {/* Lifestyle Ring */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <svg className="transform -rotate-90 w-20 h-20">
                    <circle cx="40" cy="40" r="32" stroke="#E5E7EB" strokeWidth="8" fill="none" />
                    <circle
                      cx="40" cy="40" r="32"
                      stroke="#64748B" strokeWidth="8" fill="none"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - calculateLifestylePercent() / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-gray-900">{calculateLifestylePercent()}%</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-700 mt-2 text-center">Lifestyle</p>
              </div>
            </div>
          </div>
        </div>
 {/* Workout Timeline */}
 <div className="mt-8 pt-6 border-t border-gray-200">
  <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Workouts</h2>
  <WorkoutTimeline currentMonth={currentMonth} />
</div>
          </div>
        {/* Day Detail Modal */}
{selectedDay && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{new Date(selectedDay.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</h2>
        <div className={`w-8 h-8 rounded-lg ${
          selectedDay.visualState === "solid"
            ? "bg-blue-600"
            : selectedDay.visualState === "outline"
            ? "border-2 border-blue-600"
            : "bg-gray-200"
        }`} />
      </div>

      <div className="space-y-3">
        <div className="border-b border-gray-200 pb-3">
          <p className="text-xs text-gray-500 mb-1">Primary Habit</p>
          <p className="text-sm font-semibold">{selectedDay.primaryHabitHit ? "✓ Completed" : "✗ Missed"}</p>
        </div>

        <div className="border-b border-gray-200 pb-3">
          <p className="text-xs text-gray-500 mb-2">Lifestyle Behaviors</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className={selectedDay.moved ? "text-green-600" : "text-gray-400"}>
              {selectedDay.moved ? "✓" : "✗"} Movement
            </p>
            <p className={selectedDay.hydrated ? "text-green-600" : "text-gray-400"}>
              {selectedDay.hydrated ? "✓" : "✗"} Hydration
            </p>
            <p className={selectedDay.slept ? "text-green-600" : "text-gray-400"}>
              {selectedDay.slept ? "✓" : "✗"} Sleep
            </p>
            <p className={selectedDay.nutritionScore >= 9 ? "text-green-600" : "text-gray-400"}>
              {selectedDay.nutritionScore >= 9 ? "✓" : "✗"} Nutrition
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Momentum Score</p>
          <p className="text-2xl font-bold text-gray-900">{selectedDay.momentumScore}%</p>
        </div>

        {selectedDay.workoutSession && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <p className="text-xs text-blue-600 font-semibold mb-1">Workout Completed</p>
            <p className="text-sm text-gray-900">{selectedDay.workoutSession.dayType} Day</p>
          </div>
        )}
      </div>

      <button
        onClick={() => setSelectedDay(null)}
        className="mt-6 w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
      >
        Close
      </button>
    </div>
  </div>
)}
      </div>
    </main>
  );
  function WorkoutTimeline({ currentMonth }: { currentMonth: Date }) {
    const [sessions, setSessions] = useState<any[]>([]);
  
    useEffect(() => {
      loadSessions();
    }, [currentMonth]);
  
    const loadSessions = async () => {
      const email = getEmail();
      if (!email) return;
  
      try {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const startDate = new Date(year, month, 1).toISOString().split("T")[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];
  
        const sessionsRef = collection(db, "users", email, "sessions");
        const q = query(
          sessionsRef,
          where("date", ">=", startDate),
          where("date", "<=", endDate),
          orderBy("date", "desc")
        );
        const snap = await getDocs(q);
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to load sessions:", err);
      }
    };
  
    if (!sessions.length) {
      return <p className="text-sm text-gray-500 text-center py-4">No workouts this month</p>;
    }
  
    return (
      <div className="space-y-3">
        {sessions.map(session => (
          <div key={session.id} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{session.dayType} Day</p>
                <p className="text-xs text-gray-500">
                  {new Date(session.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{session.totalSets} sets</p>
                <p className="text-xs text-gray-500">{Math.floor(session.durationSec / 60)} min</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
}