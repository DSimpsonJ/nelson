/**
 * MILESTONE DETECTION SERVICE
 * 
 * Checks if today's check-in triggered any celebrations.
 * Called after check-in is complete to determine which reward to show.
 */

import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export type MilestoneType = 
  | "commitment_complete"
  | "return_from_break"
  | "milestone_100"
  | "milestone_50"
  | "streak_30"
  | "streak_21"
  | "streak_7"
  | "streak_3"
  | "perfect_day"
  | null;

export interface MilestoneResult {
  hasMilestone: boolean;
  type: MilestoneType;
  metadata?: {
    streakLength?: number;
    checkinsCount?: number;
    daysAway?: number;
  };
}

/**
 * Check for all possible milestones after today's check-in
 */
export async function checkMilestones(
  email: string,
  todayDate: string
): Promise<MilestoneResult> {
  
  try {
    // Get today's momentum doc
    const todayRef = doc(db, "users", email, "momentum", todayDate);
    const todaySnap = await getDoc(todayRef);
    
    if (!todaySnap.exists()) {
      return { hasMilestone: false, type: null };
    }
    
    const todayData = todaySnap.data();
    const currentStreak = todayData.currentStreak || 0;
    
    // Get today's check-in doc
    const checkinRef = doc(db, "users", email, "checkins", todayDate);
    const checkinSnap = await getDoc(checkinRef);
    const checkinData = checkinSnap.exists() ? checkinSnap.data() : null;
    
    // ==========================================
    // PRIORITY 1: COMMITMENT COMPLETE
    // ==========================================
    const commitRef = doc(db, "users", email, "momentum", "commitment");
    const commitSnap = await getDoc(commitRef);
    const commitmentData = commitSnap.exists() ? commitSnap.data() : null;
    
    if (commitmentData?.expiresAt && commitmentData?.accepted && !commitmentData?.celebrated) {
      const expiresDate = new Date(commitmentData.expiresAt);
      const todayDateObj = new Date(todayDate + "T00:00:00");
      expiresDate.setHours(0, 0, 0, 0);
      todayDateObj.setHours(0, 0, 0, 0);
      
      if (expiresDate.getTime() <= todayDateObj.getTime()) {
        return {
          hasMilestone: true,
          type: "commitment_complete",
        };
      }
    }
    
    // ==========================================
    // PRIORITY 2: RETURN FROM BREAK (7+ days)
    // ==========================================
    // Check for gap between yesterday and last check-in
    const yesterday = new Date(todayDate + "T00:00:00");
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toLocaleDateString("en-CA");
    
    const yesterdayRef = doc(db, "users", email, "momentum", yesterdayKey);
    const yesterdaySnap = await getDoc(yesterdayRef);
    
    if (!yesterdaySnap.exists()) {
      // No yesterday doc - check how long we've been away
      const checkinsColRef = collection(db, "users", email, "checkins");
      const checkinsSnap = await getDocs(checkinsColRef);
      
      if (checkinsSnap.size > 1) {
        // Find the most recent check-in before today
        const allDates = checkinsSnap.docs
          .map(d => d.id)
          .filter(d => d < todayDate)
          .sort()
          .reverse();
        
        if (allDates.length > 0) {
          const lastCheckinDate = allDates[0];
          const lastDate = new Date(lastCheckinDate + "T00:00:00");
          const todayDateObj = new Date(todayDate + "T00:00:00");
          const daysDiff = Math.floor((todayDateObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff >= 7) {
            return {
              hasMilestone: true,
              type: "return_from_break",
              metadata: { daysAway: daysDiff },
            };
          }
        }
      }
    }
    
    // ==========================================
    // PRIORITY 3: LIFETIME CHECK-IN MILESTONES
    // ==========================================
    const allCheckinsSnap = await getDocs(collection(db, "users", email, "checkins"));
    const totalCheckins = allCheckinsSnap.size;
    
    if (totalCheckins === 100) {
      return {
        hasMilestone: true,
        type: "milestone_100",
        metadata: { checkinsCount: 100 },
      };
    }
    
    if (totalCheckins === 50) {
      return {
        hasMilestone: true,
        type: "milestone_50",
        metadata: { checkinsCount: 50 },
      };
    }
    
    // ==========================================
    // PRIORITY 4: STREAK MILESTONES
    // ==========================================
    if (currentStreak === 30) {
      return {
        hasMilestone: true,
        type: "streak_30",
        metadata: { streakLength: 30 },
      };
    }
    
    if (currentStreak === 21) {
      return {
        hasMilestone: true,
        type: "streak_21",
        metadata: { streakLength: 21 },
      };
    }
    
    if (currentStreak === 7) {
      return {
        hasMilestone: true,
        type: "streak_7",
        metadata: { streakLength: 7 },
      };
    }
    
    if (currentStreak === 3) {
      return {
        hasMilestone: true,
        type: "streak_3",
        metadata: { streakLength: 3 },
      };
    }
    
    // ==========================================
    // PRIORITY 5: PERFECT DAY
    // ==========================================
    if (checkinData && todayData.behaviorRatings) {
      const ratings = todayData.behaviorRatings;
      
      // Check if all behaviors are elite or solid
      const allBehaviors = [
        'nutrition_quality',
        'portion_control', 
        'protein',
        'hydration',
        'sleep',
        'mindset',
        'movement'
      ];
      
      const isPerfectDay = allBehaviors.every(behavior => 
        ratings[behavior] === 'elite' || ratings[behavior] === 'solid'
      );
      
      if (isPerfectDay) {
        return {
          hasMilestone: true,
          type: "perfect_day",
        };
      }
    }
    
    // No milestone found
    return { hasMilestone: false, type: null };
    
  } catch (error) {
    console.error("[CheckMilestones] Error:", error);
    return { hasMilestone: false, type: null };
  }
}