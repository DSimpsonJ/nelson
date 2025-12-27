"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";

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

      setAllHistory(allDocs);
      setRolling30(last30);
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
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
            <p className="text-white/40 text-sm">Section 1: Momentum Trend (placeholder)</p>
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