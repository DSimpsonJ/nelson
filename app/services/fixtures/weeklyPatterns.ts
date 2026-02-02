/**
 * Pattern Fixtures for Testing Weekly Coaching
 * 
 * These fixtures represent realistic WeeklyPattern objects for all 9 pattern types.
 * Use these to test prompt generation, validation, and API responses without Firestore.
 * 
 * Each fixture includes:
 * - Realistic evidence points
 * - Appropriate canCoach status
 * - Representative check-in counts
 */


export type PatternType = 
  | 'insufficient_data'
  | 'building_foundation'
  | 'gap_disruption'
  | 'commitment_misaligned'
  | 'recovery_deficit'
  | 'effort_inconsistent'
  | 'variance_high'
  | 'momentum_decline'
  | 'building_momentum'
  | 'momentum_plateau';

  export interface WeeklyPattern {
    primaryPattern: PatternType;
    evidencePoints: string[];
    weekId: string;
    dateRange: {
      start: string;
      end: string;
    };
    canCoach: boolean;
    daysAnalyzed: number;
    realCheckInsThisWeek: number;
    totalLifetimeCheckIns: number;
  }

/**
 * Pattern Fixtures
 * 
 * Priority order matches detectWeeklyPattern.ts:
 * 1. insufficient_data
 * 2. building_foundation
 * 3. gap_disruption
 * 4. commitment_misaligned
 * 5. recovery_deficit
 * 6. effort_inconsistent
 * 7. variance_high
 * 8. building_momentum
 * 9. momentum_plateau
 */
export const patternFixtures: Record<PatternType, WeeklyPattern> = {
  
  // PATTERN 1: insufficient_data
  // User hasn't provided enough check-ins to evaluate (< 4 in 7 days)
  insufficient_data: {
    primaryPattern: 'insufficient_data',
    evidencePoints: [
      'Check-ins: 3/7 days',
      'Insufficient data for pattern detection',
      'Lifetime check-ins: 8'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: false,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 3,
    totalLifetimeCheckIns: 8
  },

  // PATTERN 2: building_foundation
  // User is in first 10 days of usage (< 10 lifetime check-ins)
  building_foundation: {
    primaryPattern: 'building_foundation',
    evidencePoints: [
      'Check-ins: 5/7 days',
      'Lifetime check-ins: 9',
      'Early baseline period'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: false,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 5,
    totalLifetimeCheckIns: 9
  },

  // PATTERN 3: gap_disruption
  // Unresolved gaps present (check-ins with resolved=false)
  gap_disruption: {
    primaryPattern: 'gap_disruption',
    evidencePoints: [
      'Check-ins: 4/7 days',
      'Unresolved gaps: 2 days',
      'Momentum: 58%'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 4,
    totalLifetimeCheckIns: 18
  },

  // PATTERN 4: commitment_misaligned
  // High exercise commitment (5+ Solid/Elite days) but momentum < 70%
  commitment_misaligned: {
    primaryPattern: 'commitment_misaligned',
    evidencePoints: [
      'Check-ins: 6/7 days',
      'Exercise: 6 days Solid or better',
      'Momentum: 64%',
      'Foundation behaviors inconsistent'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 6,
    totalLifetimeCheckIns: 22
  },

  // PATTERN 5: recovery_deficit
  // Sleep or Mindset averaging < 2.5 (below Solid threshold)
  recovery_deficit: {
    primaryPattern: 'recovery_deficit',
    evidencePoints: [
      'Check-ins: 7/7 days',
      'Sleep average: 2.1 (below Solid)',
      'Mindset average: 2.3 (below Solid)',
      'Momentum: 68%'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 7,
    totalLifetimeCheckIns: 31
  },

  // PATTERN 6: effort_inconsistent
  // Exercise high (avg > 3.0) but other behaviors low (avg < 2.5)
  effort_inconsistent: {
    primaryPattern: 'effort_inconsistent',
    evidencePoints: [
      'Check-ins: 6/7 days',
      'Exercise average: 3.2',
      'Other behaviors average: 2.2',
      'Momentum: 61%'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 6,
    totalLifetimeCheckIns: 27
  },

  // PATTERN 7: variance_high
  // Standard deviation > 1.0 across behaviors
  variance_high: {
    primaryPattern: 'variance_high',
    evidencePoints: [
      'Check-ins: 7/7 days',
      'Behavior variance: 1.3 (high swings)',
      'Nutrition: range 1-4',
      'Momentum: 66%'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 7,
    totalLifetimeCheckIns: 25
  },
// PATTERN 8: momentum_decline
  // Recent drop from disruption (weekend crash, life event, etc)
  momentum_decline: {
    primaryPattern: 'momentum_decline',
    evidencePoints: [
      'Momentum dropped from 81% to 59%',
      'Variance: 28%',
      'Check-ins: 6/7'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 6,
    totalLifetimeCheckIns: 14
  },
  // PATTERN 8: building_momentum
  // Momentum trending upward (current > average of last 7 days)
  building_momentum: {
    primaryPattern: 'building_momentum',
    evidencePoints: [
      'Check-ins: 6/7 days',
      'Momentum: 81% (upward trend)',
      'Lifetime check-ins: 11'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 6,
    totalLifetimeCheckIns: 11
  },

  // PATTERN 9: momentum_plateau
  // Default pattern when none of the above apply
  momentum_plateau: {
    primaryPattern: 'momentum_plateau',
    evidencePoints: [
      'Check-ins: 7/7 days',
      'Momentum: 72% (stable)',
      'All behaviors consistently Solid'
    ],
    weekId: '2026-W04',
    dateRange: {
      start: '2026-01-20',
      end: '2026-01-26'
    },
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 7,
    totalLifetimeCheckIns: 28
  }
};

/**
 * Additional Edge Case Fixtures
 * 
 * These represent realistic edge cases for testing validation and UI
 */
export const edgeCaseFixtures = {
  
  // Perfect week (all Elite, but should still be momentum_plateau or building_momentum)
  perfect_week: {
    primaryPattern: 'building_momentum' as PatternType,
    evidencePoints: [
      'Check-ins: 7/7 days',
      'Momentum: 94% (upward trend)',
      'All behaviors Elite'
    ],
    weekId: '2026-W04',
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 7,
    totalLifetimeCheckIns: 15
  },

  // Returning after long gap
  returning_after_gap: {
    primaryPattern: 'gap_disruption' as PatternType,
    evidencePoints: [
      'Check-ins: 4/7 days',
      'Unresolved gaps: 3 days',
      'Momentum: 45%',
      'First check-in after 14-day gap'
    ],
    weekId: '2026-W04',
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 4,
    totalLifetimeCheckIns: 42
  },

  // High momentum but recovery dropping
  momentum_with_recovery_risk: {
    primaryPattern: 'recovery_deficit' as PatternType,
    evidencePoints: [
      'Check-ins: 7/7 days',
      'Momentum: 78%',
      'Sleep average: 2.0 (declining)',
      'Mindset average: 2.2'
    ],
    weekId: '2026-W04',
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 7,
    totalLifetimeCheckIns: 35
  },

  // Sporadic user (lifetime high, but inconsistent recent pattern)
  sporadic_pattern: {
    primaryPattern: 'variance_high' as PatternType,
    evidencePoints: [
      'Check-ins: 5/7 days',
      'Behavior variance: 1.5',
      'Lifetime check-ins: 87',
      'Pattern differs from historical baseline'
    ],
    weekId: '2026-W04',
    canCoach: true,
    daysAnalyzed: 7,
    realCheckInsThisWeek: 5,
    totalLifetimeCheckIns: 87
  }
};

/**
 * Helper to get a fixture by pattern type
 */
export function getPatternFixture(pattern: PatternType): WeeklyPattern {
  return patternFixtures[pattern];
}

/**
 * Helper to get all coachable patterns (for testing AI generation)
 */
export function getCoachableFixtures(): WeeklyPattern[] {
  return Object.values(patternFixtures).filter(p => p.canCoach);
}

/**
 * Helper to get all non-coachable patterns (for testing skip logic)
 */
export function getNonCoachableFixtures(): WeeklyPattern[] {
  return Object.values(patternFixtures).filter(p => !p.canCoach);
}