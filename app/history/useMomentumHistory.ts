"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { getEmail } from "../utils/getEmail";
import { getDaysBefore, shiftDate } from "./dateHelpers";

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
  const [comparisonWindow, setComparisonWindow] = useState<DailyMomentumDoc[]>([]);
  const [accountAgeDays, setAccountAgeDays] = useState(0);
  const [comparisonSize, setComparisonSize] = useState(0);

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

      // 1. Primary observation window (independent of comparison)
      const primarySize = Math.min(ageDays, 30);

      // 2. Comparison window size (optional overlay)
      let compareSize = 0;
      if (ageDays >= 60) compareSize = 30;
      else if (ageDays >= 14) compareSize = 7;

      // 3. Build date ranges
      let currentDates: string[] = [];
      let previousDates: string[] = [];

      if (latestDate) {
        currentDates = getDaysBefore(latestDate, primarySize);

        if (compareSize > 0) {
          previousDates = getDaysBefore(
            shiftDate(latestDate, primarySize),
            compareSize
          );
        }
      }

      // 4. Map dates to docs, preserving calendar truth
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

      const previousDocs = previousDates.map(date => {
        return docMap.get(date) ?? null;
      }).filter(Boolean) as DailyMomentumDoc[];

      setAllHistory(allDocs);
      setCurrentWindow(currentDocs);
      setComparisonWindow(previousDocs);
      setAccountAgeDays(ageDays);
      setComparisonSize(compareSize);
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
    comparisonWindow,
    accountAgeDays,
    comparisonSize
  };
}