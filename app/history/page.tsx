"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";
import { getDayVisualState, DayVisualState } from "../utils/history/getDayVisualState";
import { getRecentHabitEvents, getEventDescription, getEventIcon } from "../utils/habitEvents";
import type { HabitEvent } from "../utils/habitEvents";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AnimatePresence, motion } from "framer-motion";

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
  const [habitEvents, setHabitEvents] = useState<HabitEvent[]>([]);
  const [showAllMilestones, setShowAllMilestones] = useState(false);
  const [showAllStreakEvents, setShowAllStreakEvents] = useState(false);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);

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
      const startDate = new Date(year, month, 1).toLocaleDateString("en-CA");
      const endDate = new Date(year, month + 1, 0).toLocaleDateString("en-CA");

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
      
      const events = await getRecentHabitEvents(email, 50);
      const monthEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate.getFullYear() === year && eventDate.getMonth() === month;
      });
      setHabitEvents(monthEvents);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrimaryPercent = () => {
    const last7 = days.slice(-7);
    if (!last7.length) return 0;
    const hits = last7.filter(d => d.primaryHabitHit).length;
    return Math.round((hits / last7.length) * 100);
  };

  const calculateStackPercent = () => {
    return 0;
  };

  const calculateLifestylePercent = () => {
    const last7 = days.slice(-7);
    if (!last7.length) return 0;
    const total = last7.length * 4;
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
                  ? "border-2 border-blue-600 bg-slate-800"
                  : "border-2 border-slate-700 bg-slate-800/40"
              }`}
            >
              <span className={`text-sm font-semibold ${
                state === "solid" ? "text-white" : "text-white/70"
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
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <p className="text-white/60">Loading history...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <span className="text-xl">←</span>
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>

        {/* Calendar Card */}
        <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-xl p-6 mb-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="text-white/60 hover:text-white font-semibold transition-colors"
            >
              ← Prev
            </button>
            <h1 className="text-xl font-bold text-white">
              {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h1>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="text-white/60 hover:text-white font-semibold transition-colors"
            >
              Next →
            </button>
          </div>

          {/* Day Labels */}
          <div className="flex gap-1 justify-between mb-3">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="w-12 text-center text-xs font-semibold text-white/50">{d}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="space-y-1">
            {renderCalendar()}
          </div>

          {/* Weekly Rings */}
          <div className="mt-8 pt-6 border-t border-slate-700/50">
            <h2 className="text-base font-semibold text-white mb-6 text-center">Last 7 Days</h2>
            <div className="grid grid-cols-3 gap-4">
              {/* Primary Ring */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <svg className="transform -rotate-90 w-20 h-20">
                    <circle cx="40" cy="40" r="32" stroke="#334155" strokeWidth="8" fill="none" />
                    <circle
                      cx="40" cy="40" r="32"
                      stroke="#2563EB" strokeWidth="8" fill="none"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - calculatePrimaryPercent() / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{calculatePrimaryPercent()}%</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-white/70 mt-2 text-center">Primary</p>
              </div>

              {/* Stack Ring */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <svg className="transform -rotate-90 w-20 h-20">
                    <circle cx="40" cy="40" r="32" stroke="#334155" strokeWidth="8" fill="none" />
                    <circle
                      cx="40" cy="40" r="32"
                      stroke="#8B5CF6" strokeWidth="8" fill="none"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - calculateStackPercent() / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{calculateStackPercent()}%</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-white/70 mt-2 text-center">Stack</p>
              </div>

              {/* Lifestyle Ring */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <svg className="transform -rotate-90 w-20 h-20">
                    <circle cx="40" cy="40" r="32" stroke="#334155" strokeWidth="8" fill="none" />
                    <circle
                      cx="40" cy="40" r="32"
                      stroke="#64748B" strokeWidth="8" fill="none"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - calculateLifestylePercent() / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{calculateLifestylePercent()}%</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-white/70 mt-2 text-center">Lifestyle</p>
              </div>
            </div>
          </div>

          {/* Momentum Trend */}
          <div className="mt-8 pt-6 border-t border-slate-700/50">
            <h2 className="text-base font-semibold text-white mb-4">Momentum Trend</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={days.slice(-30)}>
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).getDate().toString()}
                    stroke="#64748B"
                    fontSize={12}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    stroke="#64748B"
                    fontSize={12}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-lg">
                            <p className="text-xs text-white/60">
                              {new Date(data.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                            <p className="text-sm font-bold text-white">{data.momentumScore}%</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="momentumScore" 
                    stroke="#2563EB" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-white/50">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-blue-600"></div>
                <span>Last 30 days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Habit Events Timeline */}
        {habitEvents.filter(e => e.type !== "streak_saver_earned" && e.type !== "streak_saver_used").length > 0 && (
          <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-base font-semibold text-white mb-4">Milestones & Progress</h2>
            <div className="space-y-3">
              {habitEvents
                .filter(e => e.type !== "streak_saver_earned" && e.type !== "streak_saver_used")
                .map((event, index) => (
                  <div
                    key={event.id}
                    className={`flex items-start gap-3 border border-slate-700/50 rounded-lg p-3 transition-all duration-300 ease-out ${
                      !showAllMilestones && index >= 5 
                        ? "max-h-0 opacity-0 overflow-hidden py-0 my-0 border-0" 
                        : "max-h-96 opacity-100"
                    }`}
                  >
                    <div className="text-2xl flex-shrink-0">{getEventIcon(event)}</div>
                    <div className="flex-1">
                      <p className="font-semibold text-white text-sm">
                        {getEventDescription(event)}
                      </p>
                      <p className="text-xs text-white/50">
                        {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
            {habitEvents.filter(e => e.type !== "streak_saver_earned" && e.type !== "streak_saver_used").length > 5 && (
              <button
                onClick={() => setShowAllMilestones(!showAllMilestones)}
                className="mt-3 text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors"
              >
                {showAllMilestones ? "Show Less" : `Show ${habitEvents.filter(e => e.type !== "streak_saver_earned" && e.type !== "streak_saver_used").length - 5} More`}
              </button>
            )}
          </div>
        )}

        {/* Streak Ledger */}
        {habitEvents.filter(e => e.type === "streak_saver_earned" || e.type === "streak_saver_used").length > 0 && (
          <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-base font-semibold text-white mb-4">Streak Savers</h2>
            <div className="space-y-2">
              {habitEvents
                .filter(e => e.type === "streak_saver_earned" || e.type === "streak_saver_used")
                .map((event, index) => (
                  <div
                    key={event.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-all duration-300 ease-out ${
                      !showAllStreakEvents && index >= 3
                        ? "max-h-0 opacity-0 overflow-hidden py-0 my-0 border-0"
                        : "max-h-96 opacity-100"
                    } ${
                      event.type === "streak_saver_earned" 
                        ? "bg-green-900/20 border border-green-700/30" 
                        : "bg-amber-900/20 border border-amber-700/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getEventIcon(event)}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {event.type === "streak_saver_earned" ? "Earned Streak Saver" : "Used Streak Saver"}
                        </p>
                        <p className="text-xs text-white/50">
                          {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {event.streakLength && ` • ${event.streakLength}-day streak`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-white/60">
                        {event.saversRemaining}/3
                      </p>
                    </div>
                  </div>
                ))}
            </div>
            {habitEvents.filter(e => e.type === "streak_saver_earned" || e.type === "streak_saver_used").length > 3 && (
              <button
                onClick={() => setShowAllStreakEvents(!showAllStreakEvents)}
                className="mt-3 text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors"
              >
                {showAllStreakEvents ? "Show Less" : `Show ${habitEvents.filter(e => e.type === "streak_saver_earned" || e.type === "streak_saver_used").length - 3} More`}
              </button>
            )}
          </div>
        )}

        {/* Workout Timeline */}
        <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Recent Workouts</h2>
          <WorkoutTimeline currentMonth={currentMonth} showAllWorkouts={showAllWorkouts} setShowAllWorkouts={setShowAllWorkouts} />
        </div>

        {/* Day Detail Modal */}
        {selectedDay && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">{new Date(selectedDay.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</h2>
                <div className={`w-8 h-8 rounded-lg ${
                  selectedDay.visualState === "solid"
                    ? "bg-blue-600"
                    : selectedDay.visualState === "outline"
                    ? "border-2 border-blue-600"
                    : "bg-slate-700"
                }`} />
              </div>

              <div className="space-y-3">
                <div className="border-b border-slate-700 pb-3">
                  <p className="text-xs text-white/50 mb-1">Primary Habit</p>
                  <p className="text-sm font-semibold text-white">{selectedDay.primaryHabitHit ? "✓ Completed" : "✗ Missed"}</p>
                </div>

                <div className="border-b border-slate-700 pb-3">
                  <p className="text-xs text-white/50 mb-2">Lifestyle Behaviors</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className={selectedDay.moved ? "text-green-400" : "text-white/40"}>
                      {selectedDay.moved ? "✓" : "✗"} Movement
                    </p>
                    <p className={selectedDay.hydrated ? "text-green-400" : "text-white/40"}>
                      {selectedDay.hydrated ? "✓" : "✗"} Hydration
                    </p>
                    <p className={selectedDay.slept ? "text-green-400" : "text-white/40"}>
                      {selectedDay.slept ? "✓" : "✗"} Sleep
                    </p>
                    <p className={selectedDay.nutritionScore >= 9 ? "text-green-400" : "text-white/40"}>
                      {selectedDay.nutritionScore >= 9 ? "✓" : "✗"} Nutrition
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-white/50 mb-1">Momentum Score</p>
                  <p className="text-2xl font-bold text-white">{selectedDay.momentumScore}%</p>
                </div>

                {selectedDay.workoutSession && (
                  <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/30">
                    <p className="text-xs text-blue-400 font-semibold mb-1">Workout Completed</p>
                    <p className="text-sm text-white">{selectedDay.workoutSession.dayType} Day</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedDay(null)}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );

  function WorkoutTimeline({ 
    currentMonth, 
    showAllWorkouts, 
    setShowAllWorkouts 
  }: { 
    currentMonth: Date;
    showAllWorkouts: boolean;
    setShowAllWorkouts: (show: boolean) => void;
  }) {
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
        const startDate = new Date(year, month, 1).toLocaleDateString("en-CA");
        const endDate = new Date(year, month + 1, 0).toLocaleDateString("en-CA");
  
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
      return <p className="text-sm text-white/50 text-center py-4">No workouts this month</p>;
    }
  
    return (
      <>
        <div className="space-y-3">
          {sessions.map((session, index) => (
            <div
              key={session.id}
              className={`border border-slate-700/50 rounded-lg p-3 transition-all duration-300 ease-out ${
                !showAllWorkouts && index >= 5
                  ? "max-h-0 opacity-0 overflow-hidden py-0 my-0 border-0"
                  : "max-h-96 opacity-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white text-sm">{session.dayType} Day</p>
                  <p className="text-xs text-white/50">
                    {new Date(session.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{session.totalSets} sets</p>
                  <p className="text-xs text-white/50">{Math.floor(session.durationSec / 60)} min</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        {sessions.length > 5 && (
          <button
            onClick={() => setShowAllWorkouts(!showAllWorkouts)}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors"
          >
            {showAllWorkouts ? "Show Less" : `Show ${sessions.length - 5} More`}
          </button>
        )}
      </>
    );
  }
}