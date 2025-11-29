// /app/utils/date.ts

export function getLocalDate(): string {
    return new Date().toLocaleDateString("en-CA");
  }
  
  export function getLocalDateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString("en-CA");
  }
  
  /**
   * Parse a YYYY-MM-DD string into a Date object at local midnight
   * Prevents timezone conversion issues
   */
  export function parseLocalDate(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00`);
  }
  
  /**
   * Get the difference in days between two YYYY-MM-DD strings
   */
  export function daysBetween(date1: string, date2: string): number {
    const d1 = parseLocalDate(date1);
    const d2 = parseLocalDate(date2);
    const diffMs = d2.getTime() - d1.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }