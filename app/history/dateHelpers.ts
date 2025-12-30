/**
 * History Page Date Helpers
 * 
 * BOUNDARY RULE:
 * These functions use Date objects for CALENDAR MATH ONLY.
 * - Window derivation (which days to show)
 * - UI layout positioning
 * 
 * NEVER use these for:
 * - Momentum calculation
 * - Data filtering/aggregation
 * - Behavioral interpretation
 * 
 * All data operations remain string-based (YYYY-MM-DD).
 */

/**
 * shiftDate
 * 
 * Moves a date string backward by N days using calendar math.
 * 
 * @param dateString - YYYY-MM-DD format
 * @param offsetDays - Number of days to shift backward
 * @returns YYYY-MM-DD string
 * 
 * Example: shiftDate("2025-01-15", 7) → "2025-01-08"
 */
export function shiftDate(dateString: string, offsetDays: number): string {
    const [y, m, d] = dateString.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - offsetDays);
    return date.toISOString().slice(0, 10);
  }
  
  /**
   * getDaysBefore
   * 
   * Generates an array of date strings representing a calendar window.
   * Used for deriving comparison windows, NOT for data slicing.
   * 
   * @param endDate - YYYY-MM-DD format (most recent date)
   * @param numDays - Size of window to generate
   * @returns Array of YYYY-MM-DD strings in ascending order
   * 
   * Example: getDaysBefore("2025-01-15", 3) → ["2025-01-13", "2025-01-14", "2025-01-15"]
   */
  export function getDaysBefore(endDate: string, numDays: number): string[] {
    const days: string[] = [];
    for (let i = numDays - 1; i >= 0; i--) {
      days.push(shiftDate(endDate, i));
    }
    return days;
  }