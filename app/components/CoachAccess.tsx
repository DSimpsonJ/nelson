/**
 * CoachAccess Component
 * 
 * Entry point to weekly coaching from dashboard.
 * Shows when coaching is available, stays subtle when not.
 */

"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { WeeklySummaryRecord } from "@/app/types/weeklyCoaching";
// Animation for new coaching card
const fadeInUpKeyframes = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

interface CoachAccessProps {
  userEmail: string;
  onNavigate: () => void;
}

function getCurrentWeekId(): string {
  const now = new Date();
  
  // Get Monday of current week
  const currentDay = now.getDay();
  const daysToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + daysToMonday);
  thisMonday.setHours(0, 0, 0, 0);
  
  // Get Thursday of this week for ISO year determination
  const thursday = new Date(thisMonday);
  thursday.setDate(thisMonday.getDate() + 3);
  const year = thursday.getFullYear();
  
  // Get first Monday of the year
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const firstMonday = new Date(year, 0, 1);
  firstMonday.setDate(1 + ((jan1Day === 0 ? -6 : 1) - jan1Day));
  
  // Calculate week number
  const weekNumber = Math.floor((thisMonday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

export default function CoachAccess({ userEmail, onNavigate }: CoachAccessProps) {
  const [latestCoaching, setLatestCoaching] = useState<WeeklySummaryRecord | null>(null);
  const [canGenerateNew, setCanGenerateNew] = useState(false);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCoachingStatus();
  }, [userEmail]);

  const checkCoachingStatus = async () => {
    if (!userEmail) return;

    try {
      // Get user's total check-in count
      const userDocRef = doc(db, "users", userEmail);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.data();
      
   // Count check-ins from momentum collection (where they actually are)
const momentumRef = collection(db, "users", userEmail, "momentum");
const momentumSnapshot = await getDocs(momentumRef);
// Only count documents with YYYY-MM-DD format (not currentFocus, etc.)
const checkInCount = momentumSnapshot.docs.filter(
  doc => doc.id.match(/^\d{4}-\d{2}-\d{2}$/)
).length;
      setTotalCheckIns(checkInCount);

      // Get most recent coaching
      const summariesRef = collection(db, "users", userEmail, "weeklySummaries");
      const q = query(summariesRef, orderBy("generatedAt", "desc"), limit(1));
      const snapshot = await getDocs(q);

      const currentWeekId = getCurrentWeekId();

      if (!snapshot.empty) {
        const latest = snapshot.docs[0].data() as WeeklySummaryRecord;
        if (latest.status === "generated") {
          setLatestCoaching(latest);
          
         // Show green card if any coaching exists AND hasn't been viewed yet
         const hasNotBeenViewed = !(latest as any).viewedAt;
         setCanGenerateNew(hasNotBeenViewed);
        }
      } else {
        // No coaching exists at all
        setCanGenerateNew(false);
      }
    } catch (error) {
      console.error("Failed to check coaching:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  // No coaching ever generated, not enough check-ins
  if (!latestCoaching && totalCheckIns < 10) {
    return (
      <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5 text-center">
        <div className="text-2xl mb-2">ðŸŽ¯</div>
        <p className="text-white/60 text-sm mb-1">Weekly coaching unlocks at 10 check-ins</p>
        <p className="text-white/40 text-xs">Keep showing up to unlock your first coaching</p>
      </div>
    );
  }

  // New coaching available this week (green card)
  if (canGenerateNew) {
    return (
      <button
        onClick={onNavigate}
        className="w-full relative overflow-hidden bg-gradient-to-br from-slate-800/90 to-slate-900/95 border border-blue-400/30 rounded-xl p-5 text-left hover:border-blue-400/50 transition-all duration-300 group shadow-lg shadow-blue-900/20 animate-[fadeInUp_0.6s_ease-out]"
      >
        <style>{fadeInUpKeyframes}</style>
        {/* Subtle animated glow on left edge */}
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-400/0 via-blue-400/60 to-blue-400/0 animate-[pulse_3s_ease-in-out_infinite]" />
        
        {/* Top status indicator */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-[pulse_3s_ease-in-out_infinite]" />
            <span className="text-blue-300/90 text-xs font-medium uppercase tracking-wider">New Intelligence</span>
          </div>
        </div>

        {/* Main content */}
        <div className="mb-2">
          <div className="text-white font-semibold text-lg mb-1">Weekly Coaching</div>
          <div className="flex items-center justify-between">
            <p className="text-white/70 text-sm">
              New coaching is available. Tap to read.
            </p>
            <div className="flex items-center gap-2 text-blue-400 text-xs group-hover:text-blue-300 transition-colors font-medium">
              <span>Read briefing</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  // Show most recent coaching (can still click to view)
  return (
    <button
      onClick={onNavigate}
     className="w-full bg-gradient-to-br from-blue-900/25 to-indigo-900/20 border border-blue-700/30 rounded-xl p-4 text-left hover:from-blue-900/30 hover:to-indigo-900/25 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Emoji removed for cleaner look */}
          <div>
            <div className="text-white font-semibold text-lg">Weekly Coaching</div>
            <div className="text-white/60 text-xs">
              {formatWeekId(latestCoaching?.weekId || "")}
            </div>
          </div>
        </div>
        {latestCoaching?.coaching?.progression?.type && (
          <div className="px-3 py-1 rounded-md bg-white/10 text-white/90 text-xs font-medium uppercase tracking-wider">
            {latestCoaching.coaching.progression.type}
          </div>
        )}
      </div>

      {latestCoaching?.coaching?.progression && (
        <div className="mt-2">
          <p className="text-white/90 text-sm leading-relaxed line-clamp-2">
            {latestCoaching.coaching.progression.text}
          </p>
        </div>
      )}

      <div className="mt-3 text-xs text-white/60 text-center">
        Tap to read full coaching
      </div>
    </button>
  );
}

function formatWeekId(weekId: string): string {
  if (!weekId) return "";
  
  const [year, weekStr] = weekId.split('-W');
  const weekNum = parseInt(weekStr);
  
  // Get first Monday of the year
  const jan1 = new Date(parseInt(year), 0, 1);
  const jan1Day = jan1.getDay();
  const firstMonday = new Date(parseInt(year), 0, 1);
  firstMonday.setDate(1 + ((jan1Day === 0 ? -6 : 1) - jan1Day));
  
  // Calculate the Monday of the target week
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
  
  // Get Sunday (6 days after Monday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  const monthStart = weekStart.toLocaleDateString('en-US', { month: 'short' });
  const monthEnd = weekEnd.toLocaleDateString('en-US', { month: 'short' });
  const dayStart = weekStart.getDate();
  const dayEnd = weekEnd.getDate();
  
  if (monthStart === monthEnd) {
    return `${monthStart} ${dayStart}-${dayEnd}`;
  }
  return `${monthStart} ${dayStart} - ${monthEnd} ${dayEnd}`;
}