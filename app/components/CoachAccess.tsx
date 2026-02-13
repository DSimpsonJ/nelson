/**
 * CoachAccess Component
 * 
 * Entry point to weekly coaching from dashboard.
 * Shows GREEN when new coaching available (Monday morning, unviewed)
 * Shows BLUE when coaching has been viewed
 * Shows GREY when insufficient check-ins
 */

"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { WeeklySummaryRecord } from "@/app/types/weeklyCoaching";

interface CoachAccessProps {
  userEmail: string;
  onNavigate: () => void;
}

function getCurrentWeekId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const daysSinceJan1 = Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((daysSinceJan1 + jan1.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

export default function CoachAccess({ userEmail, onNavigate }: CoachAccessProps) {
  const [currentWeekCoaching, setCurrentWeekCoaching] = useState<WeeklySummaryRecord | null>(null);
  const [isNewCoaching, setIsNewCoaching] = useState(false); // Has coaching but not viewed
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCoachingStatus();
  }, [userEmail]);

  const checkCoachingStatus = async () => {
    if (!userEmail) return;
  
    try {
      // Count check-ins from momentum collection
      const momentumRef = collection(db, "users", userEmail, "momentum");
      const momentumSnapshot = await getDocs(momentumRef);
      const checkInCount = momentumSnapshot.docs.filter(
        doc => doc.id.match(/^\d{4}-\d{2}-\d{2}$/)
      ).length;
      setTotalCheckIns(checkInCount);
  
      // Get current week's coaching specifically
      const currentWeekId = getCurrentWeekId();
      const currentWeekDocRef = doc(db, "users", userEmail, "weeklySummaries", currentWeekId);
      const currentWeekDoc = await getDoc(currentWeekDocRef);
  
      if (currentWeekDoc.exists()) {
        const coaching = currentWeekDoc.data() as WeeklySummaryRecord;
        
        if (coaching.status === "generated") {
          setCurrentWeekCoaching(coaching);
          setIsNewCoaching(!(coaching as any).viewedAt);
          return; // Found current week, we're done
        }
      }
  
      // No current week coaching - check for most recent previous coaching
      const summariesRef = collection(db, "users", userEmail, "weeklySummaries");
      const q = query(summariesRef, orderBy("generatedAt", "desc"), limit(1));
      const snapshot = await getDocs(q);
  
      if (!snapshot.empty) {
        const mostRecent = snapshot.docs[0].data() as WeeklySummaryRecord;
        if (mostRecent.status === "generated") {
          setCurrentWeekCoaching(mostRecent); // Show most recent coaching
          setIsNewCoaching(false); // It's old, so not "new"
        }
      } else {
        // No coaching exists at all
        setCurrentWeekCoaching(null);
        setIsNewCoaching(false);
      }
    } catch (error) {
      console.error("Failed to check coaching:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  // No coaching for current week + insufficient check-ins = grey locked state
  if (!currentWeekCoaching && totalCheckIns < 6) {
    return (
      <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5 text-center">
        <div className="text-2xl mb-2">🔒</div>
        <p className="text-white/60 text-sm mb-1">Weekly Coaching Locked</p>
        <p className="text-white/40 text-xs">
          Complete {6 - totalCheckIns} more check-ins this week to unlock coaching
        </p>
      </div>
    );
  }

  // No coaching for current week but has enough check-ins = show coming soon
  if (!currentWeekCoaching && totalCheckIns >= 6) {
    return (
      <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5 text-center">
        <div className="text-2xl mb-2">⏳</div>
        <p className="text-white/60 text-sm mb-1">Coaching Generates Monday</p>
        <p className="text-white/40 text-xs">
          You've completed {totalCheckIns} check-ins - coaching will be ready Monday at 3am
        </p>
      </div>
    );
  }

  // New coaching available (GREEN CARD)
  if (isNewCoaching) {
    return (
      <button
        onClick={onNavigate}
        className="w-full bg-gradient-to-br from-green-900/40 to-green-800/30 border border-green-700/50 rounded-xl p-5 text-left hover:from-green-900/50 hover:to-green-800/40 transition-all group"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚡</div>
            <div>
              <div className="text-white font-semibold text-lg">New Coaching Available</div>
              <div className="text-white/60 text-xs">
                Tap to view this week's personalized assessment
              </div>
            </div>
          </div>
          <div className="text-white/40 group-hover:text-white/60 transition-colors">
            →
          </div>
        </div>

        <div className="bg-green-900/30 rounded-lg p-3 border border-green-800/50">
          <p className="text-white/90 text-sm">
            Your weekly coaching is ready. Tap to see what's working and what needs attention.
          </p>
        </div>
      </button>
    );
  }

  // Coaching already viewed (BLUE CARD)
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
              {formatWeekId(currentWeekCoaching?.weekId || "")}
            </div>
          </div>
        </div>
        <div className="text-white/40 group-hover:text-white/60 transition-colors">
          →
        </div>
      </div>

      {currentWeekCoaching?.coaching?.progression && (
        <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-800/50">
          <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">
            This Week's Focus
          </div>
          <p className="text-white/90 text-sm leading-relaxed line-clamp-2">
            {currentWeekCoaching.coaching.progression.text}
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