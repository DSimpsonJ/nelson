// utils/generateCoachInsight.ts

import { Checkin } from "./checkin";
import { TrendStats } from "../types/trends";

/** ✅ Detect streaks for a specific behavior (like hitting protein) */
function getStreak(checkins: Checkin[], key: keyof Checkin, target: string): number {
    let streak = 0;
    const sorted = [...checkins].sort((a, b) => (a.date < b.date ? 1 : -1));
  
    for (const c of sorted) {
      const val = (c[key] as string)?.toLowerCase?.() || "";
      if (val === target.toLowerCase()) {
        streak++;
      } else {
        break; // stop counting once the streak is broken
      }
    }
    return streak;
  }
  
  /** ✅ Compare two weeks to detect progress direction */
  function compareWeekOverWeek(
    current: TrendStats,
    previous?: TrendStats
  ): Record<string, number> {
    if (!previous) return {
      proteinChange: 0,
      hydrationChange: 0,
      movementChange: 0,
      moodChange: 0,
    };
  
    return {
      proteinChange: current.proteinConsistency - previous.proteinConsistency,
      hydrationChange: current.hydrationConsistency - previous.hydrationConsistency,
      movementChange: current.movementConsistency - previous.movementConsistency,
      moodChange:
        (moodToScore(current.moodTrend) || 0) -
        (moodToScore(previous.moodTrend) || 0),
    };
  }/** 
 * Convert mood words into numeric values for simple trend analysis.
 * Energized = 3, Okay = 2, Tired = 1, Unset = 0
 */
function moodToScore(mood: string): number {
  const val = mood?.toLowerCase?.() || "";
  if (val === "energized") return 3;
  if (val === "okay") return 2;
  if (val === "tired") return 1;
  return 0;
}

/** ✅ Generate smarter, motivational coach insight based on trends and check-in history */
export function generateCoachInsight(
    trends: TrendStats,
    recentCheckins: Checkin[],
    coachingStyle: "encouraging" | "direct" | "analytical" = "encouraging",
    previousWeek?: TrendStats
  ): string {
    try {
      const style = coachingStyle; // ✅ clean, explicit, no hacky casting
      // --- Analyze moods ---
      const avgMood =
        recentCheckins.length > 0
          ? recentCheckins.reduce((sum, c) => sum + moodToScore(c.mood), 0) /
            recentCheckins.length
          : 0;
  
      // --- Compute streaks ---
      const proteinStreak = getStreak(recentCheckins, "proteinHit", "yes");
      const movementStreak = getStreak(recentCheckins, "movedToday", "yes");
      const hydrationStreak = getStreak(recentCheckins, "hydrationHit", "yes");
  
      // --- Week-over-week comparison ---
      const changes = compareWeekOverWeek(trends, previousWeek);
  
      // --- Quick flags for feedback tiers ---
      const improving =
        changes.proteinChange > 5 ||
        changes.hydrationChange > 5 ||
        changes.movementChange > 5;
      const slipping =
        changes.proteinChange < -5 ||
        changes.hydrationChange < -5 ||
        changes.movementChange < -5;
  
      const strongConsistency =
        trends.proteinConsistency >= 75 &&
        trends.hydrationConsistency >= 70 &&
        trends.movementConsistency >= 70;
  
      const lowConsistency =
        trends.proteinConsistency < 50 &&
        trends.hydrationConsistency < 50 &&
        trends.movementConsistency < 50;
  
      const solidMood = avgMood >= 2.5;
      const lowMood = avgMood <= 1.5;
  
      // --- Construct message ---
      if (strongConsistency && solidMood) {
        return "You’re firing on all cylinders right now. Energy, habits, and mindset are aligned. Keep pressing forward with confidence.";
      }
  
      if (improving && !lowMood) {
        return "Your consistency is trending upward. Every small gain is compounding into real momentum — this is how results are built.";
      }
  
      if (slipping && lowMood) {
        return "It looks like this week’s been tougher. Revisit your basics — hydration, protein, and rest — and take it one step at a time.";
      }
  
      if (lowConsistency && !solidMood) {
        return "You’re rebuilding your rhythm. Don’t chase perfection, just aim for one more win today than yesterday.";
      }
  
      if (proteinStreak >= 3 || movementStreak >= 3 || hydrationStreak >= 3) {
        return `Nice work — you’re on a ${Math.max(
          proteinStreak,
          movementStreak,
          hydrationStreak
        )}-day streak. That kind of consistency adds up fast.`;
      }
  
            // --- Personality-driven encouragement layer ---
            let baseMessage =
            "Keep stacking small wins. Direction matters more than perfection — you’re right where you need to be.";
    
          if (strongConsistency && solidMood) {
            baseMessage =
              "You’re firing on all cylinders right now. Energy, habits, and mindset are aligned. Keep pressing forward with confidence.";
          } else if (improving && !lowMood) {
            baseMessage =
              "Your consistency is trending upward. Every small gain is compounding into real momentum — this is how results are built.";
          } else if (slipping && lowMood) {
            baseMessage =
              "It looks like this week’s been tougher. Revisit your basics — hydration, protein, and rest — and take it one step at a time.";
          } else if (lowConsistency && !solidMood) {
            baseMessage =
              "You’re rebuilding your rhythm. Don’t chase perfection, just aim for one more win today than yesterday.";
          } else if (proteinStreak >= 3 || movementStreak >= 3 || hydrationStreak >= 3) {
            baseMessage = `Nice work — you’re on a ${Math.max(
              proteinStreak,
              movementStreak,
              hydrationStreak
            )}-day streak. That kind of consistency adds up fast.`;
          }
    
    
          switch (style) {
            case "direct":
              return `${baseMessage} You know what works — now execute.`;
            case "analytical":
              return `${baseMessage} Data trends look solid. Keep evaluating what’s working best for you.`;
            case "encouraging":
            default:
              return `${baseMessage} You’re doing great — keep showing up and stacking those wins!`;
          }
        } catch (err) {
          console.error("generateCoachInsight error:", err);
          return "Keep moving forward — small steps become lasting change.";
        }
      }