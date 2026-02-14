export interface WeightEntry {
    id: string;
    date: string;        // YYYY-MM-DD
    weight: number;      // lbs
    timestamp: string;   // ISO
    weekOf: string;      // YYYY-WXX
  }
  
  export interface WeightTrend {
    current: number | null;
    fourWeekChange: number | null;
    direction: 'up' | 'down' | 'stable';
    message: string;
  }