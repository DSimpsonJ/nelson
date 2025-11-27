/**
 * Pure function to check if user is eligible for level-up
 * Based on last 7 days of real check-ins
 */

export interface DailyDoc {
    date: string;
    primary?: {
      habitKey: string;
      done: boolean;
    };
    checkinType?: "real" | "streak_saver";
  }
  
  export interface EligibilityParams {
    dailyDocsLast7: DailyDoc[];
    currentHabit: string;
    lastLevelUpDate: string | null;
    accountAgeDays: number;
  }
  
  export interface EligibilityResult {
    isEligible: boolean;
    reason?: string;
    daysHit?: number;
  }
  
  export function checkLevelUpEligibility(params: EligibilityParams): EligibilityResult {
    const { dailyDocsLast7, currentHabit, lastLevelUpDate, accountAgeDays } = params;
  
    // Must be at least 7 days old
    if (accountAgeDays < 7) {
      return { isEligible: false, reason: "account_too_new" };
    }
  
    // Must have at least some data
    if (dailyDocsLast7.length === 0) {
      return { isEligible: false, reason: "no_recent_data" };
    }
  
    // Check cooldown: must be 7+ days since last level-up
    if (lastLevelUpDate) {
      const daysSinceLevelUp = getDaysBetween(lastLevelUpDate, dailyDocsLast7[dailyDocsLast7.length - 1].date);
      if (daysSinceLevelUp < 7) {
        return { isEligible: false, reason: "cooldown" };
      }
    }
  
    // Count hits: only real check-ins where primary was hit
    const hits = dailyDocsLast7.filter(d =>
      d.primary &&
      d.primary.habitKey === currentHabit &&
      d.primary.done === true &&
      (d.checkinType ?? "real") === "real"
    ).length;
  
    if (hits < 5) {
      return { isEligible: false, reason: "insufficient_hits", daysHit: hits };
    }
  
    return { isEligible: true, daysHit: hits };
  }
  
  /**
   * Helper: calculate days between two YYYY-MM-DD dates
   */
  function getDaysBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }