"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDocs, collection, orderBy, query, limit } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";
import { useToast } from "../context/ToastContext";
import { formatDistanceToNow } from "date-fns";

type Session = {
  id: string;
  date: string;
  totalSets: number;
  durationSec: number;
  dayType: string;
  notes?: string;
  exercises?: {
    name: string;
    sets: { reps: number | null; weight: number | null }[];
  }[];
};

export default function SummaryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [prevSession, setPrevSession] = useState<Session | null>(null);
  const [latestSession, setLatestSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ Fetch previous session for comparison
  useEffect(() => {
    const fetchPrevSession = async () => {
      try {
        const email = getEmail();
        if (!email || !latestSession?.dayType) return;
  
        const sessionsRef = collection(db, "users", email, "sessions");
        const q = query(sessionsRef, orderBy("date", "desc"));
        const snaps = await getDocs(q);
  
        // ✅ Find the most recent session of the *same type* (Upper vs Lower)
        const allSessions = snaps.docs.map((d) => d.data() as Session);
        const prevSameType = allSessions.find(
          (s) => s.dayType === latestSession.dayType && s.date !== latestSession.date
        );
  
        if (prevSameType) {
          setPrevSession(prevSameType);
          console.log("✅ Matched previous same-type session:", prevSameType.dayType, prevSameType.date);
        } else {
          console.log("⚠️ No same-type previous session found.");
        }
      } catch (err) {
        console.error("Error fetching previous session:", err);
      }
    };
  
    fetchPrevSession();
  }, [latestSession]);

  // ✅ Fetch latest session for summary
  useEffect(() => {
    const fetchLastSession = async () => {
      try {
        const email = getEmail();
        if (!email) return;

        const sessionsRef = collection(db, "users", email, "sessions");
        const q = query(sessionsRef, orderBy("date", "desc"), limit(1));
        const snaps = await getDocs(q);

        if (!snaps.empty) {
          setLatestSession(snaps.docs[0].data() as Session);
        } else {
          showToast({ message: "No sessions found", type: "info" });
        }
      } catch (err) {
        console.error("Error loading session summary:", err);
        showToast({ message: "Error loading summary", type: "error" });
      } finally {
        setLoading(false);
      }
    };

    fetchLastSession();
  }, [showToast]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-700 font-semibold animate-pulse">
          Loading summary…
        </p>
      </main>
    );
  }

  if (!latestSession) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No completed sessions yet.</p>
          <button
            onClick={() => router.push("/program")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
          >
            Go Train
          </button>
        </div>
      </main>
    );
  }

  const { date, totalSets, durationSec, dayType, notes, exercises } = latestSession;
  const durationMin = Math.floor(durationSec / 60);
  const recentAgo = formatDistanceToNow(new Date(date), { addSuffix: true });

  console.log("🔥 Latest session exercises:", exercises);
  console.log("🔥 Previous session object:", prevSession);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto bg-white shadow-sm rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Training Summary</h1>
        <p className="text-sm text-gray-500">
          {dayType} • {recentAgo}
        </p>

        {/* Top Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-600">Total Sets</p>
            <p className="text-lg font-semibold text-blue-700">{totalSets}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Duration</p>
            <p className="text-lg font-semibold text-green-700">{durationMin} min</p>
          </div>
        </div>

        {/* --- Exercise Details --- */}
        {exercises && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Exercises</h2>
            <ul className="divide-y divide-gray-100">
              {exercises.map((ex, i) => {
                const setVolumes = ex.sets.map(
                  (s) => (s.weight ? Number(s.weight) : 0) * (s.reps ? Number(s.reps) : 0)
                );
                const totalVolume = setVolumes.reduce((a, b) => a + b, 0);
                const heaviest = Math.max(...ex.sets.map((s) => (s.weight ? Number(s.weight) : 0)));

                let volumeDiff: number | null = null;

                if (prevSession && Array.isArray(prevSession.exercises)) {
                    const normalize = (name: string) =>
                      name?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "";
                  
                    const currentName = normalize(ex.name);
                    console.log("Comparing:", currentName, "against previous:", prevSession.exercises.map(p => p.name));
                    // ✅ Find a match regardless of dayType — compares across any previous session exercise
                    const prevEx = prevSession.exercises.find(
                      (p) => normalize(p.name) === currentName
                    );
                  
                    if (prevEx) {
                      const prevVol = prevEx.sets.reduce(
                        (sum: number, s: any) =>
                          sum +
                          (s.weight ? Number(s.weight) : 0) *
                            (s.reps ? Number(s.reps) : 0),
                        0
                      );
                      volumeDiff = totalVolume - prevVol;
                    }
                  }

                return (
                  <li key={i} className="py-3">
                    <div className="flex justify-between items-center mb-1">
                      <p className="font-medium text-gray-900">{ex.name}</p>
                      <div className="flex items-center space-x-2">
                        <p className="text-xs text-gray-500">
                          Volume:{" "}
                          <span className="font-semibold text-blue-700">
                            {totalVolume.toLocaleString()} lb
                          </span>
                        </p>
                        {volumeDiff !== null && (
                          <span
                            className={`text-xs font-semibold ${
                              volumeDiff > 0
                                ? "text-green-600"
                                : volumeDiff < 0
                                ? "text-red-500"
                                : "text-gray-400"
                            }`}
                          >
                            {volumeDiff > 0
                              ? `↑ ${volumeDiff.toLocaleString()}`
                              : volumeDiff < 0
                              ? `↓ ${Math.abs(volumeDiff).toLocaleString()}`
                              : "—"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sets */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs text-gray-700">
                      {ex.sets.map((s, j) => (
                        <div
                          key={j}
                          className={`p-2 rounded-md border ${
                            s.weight === heaviest
                              ? "bg-yellow-50 border-yellow-300 font-semibold text-yellow-800"
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <p>Set {j + 1}</p>
                          <p>{s.weight ? `${s.weight} lb` : "—"}</p>
                          <p>{s.reps ? `${s.reps} reps` : "—"}</p>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* ✅ Total session volume */}
            <div className="border-t border-gray-200 mt-4 pt-3 text-sm text-gray-700">
              <p className="text-center">
                Total Session Volume:{" "}
                <span className="font-semibold text-green-700">
                  {exercises
                    .reduce((total, ex) => {
                      return (
                        total +
                        ex.sets.reduce(
                          (sum, s) =>
                            sum +
                            (s.weight ? Number(s.weight) : 0) *
                              (s.reps ? Number(s.reps) : 0),
                          0
                        )
                      );
                    }, 0)
                    .toLocaleString()}{" "}
                  lb
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Notes Section */}
        {notes && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Notes</h2>
            <p className="text-gray-600 text-sm bg-gray-50 rounded-md p-3">
              {notes}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="text-center mt-6">
        <button
  onClick={() => {
    router.push("/dashboard");
  }}
  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
>
  Back to Dashboard
</button>
        </div>
      </div>
    </main>
  );
}