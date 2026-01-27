/**
 * CoachAccess Component
 * 
 * Entry point to weekly coaching from dashboard.
 * Shows when coaching is available, stays subtle when not.
 */

"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { WeeklySummaryRecord } from "@/app/types/weeklyCoaching";

interface CoachAccessProps {
  userEmail: string;
  onNavigate: () => void;
}

export default function CoachAccess({ userEmail, onNavigate }: CoachAccessProps) {
  const [hasCoaching, setHasCoaching] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<WeeklySummaryRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkForCoaching();
  }, [userEmail]);

  const checkForCoaching = async () => {
    if (!userEmail) return;

    try {
      const summariesRef = collection(db, "users", userEmail, "weeklySummaries");
      const q = query(summariesRef, orderBy("generatedAt", "desc"), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const latest = snapshot.docs[0].data() as WeeklySummaryRecord;
        if (latest.status === "generated") {
          setHasCoaching(true);
          setCurrentWeek(latest);
        }
      }
    } catch (error) {
      console.error("Failed to check coaching:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  if (!hasCoaching) {
    return (
      <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5 text-center">
        <div className="text-2xl mb-2">🎯</div>
        <p className="text-white/60 text-sm mb-1">Weekly coaching unlocks at 10 check-ins</p>
        <p className="text-white/40 text-xs">Keep showing up to unlock your first coaching</p>
      </div>
    );
  }

  return (
    <button
      onClick={onNavigate}
      className="w-full bg-gradient-to-br from-blue-900/40 to-blue-800/30 border border-blue-700/50 rounded-xl p-5 text-left hover:from-blue-900/50 hover:to-blue-800/40 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🎯</div>
          <div>
            <div className="text-white font-semibold text-lg">Weekly Coaching</div>
            <div className="text-white/60 text-xs">
              {formatWeekId(currentWeek?.weekId || "")}
            </div>
          </div>
        </div>
        <div className="text-white/40 group-hover:text-white/60 transition-colors">
          →
        </div>
      </div>

      {currentWeek?.coaching?.focus && (
        <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-800/50">
          <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">
            This Week's Focus
          </div>
          <p className="text-white/90 text-sm leading-relaxed line-clamp-2">
            {currentWeek.coaching.focus.text}
          </p>
        </div>
      )}

      <div className="mt-3 text-xs text-white/50 text-center">
        Tap to read full coaching
      </div>
    </button>
  );
}

function formatWeekId(weekId: string): string {
  if (!weekId) return "";
  
  const [year, week] = weekId.split('-W').map(Number);
  const jan1 = new Date(year, 0, 1);
  const weekStart = new Date(jan1.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  const monthStart = weekStart.toLocaleDateString('en-US', { month: 'short' });
  const monthEnd = weekEnd.toLocaleDateString('en-US', { month: 'short' });
  const dayStart = weekStart.getDate();
  const dayEnd = weekEnd.getDate();
  
  if (monthStart === monthEnd) {
    return `${monthStart} ${dayStart}-${dayEnd}`;
  }
  return `${monthStart} ${dayStart} - ${monthEnd} ${dayEnd}`;
}