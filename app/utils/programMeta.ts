// app/utils/programMeta.ts
export function getISOWeekId(d: Date = new Date()): string {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Thursday in current week decides the year.
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date as any) - (yearStart as any)) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
  
  // weeks between two ISO week ids like "2025-W43"
  export function weeksBetween(startWeekId: string, currentWeekId: string): number {
    const [ys, ws] = startWeekId.split("-W").map(Number);
    const [yc, wc] = currentWeekId.split("-W").map(Number);
    // crude diff good enough for block cadence across year boundary
    return (yc - ys) * 52 + (wc - ws);
  }
  
  export function isDeloadWeek(startWeekId: string, currentWeekId: string, cycleLen = 5): boolean {
    const diff = weeksBetween(startWeekId, currentWeekId);
    // 0..3 build, 4 deload, then repeats
    return diff % cycleLen === cycleLen - 1; // week index 4 when cycleLen=5
  }