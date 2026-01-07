"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getEmail } from "../../utils/getEmail";
import { getDaysBefore } from "./dateHelpers";

export interface DailyMomentumDoc {
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
  exerciseCompleted?: boolean;
  exerciseTargetMinutes?: number;
}

export function useMomentumHistory() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allHistory, setAllHistory] = useState<DailyMomentumDoc[]>([]);
  const [currentWindow, setCurrentWindow] = useState<DailyMomentumDoc[]>([]);
  const [accountAgeDays, setAccountAgeDays] = useState(0);

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
      const momentumRef = collection(db, "users", email, "momentum");
      const momentumQuery = query(momentumRef, orderBy("date", "asc"));
      const momentumSnap = await getDocs(momentumQuery);

      const allDocs = momentumSnap.docs
        .filter(doc => /^\d{4}-\d{2}-\d{2}$/.test(doc.id))
        .map(doc => ({
          ...(doc.data() as DailyMomentumDoc),
          date: doc.id
        }));

      const latestDoc = allDocs[allDocs.length - 1];
      const ageDays = latestDoc?.accountAgeDays ?? allDocs.length;
      const latestDate = latestDoc?.date;

      // Primary observation window (up to 30 days)
      const primarySize = Math.min(ageDays, 30);

      // Comparison intentionally removed.
      // Reintroduce only as an advanced, opt-in analysis feature in v2.

      // Build date range
      let currentDates: string[] = [];
      if (latestDate) {
        currentDates = getDaysBefore(latestDate, primarySize);
      }

      // Map dates to docs, preserving calendar truth
      const docMap = new Map(allDocs.map(d => [d.date, d]));

      const currentDocs = currentDates.map(date => {
        return docMap.get(date) ?? {
          date,
          checkinType: "gap_fill",
          momentumScore: 0,
          dailyScore: 0,
          behaviorGrades: [],
          behaviorRatings: {},
          missed: true,
          currentStreak: 0,
          lifetimeStreak: 0,
          totalRealCheckIns: 0,
          accountAgeDays: ageDays,
          momentumDelta: 0,
          momentumTrend: "stable",
          visualState: "gap",
          exerciseCompleted: false
        } as DailyMomentumDoc;
      });

      setAllHistory(allDocs);
      setCurrentWindow(currentDocs);
      setAccountAgeDays(ageDays);
    } catch (err) {
      console.error("Failed to load momentum history:", err);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    allHistory,
    currentWindow,
    accountAgeDays
  };
}