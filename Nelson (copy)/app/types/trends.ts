// app/types/trends.ts

export type CheckinTrend = {
    proteinConsistency: number;
    hydrationConsistency: number;
    movementConsistency: number;
    moodTrend: string;
    checkinsCompleted: number;
  };
  
  export type SessionTrend = {
    workoutsThisWeek: number;
    totalSets: number;
    avgDuration: number;
  };
  
  export type TrendStats = CheckinTrend & SessionTrend;