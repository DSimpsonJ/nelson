/**
 * MISSED CHECK-IN HANDLER
 * 
 * Detects when user hasn't checked in and fills in missed days.
 * Called from dashboard on load to detect gaps.
 * 
 * Philosophy:
 * - Missed check-in ≠ Off day (different failures)
 * - Momentum DECAYS through gaps (friction with zero input)
 * - Streak breaks immediately
 * - Boulder rolls backwards when motion stops
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { DailyMomentumDoc } from "./writeDailyMomentum";

/**
 * Check if user has missed any check-ins and fill in the gaps
 */
export async function detectAndHandleMissedCheckIns(
  email: string
): Promise<{
  hadGap: boolean;
  daysMissed: number;
  lastCheckInDate: string | null;
  frozenMomentum: number;
  shouldReset: boolean;
}> {
  
  const today = new Date();
  const todayKey = today.toLocaleDateString("en-CA");
  
  // 1. Find the last check-in date
  const lastCheckIn = await findLastCheckIn(email, todayKey);
  
  if (!lastCheckIn) {
    // No check-ins found - brand new user
    return {
      hadGap: false,
      daysMissed: 0,
      lastCheckInDate: null,
      frozenMomentum: 0,
      shouldReset: false
    };
  }
  
  // 2. Calculate how many days between last check-in and today
  const lastDate = new Date(lastCheckIn.date + "T00:00:00");
  const daysBetween = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  console.log("[GAP DEBUG] daysBetween:", daysBetween, "lastCheckIn:", lastCheckIn.date, "today:", todayKey);
  
  // 3. If checked in today or yesterday, no gap
  if (daysBetween <= 1) {
    return {
      hadGap: false,
      daysMissed: 0,
      lastCheckInDate: lastCheckIn.date,
      frozenMomentum: lastCheckIn.momentumScore,
      shouldReset: false
    };
  }
  
  // 4. GAP DETECTED - fill in missed days with momentum decay
  const daysMissed = daysBetween - 1;
  const shouldReset = daysMissed >= 7;
  
  console.log(`[MissedCheckIns] Gap detected: ${daysMissed} days missed`);
  
  await fillMissedDays({
    email,
    lastCheckInDate: lastCheckIn.date,
    todayDate: todayKey,
    startingMomentum: lastCheckIn.momentumScore,
    shouldReset
  });
  
  return {
    hadGap: true,
    daysMissed,
    lastCheckInDate: lastCheckIn.date,
    frozenMomentum: lastCheckIn.momentumScore,
    shouldReset
  };
}

async function findLastCheckIn(
  email: string,
  startDate: string
): Promise<{ date: string; momentumScore: number } | null> {
  
  const searchDate = new Date(startDate + "T00:00:00");
  
  for (let i = 0; i < 30; i++) {
    searchDate.setDate(searchDate.getDate() - 1);
    const dateKey = searchDate.toLocaleDateString("en-CA");
    
    const docRef = doc(db, "users", email, "momentum", dateKey);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (!data.missed) {
        return {
          date: dateKey,
          momentumScore: data.rawMomentumScore || data.momentumScore || 0
        };
      }
    }
  }
  
  return null;
}

async function fillMissedDays(input: {
  email: string;
  lastCheckInDate: string;
  todayDate: string;
  startingMomentum: number;
  shouldReset: boolean;
}): Promise<void> {
  
  const { email, lastCheckInDate, todayDate } = input;
  
  const startDate = new Date(lastCheckInDate + "T00:00:00");
  const endDate = new Date(todayDate + "T00:00:00");
  
  const currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + 1);
  
  while (currentDate < endDate) {
    const dateKey = currentDate.toLocaleDateString("en-CA");
    
    const existingRef = doc(db, "users", email, "momentum", dateKey);
    const existingSnap = await getDoc(existingRef);
    
    if (!existingSnap.exists()) {
      const missedDoc: Partial<DailyMomentumDoc> = {
        date: dateKey,
        missed: true,
        
        // Momentum fields - set to 0, will be recalculated on next real check-in
        rawMomentumScore: 0,
        momentumScore: 0,
        momentumDelta: 0,
        momentumTrend: 'down',
        momentumMessage: "Missed check-in",
        
        // Behavior data (all zeros)
        dailyScore: 0,
        visualState: "empty",
        
        // Habit tracking
        primary: {
          habitKey: "",
          done: false
        },
        stack: {},
        foundations: {
          protein: false,
          hydration: false,
          sleep: false,
          nutrition: false,
          movement: false
        },
        
        // Status
        checkinType: "gap_fill",
        checkinCompleted: false,
        // Streaks (broken)
        currentStreak: 0,
        lifetimeStreak: 0,
        streakSavers: 0,
        
        createdAt: new Date().toISOString(),
      };
      
      await setDoc(existingRef, missedDoc);
      console.log(`[MissedCheckIns] Filled missed day: ${dateKey} (dailyScore: 0)`);
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
}

export function getMissedCheckInMessage(daysMissed: number, frozenMomentum: number): string {
  if (daysMissed >= 7) {
    return "Let's rebuild. First brick back in place.";
  }
  
  if (daysMissed > 1) {
    return `It's been ${daysMissed} days. The experiment paused. Momentum needs data.`;
  }
  
  if (daysMissed === 1) {
    return `You missed yesterday. Your momentum held at ${frozenMomentum}%. Check in today to keep building.`;
  }
  
  return "";
}

export async function hasCheckedInToday(email: string): Promise<boolean> {
  const today = new Date().toLocaleDateString("en-CA");
  const docRef = doc(db, "users", email, "momentum", today);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    return !data.missed;
  }
  
  return false;
}