"use client";

import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { getEmail } from "../../utils/getEmail";
import { getLocalDate } from "@/app/utils/date";
import { useToast } from "../../context/ToastContext";
import { testPatternDetection } from "@/app/services/testPatternDetection";
import { WeeklyCoachingDevTool } from '@/app/components/WeeklyCoachingDevTool';

interface DashboardDevToolsProps {
  setTodayCheckin: (val: any) => void;
  setTodayMomentum: (val: any) => void;
  setCheckinSubmitted: (val: boolean) => void;
 
}

export default function DashboardDevTools({
  setTodayCheckin,
  setTodayMomentum,
  setCheckinSubmitted,
}: DashboardDevToolsProps) {
  const router = useRouter();
  const { showToast } = useToast(); 

  const handleResetCheckin = async () => {
    try {
      const email = getEmail();
      if (!email) return;
  
      const today = new Date().toLocaleDateString("en-CA");
  
      // Delete today's check-in doc
      await deleteDoc(doc(db, "users", email, "checkins", today));
  
      // Delete today's momentum doc (IMPORTANT - otherwise momentum shows as complete)
      await deleteDoc(doc(db, "users", email, "momentum", today));
  
      // Clear only today's state
      setTodayCheckin(null);
      setTodayMomentum(null);
      setCheckinSubmitted(false);
  
      showToast({
        message: "Today's check-in reset",
        type: "success",
      });
  
    } catch (err) {
      console.error("Reset failed:", err);
      showToast({ message: "Failed to reset check-in", type: "error" });
    }
  };

  return (
    <>
    {/* Weekly Coaching Dev Tool */}
    <WeeklyCoachingDevTool userEmail={getEmail() || ''} />
      {/* Dev Reset Button */}
      <div className="mt-8 text-center">
        <button
          onClick={handleResetCheckin}
          className="text-sm text-gray-500 underline hover:text-gray-700"
        >
          🧪 Reset Today's Check-In (Dev Only)
        </button>
      </div>

      {/* Dev Tools Panel */}
      <div className="absolute bottom-2 right-2 z-50 opacity-70 hover:opacity-100">
        <details className="bg-gray-800 text-white rounded-lg shadow-lg p-3 w-48">
          <summary className="cursor-pointer text-sm font-semibold text-center hover:text-blue-400">
            🧪 Dev Tools
          </summary>

          <div className="flex flex-col gap-2 mt-3">
            
            {/* Sign Out */}
            <button
              onClick={async () => {
                try {
                  localStorage.removeItem("nelsonUser");
                  const { auth } = await import("@/app/firebase/config");
                  const { signOut } = await import("firebase/auth");
                  await signOut(auth);
                  showToast({ message: "Signed out", type: "info" });
                  router.push("/login");
                } catch (err) {
                  console.error("Sign out failed:", err);
                  router.push("/login");
                }
              }}
              className="bg-gray-700 hover:bg-gray-800 text-white rounded-md py-1 text-sm font-bold"
            >
              🚪 Sign Out
            </button>
           
            {/* Run Migration */}
<button
  onClick={async () => {
    try {
      const { backfillLastProvenTarget } = await import("@/app/utils/migrations/backfillLastProvenTarget");
      const result = await backfillLastProvenTarget();
      
      if (result.success) {
        showToast({ 
          message: `Migration complete: ${result.updated} updated, ${result.skipped} skipped`, 
          type: "success" 
        });
      } else {
        showToast({ message: "Migration failed", type: "error" });
      }
    } catch (err) {
      console.error("Migration error:", err);
      showToast({ message: "Migration failed", type: "error" });
    }
  }}
  className="bg-green-600 hover:bg-green-700 text-white rounded-md py-1 text-sm"
>
  🔄 Migrate lastProvenTarget
</button>
<button
  onClick={async () => {
    const email = getEmail();
    if (!email) return;
    
    try {
      await testPatternDetection(email);
      showToast({ message: "Check console for results", type: "success" });
    } catch (err) {
      console.error("Test failed:", err);
      showToast({ message: "Test failed - check console", type: "error" });
    }
  }}
  className="bg-purple-600 hover:bg-purple-700 text-white rounded-md py-1 text-sm"
>
  Test Pattern Detection
</button>

           {/* Trigger Level-Up (5 of last 7 days) */}
<button
  onClick={async () => {
    const email = getEmail();
    if (!email) return;
    
    try {
      // Get current focus to know the target
      const focusRef = doc(db, "users", email, "momentum", "currentFocus");
      const focusSnap = await getDoc(focusRef);
      const target = focusSnap.exists() && focusSnap.data().target 
        ? focusSnap.data().target 
        : 10;
      
      // Create 5 qualifying sessions in last 7 days
      for (let i = 1; i <= 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toLocaleDateString("en-CA");
        
        // Create session that meets target
        await setDoc(doc(db, "users", email, "sessions", `session-${dateKey}`), {
          date: dateKey,
          durationMin: target, // Meets the target exactly
          type: "cardio",
          createdAt: new Date().toISOString(),
        });
      }
      
      // Set lastLevelUpAt to 8+ days ago (or null for first time)
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      
      await setDoc(focusRef, {
        lastLevelUpAt: eightDaysAgo.toLocaleDateString("en-CA"),
      }, { merge: true });
      
      showToast({ message: "Level-up eligibility created! (5 sessions in last 7 days)", type: "success" });
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (err) {
      console.error("Setup failed:", err);
      showToast({ message: "Setup failed", type: "error" });
    }
  }}
  className="bg-purple-600 hover:bg-purple-700 text-white rounded-md py-1 text-sm"
>
  Trigger Level-Up (5/7)
</button>
<button
  onClick={async () => {
    const { getOrCreateVulnerabilityMap, formatVulnerabilityForPrompt } = await import("@/app/services/vulnerabilityMap");
    const map = await getOrCreateVulnerabilityMap(getEmail() || "");
    const formatted = formatVulnerabilityForPrompt(map);
    console.log("Vulnerability Map:", formatted);
    showToast({ message: "Check console for vulnerability map", type: "success" });
  }}
  className="bg-purple-600 hover:bg-purple-700 text-white rounded-md py-1 text-sm"
>
  Test Vulnerability Map
</button>
            {/* Trigger Week 1 Recap */}
            <button
              onClick={async () => {
                const email = getEmail();
                if (!email) return;
                
                try {
                  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
                  const eightDaysAgoISO = eightDaysAgo.toISOString();
                  const eightDaysAgoDate = eightDaysAgo.toLocaleDateString("en-CA");
                  
                  // Write first check-in date to metadata (8 days ago)
                  await setDoc(doc(db, "users", email, "metadata", "accountInfo"), {
                    firstCheckinDate: eightDaysAgoDate,
                    createdAt: eightDaysAgoISO,
                  });
                  
                  // Write lastCheckInDate to user doc (8 days ago, to trigger gap detection)
                  await setDoc(doc(db, "users", email), {
                    lastCheckInDate: eightDaysAgoDate,
                  }, { merge: true });
                  
                  // Write currentFocus with startedAt 8 days ago
                  await setDoc(doc(db, "users", email, "momentum", "currentFocus"), {
                    habitKey: "walk_10min",
                    habit: "Walk 10 minutes",
                    level: 1,
                    target: 10,
                    startedAt: eightDaysAgoDate,
                    consecutiveDays: 7,
                    createdAt: eightDaysAgoISO,
                  });
                  
                  showToast({ message: "Week 1 recap scenario created!", type: "success" });
                  setTimeout(() => window.location.reload(), 1000);
                  
                } catch (err) {
                  console.error("Setup failed:", err);
                  showToast({ message: "Setup failed", type: "error" });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-md py-1 text-sm"
            >
              Trigger Week 1 Recap
            </button>

            {/* Clear Today's Check-In */}
            <button
              onClick={async () => {
                const email = getEmail();
                if (!email) return;
                const today = getLocalDate();
                
                try {
                  // Delete today's check-in doc
                  await deleteDoc(doc(db, "users", email, "checkins", today));
                  
                  // Delete today's momentum doc
                  await deleteDoc(doc(db, "users", email, "momentum", today));
                  
                  // Clear local state immediately
                  setTodayMomentum(null);
                  setCheckinSubmitted(false);
                  
                  showToast({ message: "Cleared today's check-in", type: "success" });
                } catch (err) {
                  console.error("Clear failed:", err);
                  showToast({ message: "Clear failed", type: "error" });
                }
              }}
              className="bg-yellow-600 hover:bg-yellow-700 text-white rounded-md py-1 text-sm"
            >
              Clear Today's Check-In
            </button>
{/* Create 10 Test Check-Ins */}
<button
  onClick={async () => {
    const email = getEmail();
    if (!email) return;
    
    try {
      const dates = [
        '2026-01-24', '2026-01-25', '2026-01-26', '2026-01-27', '2026-01-28',
        '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'
      ];
      
      const notes = [
        'Felt good today, early morning walk',
        'Struggled with late night snacking',
        'Great workout, feeling strong',
        'Tired but showed up',
        'Pizza and drinks with friends',
        'Back on track after weekend',
        'Solid day across the board',
        'Vacation eating caught up with me',
        'Morning routine felt rushed',
        'Energy was low but stayed consistent'
      ];
      
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        
        // Create momentum document with behaviorGrades (correct structure)
        const behaviorGrades = [
          { name: 'nutrition_quality', grade: i % 4 === 0 ? 0 : (i % 3 === 0 ? 50 : 80) },
          { name: 'portion_control', grade: i % 5 === 0 ? 50 : 80 },
          { name: 'protein', grade: 80 },
          { name: 'hydration', grade: i % 4 === 0 ? 50 : 80 },
          { name: 'sleep', grade: i % 3 === 0 ? 50 : 80 },
          { name: 'mindset', grade: 80 },
          { name: 'movement', grade: 80 }
        ];
        
        const avgGrade = behaviorGrades.reduce((sum, b) => sum + b.grade, 0) / behaviorGrades.length;
        
        await setDoc(doc(db, "users", email, "momentum", date), {
          date,
          behaviorGrades,
          momentumScore: 65 + (i * 2),
          dailyScore: avgGrade,
          currentStreak: i + 1,
          exerciseCompleted: true,
          checkinType: 'real',
          totalRealCheckIns: i + 1,
          note: notes[i],
          accountAgeDays: i + 1,
          createdAt: new Date().toISOString()
        });
      }
      
      // Set metadata
      await setDoc(doc(db, "users", email, "metadata", "accountInfo"), {
        firstCheckinDate: dates[0],
        createdAt: new Date().toISOString()
      }, { merge: true });
      
      showToast({ message: "Created 10 test check-ins with CORRECT structure!", type: "success" });
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (err) {
      console.error("Setup failed:", err);
      showToast({ message: "Setup failed", type: "error" });
    }
  }}
  className="bg-green-600 hover:bg-green-700 text-white rounded-md py-1 text-sm"
>
  10 Test Check-Ins
</button>
{/* Clear All Coaching */}
<button
  onClick={async () => {
    const email = getEmail();
    if (!email) return;
    
    try {
      const summariesSnap = await getDocs(collection(db, "users", email, "weeklySummaries"));
      for (const d of summariesSnap.docs) {
        await deleteDoc(d.ref);
      }
      
      showToast({ message: "Cleared all coaching!", type: "success" });
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (err) {
      console.error("Clear failed:", err);
      showToast({ message: "Clear failed", type: "error" });
    }
  }}
  className="bg-orange-600 hover:bg-orange-700 text-white rounded-md py-1 text-sm"
>
  🗑️ Clear All Coaching
</button>
            {/* Fresh Start */}
            <button
              onClick={async () => {
                const email = getEmail();
                if (!email) return;
                
                try {
                  const momentumSnap = await getDocs(collection(db, "users", email, "momentum"));
                  for (const d of momentumSnap.docs) {
                    if (d.id.match(/^\d{4}-\d{2}-\d{2}$/)) {
                      await deleteDoc(d.ref);
                    }
                  }
                  
                  const sessionsSnap = await getDocs(collection(db, "users", email, "sessions"));
                  for (const d of sessionsSnap.docs) {
                    await deleteDoc(d.ref);
                  }
                  
                  const eventsSnap = await getDocs(collection(db, "users", email, "habitEvents"));
                  for (const d of eventsSnap.docs) {
                    await deleteDoc(d.ref);
                  }
                  
                  await setDoc(doc(db, "users", email, "momentum", "currentFocus"), {
                    habitKey: "walk_10min",
                    habit: "Walk 10 minutes",
                    level: 1,
                    target: 10,
                    startedAt: getLocalDate(),
                    lastLevelUpAt: null,
                  });
                  
                  const sevenDaysFromNow = new Date();
                  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
                  
                  await setDoc(doc(db, "users", email, "momentum", "commitment"), {
                    habit: "Walk 10 minutes",
                    habitKey: "walk_10min",
                    acceptedAt: getLocalDate(),
                    endsAt: sevenDaysFromNow.toLocaleDateString("en-CA"),
                    isActive: true,
                    levelUpPrompts: {},
                  });

                  showToast({ message: "Fresh start ready!", type: "success" });
                  setTimeout(() => window.location.reload(), 1000);
                  
                } catch (err) {
                  console.error("Reset failed:", err);
                  showToast({ message: "Reset failed", type: "error" });
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white rounded-md py-1 text-sm"
            >
              Fresh Start
            </button>
          </div>
        </details>
      </div>
    </>
  );
}