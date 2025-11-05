"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";

/** Data shape */
type SessionExerciseSet = {
  reps: number | string | null;
  weight: number | string | null;
};

type SessionExercise = {
  name: string;
  sets: SessionExerciseSet[];
};

type Session = {
  id: string;
  date: string;
  dayType: string;
  totalSets: number;
  completedSets: number;
  durationSec: number;
  notes?: string;
  exercises?: SessionExercise[];
};

function formatDuration(sec: number) {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${mins}m ${secs}s`;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [personalRecords, setPersonalRecords] = useState<Record<string, number>>({});

  // --- Load sessions ---
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const email = getEmail();
        if (!email) return;

        const ref = collection(db, "users", email, "sessions");
        const q = query(ref, orderBy("date", "desc"));
        const snap = await getDocs(q);

        const list: Session[] = snap.docs.map((d) => {
          const data = d.data() as Omit<Session, "id">;
          return { id: d.id, ...data };
        });

        setSessions(list);
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  // --- Compute personal records ---
  useEffect(() => {
    if (!sessions.length) return;

    const recordMap: Record<string, number> = {};

    sessions.forEach((s) => {
      s.exercises?.forEach((ex) => {
        const maxWt = Math.max(
          ...ex.sets
            .map((set) => Number(set.weight) || 0)
            .filter((v) => v > 0)
        );
        if (!recordMap[ex.name] || maxWt > recordMap[ex.name]) {
          recordMap[ex.name] = maxWt;
        }
      });
    });

    setPersonalRecords(recordMap);
  }, [sessions]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600 font-semibold animate-pulse">
          Loading session history...
        </p>
      </main>
    );
  }

  if (!sessions.length) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600 text-lg">No sessions logged yet.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Training History
        </h1>

        <div className="space-y-4">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl shadow-sm p-4 border border-gray-200"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  {s.dayType} Day
                </h2>
                <p className="text-sm text-gray-500">
                  {new Date(s.date).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>

              {/* summary row */}
              {(() => {
                let totalVolume = 0;
                let totalSetsCounted = 0;

                s.exercises?.forEach((ex) => {
                  ex.sets.forEach((set) => {
                    const w = Number(set.weight) || 0;
                    const r = Number(set.reps) || 0;
                    if (w > 0 && r > 0) {
                      totalVolume += w * r;
                      totalSetsCounted++;
                    }
                  });
                });

                const avgWeight =
                  totalSetsCounted > 0
                    ? Math.round(totalVolume / totalSetsCounted)
                    : 0;

                    const prCount =
                    s.exercises?.reduce((acc, ex) => {
                      const pr = personalRecords?.[ex.name];
                      if (!pr) return acc;
                      const hitPR = ex.sets.some((set) => Number(set.weight) === pr);
                      return hitPR ? acc + 1 : acc;
                    }, 0) ?? 0;
                  
                  return (
                    <p className="text-sm text-gray-700 mt-1">
                      Sets: {s.completedSets}/{s.totalSets} | Duration:{" "}
                      {formatDuration(s.durationSec)} | Volume:{" "}
                      <span className="font-semibold">{totalVolume.toLocaleString()} lb</span>{" "}
                      | Avg Wt/Set:{" "}
                      <span className="font-semibold">{avgWeight} lb</span>
                      {prCount > 0 && (
                        <span className="ml-2 text-yellow-600 font-semibold">
                          🏆 PRs: {prCount}
                        </span>
                      )}
                    </p>
                  );
              })()}

              {s.notes && (
                <p className="text-sm text-gray-700 mt-2 italic">“{s.notes}”</p>
              )}

              {/* toggle */}
              <div className="mt-3">
                <button
                  onClick={() =>
                    setExpandedId(expandedId === s.id ? null : s.id)
                  }
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  {expandedId === s.id ? "Hide Details" : "View Details"}
                </button>
              </div>

              {/* expanded */}
              {expandedId === s.id && (
                <div className="mt-3 bg-gray-50 rounded-md p-3 text-sm text-gray-800 border border-gray-200 space-y-3">
                  {(() => {
                    // reset PR tracker for this card
                    (window as any)._shownPRs = new Set<string>();
                    return null;
                  })()}

                  {s.exercises && s.exercises.length > 0 ? (
                    s.exercises.map((ex, i) => (
                      <div
                        key={`${s.id}-ex-${i}`}
                        className="border-b border-gray-200 pb-2"
                      >
                        <p className="font-semibold text-gray-900 mb-1">
                          {i + 1}. {ex.name}
                        </p>

                        {ex.sets && ex.sets.length > 0 ? (
                          <ul className="ml-4 space-y-1">
                            {ex.sets.map((set, j) => (
                              <li
                                key={`${s.id}-ex-${i}-set-${j}`}
                                className="flex justify-between text-gray-700"
                              >
                                <span>Set {j + 1}</span>
                                <span>
                                  Reps: {set.reps ?? "—"} | Wt:{" "}
                                  {set.weight ?? "—"} lb{" "}
                                  {(() => {
                                    const w = Number(set.weight);
                                    const pr = personalRecords?.[ex.name];
                                    if (!pr || !Number.isFinite(w)) return null;

                                    const key = `${s.id}::${ex.name}`;
                                    const shown =
                                      (window as any)
                                        ._shownPRs as Set<string>;
                                    if (!shown) return null;

                                    if (w === Number(pr) && !shown.has(key)) {
                                      shown.add(key);
                                      return (
                                        <span className="ml-2 text-xs font-bold text-yellow-600">
                                          🏆 PR
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="ml-4 italic text-gray-500">
                            No set data recorded.
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 italic">
                      No detailed exercise data logged.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}