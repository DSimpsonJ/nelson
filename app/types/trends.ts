// app/types/trends.ts

export type CheckinTrend = {
  proteinConsistency: number;
  hydrationConsistency: number;
  movementConsistency: number;
  moodTrend: string;
  checkinsCompleted: number;
};

export type TrendStats = CheckinTrend;