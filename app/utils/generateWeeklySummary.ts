// utils/generateWeeklySummary.ts

import { TrendStats } from "../types/trends";
import { Checkin } from "./checkin";

/** 
 * Generates a simple motivational summary based on last week's trends and insights.
 */
export function generateWeeklySummary(
  weekId: string,
  trends: TrendStats,
  insights: { note: string; createdAt: string }[],
  recentCheckins: Checkin[]
): string {
  try {
    const totalInsights = insights.length;
    const avgProtein = Math.round(trends.proteinConsistency);
    const avgHydration = Math.round(trends.hydrationConsistency);
    const avgMovement = Math.round(trends.movementConsistency);

    const avgMood =
      recentCheckins.length > 0
        ? (
            recentCheckins.reduce((sum, c) => {
              const mood = c.mood?.toLowerCase?.() || "";
              if (mood === "energized") return sum + 3;
              if (mood === "okay") return sum + 2;
              if (mood === "tired") return sum + 1;
              return sum;
            }, 0) / recentCheckins.length
          ).toFixed(1)
        : "N/A";

    let tone = "";
    if (avgProtein >= 80 && avgHydration >= 75 && avgMovement >= 70) {
      tone = "You stayed consistent and focused all week. Keep that rhythm going!";
    } else if (avgProtein < 60 || avgHydration < 60 || avgMovement < 60) {
      tone = "Last week had a few dips, but progress comes from getting back up and trying again.";
    } else {
      tone = "Momentum is building. Stay patient and steady — your work is paying off.";
    }

    return `Week ${weekId}: ${tone} You logged ${totalInsights} coach insights and your average mood score was ${avgMood}.`;
  } catch (err) {
    console.error("generateWeeklySummary error:", err);
    return "Reflect, reset, and keep moving forward — every week builds momentum.";
  }
}