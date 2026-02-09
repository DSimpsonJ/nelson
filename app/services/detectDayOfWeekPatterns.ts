/**
 * Day-of-Week Pattern Detection
 * 
 * Analyzes user behavior by day of week to detect patterns like:
 * - "Nutrition drops every Friday"
 * - "Sleep quality tanks on Sundays"
 * - "Movement missed 75% of Mondays"
 * 
 * Returns structured facts (not prose) for AI coaching context.
 */

export interface DayOfWeekPattern {
    behavior: string;
    pattern: string; // e.g., "drops on weekends", "strong Monday-Thursday"
    weekdayAvg: number;
    weekendAvg: number;
    worstDay: string;
    worstDayAvg: number;
    bestDay: string;
    bestDayAvg: number;
    isSignificant: boolean; // Only flag if delta is meaningful (≥25 points)
  }
  
  export interface DayOfWeekAnalysis {
    patterns: DayOfWeekPattern[];
    hasSignificantPatterns: boolean;
  }
  
  export interface BehaviorData {
    name: string;
    grade: number;
  }
  
  interface DayData {
    date: string;
    behaviorGrades: BehaviorData[];
    exerciseCompleted: boolean;
  }
  
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const WEEKENDS = ['Saturday', 'Sunday'];
  
  /**
   * Main export: Detect day-of-week patterns from daily check-in data
   */
  export function detectDayOfWeekPatterns(dailyData: DayData[]): DayOfWeekAnalysis {
    if (dailyData.length < 7) {
      return { patterns: [], hasSignificantPatterns: false };
    }
  
    const patterns: DayOfWeekPattern[] = [];
  
    // Analyze each behavior
    const behaviors = [
      'nutrition_pattern',
      'energy_balance', 
      'protein',
      'hydration',
      'sleep',
      'movement',
      'mindset'
    ];
  
    for (const behavior of behaviors) {
      const pattern = analyzeBehaviorByDay(dailyData, behavior);
      if (pattern.isSignificant) {
        patterns.push(pattern);
      }
    }
  
    // Analyze exercise completion separately (boolean)
    const exercisePattern = analyzeExerciseByDay(dailyData);
    if (exercisePattern.isSignificant) {
      patterns.push(exercisePattern);
    }
  
    return {
      patterns,
      hasSignificantPatterns: patterns.length > 0
    };
  }
  
  /**
   * Analyze a single behavior (0-100 score) by day of week
   */
  function analyzeBehaviorByDay(dailyData: DayData[], behavior: string): DayOfWeekPattern {
    // Group data by day of week
    const byDay: Record<string, number[]> = {
      Sunday: [],
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    };
  
    dailyData.forEach(day => {
        const date = new Date(day.date);
        const dayName = DAYS[date.getDay()];
        
        // Find the behavior in the array
        const behaviorData = day.behaviorGrades.find(b => b.name === behavior);
        if (behaviorData) {
          byDay[dayName].push(behaviorData.grade);
        }
      });
  
    // Calculate averages
    const dayAverages: Record<string, number> = {};
    for (const day of DAYS) {
      if (byDay[day].length > 0) {
        dayAverages[day] = average(byDay[day]);
      }
    }
  
    // Calculate weekday vs weekend
    const weekdayScores = WEEKDAYS.flatMap(day => byDay[day]);
    const weekendScores = WEEKENDS.flatMap(day => byDay[day]);
  
    const weekdayAvg = weekdayScores.length > 0 ? average(weekdayScores) : 0;
    const weekendAvg = weekendScores.length > 0 ? average(weekendScores) : 0;
  
    // Find best/worst days
    const sortedDays = Object.entries(dayAverages).sort(([, a], [, b]) => b - a);
    const bestDay = sortedDays[0]?.[0] || 'Unknown';
    const bestDayAvg = sortedDays[0]?.[1] || 0;
    const worstDay = sortedDays[sortedDays.length - 1]?.[0] || 'Unknown';
    const worstDayAvg = sortedDays[sortedDays.length - 1]?.[1] || 0;
  
    // Determine pattern type
    const delta = Math.abs(weekdayAvg - weekendAvg);
    const isSignificant = delta >= 25; // 25+ point difference is meaningful
  
    let pattern = '';
    if (isSignificant) {
      if (weekendAvg < weekdayAvg - 25) {
        pattern = 'drops on weekends';
      } else if (weekdayAvg < weekendAvg - 25) {
        pattern = 'drops on weekdays';
      } else if (bestDayAvg - worstDayAvg >= 30) {
        pattern = `inconsistent (${worstDay} struggles)`;
      }
    }
  
    return {
      behavior: formatBehaviorName(behavior),
      pattern,
      weekdayAvg: Math.round(weekdayAvg),
      weekendAvg: Math.round(weekendAvg),
      worstDay,
      worstDayAvg: Math.round(worstDayAvg),
      bestDay,
      bestDayAvg: Math.round(bestDayAvg),
      isSignificant
    };
  }
  
  /**
   * Analyze exercise completion (boolean) by day of week
   */
  function analyzeExerciseByDay(dailyData: DayData[]): DayOfWeekPattern {
    // Group by day of week
    const byDay: Record<string, boolean[]> = {
      Sunday: [],
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    };
  
    dailyData.forEach(day => {
      const date = new Date(day.date);
      const dayName = DAYS[date.getDay()];
      byDay[dayName].push(day.exerciseCompleted);
    });
  
    // Calculate completion rates
    const dayRates: Record<string, number> = {};
    for (const day of DAYS) {
      if (byDay[day].length > 0) {
        const completed = byDay[day].filter(Boolean).length;
        dayRates[day] = (completed / byDay[day].length) * 100;
      }
    }
  
    // Calculate weekday vs weekend
    const weekdayCompleted = WEEKDAYS.flatMap(day => byDay[day]);
    const weekendCompleted = WEEKENDS.flatMap(day => byDay[day]);
  
    const weekdayRate = weekdayCompleted.length > 0 
      ? (weekdayCompleted.filter(Boolean).length / weekdayCompleted.length) * 100 
      : 0;
    const weekendRate = weekendCompleted.length > 0
      ? (weekendCompleted.filter(Boolean).length / weekendCompleted.length) * 100
      : 0;
  
    // Find best/worst days
    const sortedDays = Object.entries(dayRates).sort(([, a], [, b]) => b - a);
    const bestDay = sortedDays[0]?.[0] || 'Unknown';
    const bestDayAvg = sortedDays[0]?.[1] || 0;
    const worstDay = sortedDays[sortedDays.length - 1]?.[0] || 'Unknown';
    const worstDayAvg = sortedDays[sortedDays.length - 1]?.[1] || 0;
  
    // Determine pattern
    const delta = Math.abs(weekdayRate - weekendRate);
    const isSignificant = delta >= 30; // 30% difference is meaningful for boolean
  
    let pattern = '';
    if (isSignificant) {
      if (weekendRate < weekdayRate - 30) {
        pattern = 'missed on weekends';
      } else if (weekdayRate < weekendRate - 30) {
        pattern = 'missed on weekdays';
      } else if (dayRates[worstDay] < 40) {
        pattern = `frequently missed on ${worstDay}s`;
      }
    }
  
    return {
      behavior: 'Exercise',
      pattern,
      weekdayAvg: Math.round(weekdayRate),
      weekendAvg: Math.round(weekendRate),
      worstDay,
      worstDayAvg: Math.round(worstDayAvg),
      bestDay,
      bestDayAvg: Math.round(bestDayAvg),
      isSignificant
    };
  }
  
  /**
   * Helper: Calculate average
   */
  function average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
  
  /**
   * Helper: Format behavior names for display
   */
  function formatBehaviorName(behavior: string): string {
    const names: Record<string, string> = {
      nutrition_pattern: 'Nutrition',
      energy_balance: 'Energy Balance',
      protein: 'Protein',
      hydration: 'Hydration',
      sleep: 'Sleep',
      movement: 'Movement (NEAT)',
      mindset: 'Mindset'
    };
    return names[behavior] || behavior;
  }