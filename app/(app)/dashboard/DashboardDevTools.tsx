"use client";

import { useRouter } from "next/navigation";
import {
  doc,
  getDocs,
  collection,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { getEmail } from "../../utils/getEmail";
import { getLocalDate } from "@/app/utils/date";
import { useToast } from "../../context/ToastContext";
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
  
      // Delete today's momentum doc only — checkins subcollection does not exist
      await deleteDoc(doc(db, "users", email, "momentum", today));
  
      setTodayCheckin(null);
      setTodayMomentum(null);
      setCheckinSubmitted(false);
  
      showToast({ message: "Today's check-in reset", type: "success" });
  
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

{/* Seed Fake Check-ins */}
<button
              onClick={async () => {
                const email = getEmail();
                if (!email) return;
                const COUNT = 7;
                try {
                  for (let i = COUNT; i >= 1; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dateKey = d.toLocaleDateString("en-CA");
                    await setDoc(
                      doc(db, "users", email, "momentum", dateKey),
                      {
                        date: dateKey,
                        checkinType: "real",
                        momentumScore: 72,
                        rawMomentumScore: 72,
                        momentumDelta: 2,
                        dailyScore: 80,
                        totalRealCheckIns: COUNT - i + 1,
                        currentStreak: COUNT - i + 1,
                        exerciseCompleted: true,
                        checkinCompleted: true,
                        behaviorGrades: [
                          { name: "nutrition_quality", grade: 80 },
                          { name: "portion_control", grade: 80 },
                          { name: "protein", grade: 80 },
                          { name: "hydration", grade: 80 },
                          { name: "sleep", grade: 80 },
                          { name: "mindset", grade: 80 },
                          { name: "movement", grade: 80 },
                        ],
                        behaviorRatings: {
                          nutrition_quality: "solid",
                          portion_control: "solid",
                          protein: "solid",
                          hydration: "solid",
                          sleep: "solid",
                          mindset: "solid",
                          movement: "solid",
                        },
                        createdAt: new Date().toISOString(),
                      },
                      { merge: false }
                    );
                  }
                  showToast({ message: `Seeded ${COUNT} fake check-ins`, type: "success" });
                  setTimeout(() => window.location.reload(), 1000);
                } catch (err) {
                  console.error("Seed failed:", err);
                  showToast({ message: "Seed failed", type: "error" });
                }
              }}
              className="bg-blue-700 hover:bg-blue-800 text-white rounded-md py-1 text-sm"
            >
              🌱 Seed 7 Check-ins
            </button>
            
            {/* Trigger Coaching For All Users */}
            <button
  onClick={async () => {
    try {
      const email = getEmail();
      if (!email) {
        showToast({ message: "Not logged in", type: "error" });
        return;
      }

      // Calculate previous week ID (same logic as cron)
      const now = new Date();
const day = now.getDay();
const diff = day === 0 ? -6 : 1 - day;
const monday = new Date(now);
monday.setDate(now.getDate() + diff - 7);
const thu = new Date(monday);
thu.setDate(monday.getDate() + 3);
const yearStart = new Date(thu.getFullYear(), 0, 1);
const weekNum = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
const weekId = `${thu.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

      showToast({ message: `Generating coaching for ${weekId}...`, type: "success" });

      const response = await fetch('/api/generate-weekly-coaching', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`
        },
        body: JSON.stringify({ email, weekId })
      });

      const data = await response.json();
      
      if (response.ok) {
        showToast({ message: `Generated coaching for ${weekId}`, type: "success" });
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast({ message: `Failed: ${data.error}`, type: "error" });
      }
    } catch (err) {
      console.error('Coaching generation failed:', err);
      showToast({ message: "Generation failed - check console", type: "error" });
    }
  }}
  className="bg-purple-600 hover:bg-purple-700 text-white rounded-md py-1 text-sm"
>
  🔄 Trigger Weekly Coaching Now
</button>
          </div>
        </details>
      </div>
    </>
  );
}