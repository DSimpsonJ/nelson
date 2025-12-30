"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DailyMomentumDoc {
  date: string;
  momentumScore: number;
  dailyScore: number;
  behaviorGrades: any[];
  behaviorRatings: any;
  checkinType: "real" | "gap_fill";
  missed: boolean;
  currentStreak: number;
  lifetimeStreak: number;
  totalRealCheckIns: number;
  accountAgeDays: number;
  momentumDelta: number;
  momentumTrend: string;
  visualState: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rolling30, setRolling30] = useState<DailyMomentumDoc[]>([]);
  const [allHistory, setAllHistory] = useState<DailyMomentumDoc[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [previous30, setPrevious30] = useState<DailyMomentumDoc[]>([]);

  useEffect(() => {
    loadMomentumHistory();
  }, []);

  const loadMomentumHistory = async () => {
    const email = getEmail();
    if (!email) {
      router.replace("/signup");
      return;
    }

    try {
      // Query all momentum docs, ordered by date ascending
      const momentumRef = collection(db, "users", email, "momentum");
      const momentumQuery = query(momentumRef, orderBy("date", "asc"));
      const momentumSnap = await getDocs(momentumQuery);

      // Filter to date-formatted docs only (YYYY-MM-DD), exclude metadata docs
      const allDocs = momentumSnap.docs
        .filter(doc => {
          const docId = doc.id;
          return /^\d{4}-\d{2}-\d{2}$/.test(docId);
        })
        .map(doc => ({
          ...(doc.data() as DailyMomentumDoc),
          date: doc.id
        }));

      // Calculate rolling last 30 days (including today)
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 29); // -29 to include today = 30 days total

      const thirtyDaysAgoStr = thirtyDaysAgo.toLocaleDateString("en-CA");
      const todayStr = today.toLocaleDateString("en-CA");

      const last30 = allDocs.filter(doc => 
        doc.date >= thirtyDaysAgoStr && doc.date <= todayStr
      );

      // Calculate previous 30 days (for comparison)
      const sixtyDaysAgo = new Date(today);
      sixtyDaysAgo.setDate(today.getDate() - 59); // Days 31-60 ago
      const thirtyOneDaysAgo = new Date(today);
      thirtyOneDaysAgo.setDate(today.getDate() - 30);

      const sixtyDaysAgoStr = sixtyDaysAgo.toLocaleDateString("en-CA");
      const thirtyOneDaysAgoStr = thirtyOneDaysAgo.toLocaleDateString("en-CA");

      const prev30 = allDocs.filter(doc =>
        doc.date >= sixtyDaysAgoStr && doc.date <= thirtyOneDaysAgoStr
      );

      setAllHistory(allDocs);
      setRolling30(last30);
      setPrevious30(prev30);
    } catch (err) {
      console.error("Failed to load momentum history:", err);
    } finally {
      setLoading(false);
    }
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
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <span className="text-xl">←</span>
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>

        <h1 className="text-2xl font-bold text-white mb-6">History - Data Verification</h1>

        {/* Data dump for verification */}
        <pre className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-white text-sm overflow-auto mb-6">
{JSON.stringify({
  totalDocs: allHistory.length,
  rolling30Count: rolling30.length,
  allHistoryRange: {
    first: allHistory[0]?.date || "none",
    last: allHistory[allHistory.length - 1]?.date || "none"
  },
  rolling30Range: {
    first: rolling30[0]?.date || "none",
    last: rolling30[rolling30.length - 1]?.date || "none"
  }
}, null, 2)}
        </pre>

        {/* Placeholder sections (empty for now) */}
        <div className="space-y-4">
          {/* Section 1: Momentum Trend */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Momentum Trend</h2>
              <button
                onClick={() => setShowComparison(!showComparison)}
                className={`text-sm px-3 py-1 rounded transition-colors ${
                  showComparison
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-white/60 hover:text-white"
                }`}
              >
                vs previous 30
              </button>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                  <XAxis
                    dataKey="date"
                    type="category"
                    allowDuplicatedCategory={false}
                    tickFormatter={(date) => {
                      // Parse YYYY-MM-DD as local date to avoid timezone shift
                      const [year, month, day] = date.split('-').map(Number);
                      return `${month}/${day}`;
                    }}
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
                        // Parse YYYY-MM-DD as local date to avoid timezone shift
                        const [year, month, day] = data.date.split('-').map(Number);
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return (
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-lg">
                            <p className="text-xs text-white/60">
                              {monthNames[month - 1]} {day}
                            </p>
                            <p className="text-sm font-bold text-white">
                              {Math.round(data.momentumScore)}%
                            </p>
                            {data.checkinType === "gap_fill" && (
                              <p className="text-xs text-white/40">Gap day</p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  
                  {/* Previous 30 days (faded comparison) */}
                  {showComparison && previous30.length > 0 && (
                    <Line
                      data={previous30}
                      type="monotone"
                      dataKey="momentumScore"
                      stroke="#64748B"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 5"
                      opacity={0.3}
                    />
                  )}
                  
                  {/* Current rolling 30 days */}
                  <Line
                    data={rolling30}
                    type="monotone"
                    dataKey="momentumScore"
                    stroke="#2563EB"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <p className="text-xs text-white/40 mt-2 text-center">
              Recommended view: Last 30 days (rolling)
            </p>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
            <p className="text-white/40 text-sm">Section 2: Stats Bar (placeholder)</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
            <p className="text-white/40 text-sm">Section 3: Behavior Distribution Table (placeholder)</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
            <p className="text-white/40 text-sm">Section 4: Calendar (placeholder)</p>
          </div>
        </div>
      </div>
    </main>
  );
}