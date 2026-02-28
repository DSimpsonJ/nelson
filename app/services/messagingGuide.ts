/**
 * MOMENTUM MESSAGING GUIDE
 * 
 * The exact copy for every momentum state.
 * Voice: Scientist > Cheerleader > Judge
 * Tone: Honest, encouraging, forward-looking
 */
/**
 * Recovering after a drop
 */
export function getRecoveryMessage(trend: 'up' | 'down' | 'stable', momentum: number): string {
  if (trend === 'up' && momentum >= 75) {
    return "Momentum gained. Recent days are pulling weight.";
  }
  if (trend === 'up' && momentum < 75) {
    return "Accelerating. Your work is showing up in the numbers.";
  }
  return "";
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
    return "It's been a while. Today's check-in gets things moving again.";
  }
  if (daysMissed >= 2) {
    return `It's been ${daysMissed} days, your momentum has slowed. Today's check-in starts your rebuild.`;
  }
  if (daysMissed === 1) {
    return "You missed a day, your momentum dropped slightly. Check in daily to keep building.";
  }
  return "";
}
export function selectMomentumMessage(context: {
  momentumScore: number;
  trend: 'up' | 'down' | 'stable';
  streak: number;
  dampeningApplied: number;
  delta: number;
  daysSinceLastCheckIn: number;
  badDaysInWindow: number;
  frozenMomentum?: number;
  totalRealCheckIns: number;
}): string {

  const {
    momentumScore,
    trend,
    streak,
    dampeningApplied,
    delta,
    daysSinceLastCheckIn,
    badDaysInWindow,
    frozenMomentum,
    totalRealCheckIns
  } = context;

  // PRIORITY 0: First check-in ever
  if (totalRealCheckIns === 1) {
    return "Momentum reflects your daily check-in score. Check in daily to build.";
  }

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

 // PRIORITY 4: Recovery
 if (trend === 'up' && momentumScore < 90 && delta >= 6) {
  const recoveryMessage = getRecoveryMessage(trend, momentumScore);
  if (recoveryMessage) return recoveryMessage;
}

  // Normal day — no message
  return "";
}
