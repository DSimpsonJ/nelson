/**
 * MOMENTUM MESSAGING GUIDE
 * 
 * The exact copy for every momentum state.
 * Voice: Scientist > Cheerleader > Judge
 * Tone: Honest, encouraging, forward-looking
 */

// ============================================================================
// PRIMARY MESSAGES (Based on Momentum Score + Trend)
// ============================================================================

export const MOMENTUM_MESSAGES = {
  
  // HIGH MOMENTUM (80-100%)
  elite_stable: "Solid pattern. Keep building.",
  elite_rising: "Building momentum.",
  elite_falling: "Still strong. One day doesn't change the pattern.",
  
  // SOLID RANGE (70-79%)
  solid_stable: "Solid performance. This is the target.",
  solid_rising: "Momentum building. You're on track.",
  solid_falling: "Dip noted. Still solid.",
  
  // BUILDING RANGE (50-69%)
  building_stable: "Gaining traction. Keep building.",
  building_rising: "Momentum forming. Keep going.",
  building_falling: "Dip noted. Let's trend this pattern upward.",
  
  // EARLY/LOW MOMENTUM (30-49%)
  early_stable: "Every day is a fresh start. Let's build from here.",
  early_rising: "Starting to build. One day at a time.",
  early_falling: "Today starts a new pattern. One solid check-in at a time.",
  
  // STARTING FROM ZERO (0-29%)
  zero: "Starting fresh. First step: check in today.",
  
};

// ============================================================================
// SPECIAL CONTEXT MESSAGES (Override Primary When Applicable)
// ============================================================================

/**
 * After a drop that was protected by streak
 */
export function getStreakProtectionMessage(
  streak: number,
  dampeningPercent: number,
  drop: number
): string {
  if (streak >= 21) {
    return `Rough data point. Your ${streak}-day pattern matters more than one day.`;
  }
  
  if (streak >= 14) {
    return `Off day logged. Your ${streak}-day streak absorbed most of the drop.`;
  }
  
  if (streak >= 7) {
    return `Your ${streak}-day habit softened the impact. Keep building.`;
  }
  
  // Should not reach here, but fallback
  return "Rough day, but you faced the music. That's how you learn.";
}

/**
 * Recovering after a drop
 */
export function getRecoveryMessage(trend: 'up' | 'down' | 'stable', momentum: number): string {
  if (trend === 'up' && momentum < 75) {
    return "Bouncing back. That's what consistency looks like.";
  }
  
  if (trend === 'up' && momentum >= 75) {
    return "Pattern restored. This is who you're becoming.";
  }
  
  return "";  // Use primary message
}

/**
 * Pattern detected (multiple bad days)
 */
export function getPatternWarningMessage(badDaysInWindow: number): string {
  if (badDaysInWindow === 2) {
    return "Two rough days this week. Let's get back on track.";
  }
  
  if (badDaysInWindow >= 3) {
    return "Your pattern shifted. Time to reset and rebuild.";
  }
  
  return "";  // Use primary message
}

/**
 * After missed check-in(s)
 */
export function getMissedCheckInMessage(daysMissed: number, frozenMomentum: number): string {
  if (daysMissed >= 7) {
    return "Let's rebuild. Your first brick is back in place.";
  }
  
  if (daysMissed > 1) {
    return `It's been ${daysMissed} days. Your experiment paused. Momentum needs data.`;
  }
  
  if (daysMissed === 1) {
    return `You missed yesterday. Your momentum held at ${frozenMomentum}%. Check in today to keep building.`;
  }
  
  return "";
}

/**
 * First check-in ever
 */
export const FIRST_CHECKIN_MESSAGE = "First data point collected. Every experiment starts somewhere.";

/**
 * Check-in already complete today
 */
export const ALREADY_CHECKED_IN = "Check-in complete. Tomorrow's another data point.";

/**
 * Day 1 before first check-in
 */
export const DAY_ONE_BEFORE_CHECKIN = "Starting fresh. First step: check in today.";

// ============================================================================
// CELEBRATION MESSAGES (Milestones)
// ============================================================================

export const CELEBRATION_MESSAGES = {
  
  // Streak milestones
  streak_3: "3 days in a row. The habit is starting.",
  streak_7: "7 days straight. You're building real momentum.",
  streak_14: "Two weeks of data. The pattern is forming.",
  streak_21: "21 days. This is becoming automatic.",
  streak_30: "30 days of consistency. You've changed your behavior.",
  streak_50: "50 days. This is who you are now.",
  streak_100: "100 days. You're unstoppable.",
  
  // Momentum milestones
  first_80: "You hit 80% momentum. You're building something real.",
  seven_days_80_plus: "7 days above 80%. This is consistency.",
  thirty_days_80_plus: "30 days above 80%. You've proven the pattern.",
  
  // Recovery milestones
  back_after_break: "Back in the lab. Let's collect some data.",
  
};

// ============================================================================
// CALL-TO-ACTION MESSAGES
// ============================================================================

export const CTA_MESSAGES = {
  
  // Regular check-in prompt
  default: "Complete today's check-in to keep building.",
  
  // After good momentum day
  riding_high: "Keep the pattern going. Check in today.",
  
  // After rough day
  after_drop: "Tomorrow's a fresh data point. Let's collect it.",
  
  // After missed day(s)
  after_absence: "Be your own scientist. Collect today's data.",
  
  // Long absence (7+ days)
  long_absence: "Welcome back. Let's rebuild starting with today's check-in.",
  
};

// ============================================================================
// DASHBOARD SUBTITLE TEXT
// ============================================================================

/**
 * Small text that appears below the main momentum message
 * Provides additional context without being heavy-handed
 */
export function getSubtitleText(
  streak: number,
  consistency30Day: number,
  lastCheckIn: string  // Date of last check-in
): string {
  const today = new Date().toLocaleDateString('en-CA');
  const daysSinceCheckIn = calculateDaysBetween(lastCheckIn, today);
  
  // Already checked in today
  if (lastCheckIn === today) {
    return `${streak}-day streak · ${consistency30Day}% consistency this month`;
  }
  
  // Missed yesterday but have streak history
  if (daysSinceCheckIn === 1 && streak > 7) {
    return `Streak reset · ${consistency30Day}% consistency this month`;
  }
  
  // Multiple days missed
  if (daysSinceCheckIn > 1) {
    return `Last check-in: ${daysSinceCheckIn} days ago`;
  }
  
  // Default
  return `${streak}-day streak · Check in to continue`;
}

// ============================================================================
// MESSAGE SELECTION LOGIC
// ============================================================================

/**
 * Main function that determines which message to show
 * 
 * Priority:
 * 1. Missed check-in messages (if applicable)
 * 2. Pattern warnings (if 2-3 bad days detected)
 * 3. Streak protection messages (if drop was dampened)
 * 4. Recovery messages (if bouncing back)
 * 5. Primary messages (based on momentum level + trend)
 */
export function selectMomentumMessage(context: {
  momentumScore: number;
  trend: 'up' | 'down' | 'stable';
  streak: number;
  dampeningApplied: number;
  delta: number;
  daysSinceLastCheckIn: number;
  badDaysInWindow: number;
  frozenMomentum?: number;
}): string {
  
  const {
    momentumScore,
    trend,
    streak,
    dampeningApplied,
    delta,
    daysSinceLastCheckIn,
    badDaysInWindow,
    frozenMomentum
  } = context;
  
  // PRIORITY 1: Missed check-ins
  if (daysSinceLastCheckIn > 0) {
    const missedMessage = getMissedCheckInMessage(
      daysSinceLastCheckIn, 
      frozenMomentum || momentumScore
    );
    if (missedMessage) return missedMessage;
  }
  
  // PRIORITY 2: Pattern warnings
  if (badDaysInWindow >= 2) {
    const patternMessage = getPatternWarningMessage(badDaysInWindow);
    if (patternMessage) return patternMessage;
  }
  
  // PRIORITY 3: Streak protection (after a drop)
  if (trend === 'down' && dampeningApplied > 0 && streak >= 7) {
    return getStreakProtectionMessage(streak, dampeningApplied, Math.abs(delta));
  }
  
  // PRIORITY 4: Recovery messages
  if (trend === 'up' && momentumScore < 80) {
    const recoveryMessage = getRecoveryMessage(trend, momentumScore);
    if (recoveryMessage) return recoveryMessage;
  }
  
  // PRIORITY 5: Primary messages based on momentum level
  if (momentumScore >= 80) {
    if (trend === 'up') return MOMENTUM_MESSAGES.elite_rising;
    if (trend === 'down') return MOMENTUM_MESSAGES.elite_falling;
    return MOMENTUM_MESSAGES.elite_stable;
  }
  
  if (momentumScore >= 70) {
    if (trend === 'up') return MOMENTUM_MESSAGES.solid_rising;
    if (trend === 'down') return MOMENTUM_MESSAGES.solid_falling;
    return MOMENTUM_MESSAGES.solid_stable;
  }
  
  if (momentumScore >= 50) {
    if (trend === 'up') return MOMENTUM_MESSAGES.building_rising;
    if (trend === 'down') return MOMENTUM_MESSAGES.building_falling;
    return MOMENTUM_MESSAGES.building_stable;
  }
  
  if (momentumScore >= 30) {
    if (trend === 'up') return MOMENTUM_MESSAGES.early_rising;
    if (trend === 'down') return MOMENTUM_MESSAGES.early_falling;
    return MOMENTUM_MESSAGES.early_stable;
  }
  
  // Bottom tier
  return MOMENTUM_MESSAGES.zero;
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/**
 * Example of how to use this in your dashboard component:
 */
/*
const message = selectMomentumMessage({
  momentumScore: todayMomentum.momentumScore,
  trend: todayMomentum.momentumTrend,
  streak: todayMomentum.currentStreak,
  dampeningApplied: todayMomentum.dampeningApplied || 0,
  delta: todayMomentum.momentumDelta,
  daysSinceLastCheckIn: calculateDaysSinceLastCheckIn(email),
  badDaysInWindow: countBadDaysInWindow(last5Days),
  frozenMomentum: yesterdayMomentum?.momentumScore
});

const subtitle = getSubtitleText(
  todayMomentum.currentStreak,
  consistency30Day,
  todayMomentum.date
);
*/

// Helper function
function calculateDaysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}