/**
 * NEWTONIAN MOMENTUM ENGINE
 * 
 * Based on Newton's First Law: An object in motion remains in motion unless acted upon by an external force.
 * 
 * Key Principles:
 * - Momentum = behavioral inertia (hard to start, harder to stop)
 * - Mass = streak length (longer streaks = more resistance to change)
 * - Velocity = recent performance (how you're doing now)
 * - One bad day is noise. Three bad days is signal.
 * - Exercise = applied force (required for positive momentum change)
 * 
 * Scientific Foundation:
 * - Lally et al. (2010): Habits take 18-254 days to form (median 66 days)
 * - Missing one day does not reset habit formation
 * - Patterns matter more than individual failures
 */

interface BehaviorGrade {
  name: string;
  grade: number; // 0, 50, 80, or 100
}

interface MomentumCalculationInput {
  todayScore: number;
  last4Days: number[];
  currentStreak: number;
  previousMomentum?: number;
  totalRealCheckIns: number;
  exerciseCompleted?: boolean;
}

interface MomentumResult {
  proposedScore: number;        // Proposed momentum (before external caps)
  rawScore: number;             // Before dampening
  dampeningApplied: number;     // Percentage of drop that was dampened
  message: string;              // Contextual message for user
}

/**
 * Calculate weighted average using 5-day window
 * 
 * Weighting:
 * - Today + Yesterday: 60% (30% each) - Recent state
 * - Days 2-4 ago: 40% (13.3% each) - Established pattern
 */
function calculateWeightedAverage(todayScore: number, last4Days: number[]): number {
  // Ensure we have exactly 4 historical days (pad with todayScore if needed)
  const history = [...last4Days];
  while (history.length < 4) {
    history.unshift(todayScore); // Pad with today's score for new users
  }
  
  // [day-4, day-3, day-2, yesterday]
  const day4 = history[0];
  const day3 = history[1];
  const day2 = history[2];
  const yesterday = history[3];
  
  // Weights: 13.3%, 13.3%, 13.3%, 30%, 30%
  const weighted = 
    (day4 * 0.133) +
    (day3 * 0.133) +
    (day2 * 0.133) +
    (yesterday * 0.30) +
    (todayScore * 0.30);
  
  return Math.round(weighted);
}

/**
 * Detect if there's a pattern of bad days
 * 
 * Pattern Detection:
 * - 1 bad day in window: No pattern (anomaly)
 * - 2 bad days in window: Emerging pattern
 * - 3+ bad days in window: Clear pattern
 */
function detectBadDayPattern(todayScore: number, last4Days: number[]): number {
  const allScores = [...last4Days, todayScore];
  const badDayCount = allScores.filter(score => score < 50).length; // Below "Not Great"
  
  if (badDayCount >= 3) return 0;    // 3+ bad days = no dampening (pattern is real)
  if (badDayCount === 2) return 0.5; // 2 bad days = half dampening (pattern forming)
  return 1.0;                        // 0-1 bad days = full dampening (anomaly)
}

/**
 * Apply streak-based dampening on DROPS ONLY
 * 
 * Dampening Schedule (based on habit formation science):
 * - 0-6 days: 0% (no mass yet, habit fragile)
 * - 7-13 days: 50% (habit forming)
 * - 14-20 days: 70% (identity shifting)
 * - 21-29 days: 85% (boulder territory)
 * - 30+ days: 90% (unstoppable)
 * 
 * Returns: Percentage of drop to dampen (0.0 to 0.9)
 */
function getStreakDampening(currentStreak: number): number {
  if (currentStreak < 7) return 0;
  if (currentStreak < 14) return 0.50;
  if (currentStreak < 21) return 0.70;
  if (currentStreak < 30) return 0.85;
  return 0.90;
}

/**
 * Generate contextual message based on momentum and trend
 */
function generateMessage(
  momentum: number,
  trend: 'up' | 'down' | 'stable',
  streak: number,
  dampeningApplied: number
): string {
  // After a drop that was dampened by streak
  if (trend === 'down' && streak >= 7 && dampeningApplied > 0) {
    if (streak >= 21) {
      return "Rough data point. Your pattern is strong - one day doesn't erase who you're becoming.";
    } else if (streak >= 7) {
      return "Off day logged. Your streak absorbed most of the drop.";
    }
  }
  
  // Recovering after a drop
  if (trend === 'up' && momentum < 75) {
    return "Bouncing back. That's what consistency looks like.";
  }
  
  // High momentum zones
  if (momentum >= 80) {
    if (trend === 'up') return "Building momentum 🔥";
    return "Solid pattern. Keep building.";
  }
  
  // Solid range (70-79)
  if (momentum >= 70) {
    return "Solid performance. This is exactly where you should be.";
  }
  
  // Building range (50-69)
  if (momentum >= 50) {
    return "Gaining traction. A few more solid days and you're on track.";
  }
  
  // Low momentum
  if (momentum >= 30) {
    return "Every day is a fresh start. Let's build from here.";
  }
  
  return "Today starts a new pattern. One solid check-in at a time.";
}

/**
 * Calculate how many consecutive days user was absent
 * Used for soft reset detection
 */
function calculateGapDays(last4Days: number[]): number {
  let gapCount = 0;
  for (let i = last4Days.length - 1; i >= 0; i--) {
    if (last4Days[i] === 0) {
      gapCount++;
    } else {
      break; // Stop at first non-zero day
    }
  }
  return gapCount;
}

/**
 * Main momentum calculation function
 * 
 * This implements the Newtonian physics-based momentum system:
 * - Weighted recent performance (velocity)
 * - Streak-based dampening (mass/inertia)
 * - Pattern detection (reality check)
 * - Exercise gate (applied force requirement)
 */
export function calculateNewtonianMomentum(input: MomentumCalculationInput): MomentumResult {
  const {
    todayScore,
    last4Days,
    currentStreak,
    previousMomentum,
    totalRealCheckIns,
    exerciseCompleted
  } = input;
  
  // Step 1: Calculate weighted average (velocity)
  const rawScore = calculateWeightedAverage(todayScore, last4Days);
  
  // Step 2: Determine if this is a drop
  const prevMomentum = previousMomentum ?? 0;
  const isDrop = rawScore < prevMomentum;
  
  let finalScore = rawScore;
  let dampeningApplied = 0;
  
  // Step 3: If dropping, apply streak-based dampening
  if (isDrop) {
    const rawDrop = prevMomentum - rawScore;
    
    // Get base dampening from streak
    const baseDampening = getStreakDampening(currentStreak);
    
    // Adjust dampening based on pattern detection
    const patternMultiplier = detectBadDayPattern(todayScore, last4Days);
    
    // Final dampening (pattern can reduce it)
    const effectiveDampening = baseDampening * patternMultiplier;
    
    // Apply dampening
    const dampenedDrop = rawDrop * (1 - effectiveDampening);
    finalScore = Math.round(prevMomentum - dampenedDrop);
    
    dampeningApplied = effectiveDampening;
  }
  
  // Step 4: Apply ramp cap based on totalRealCheckIns with soft reset
  const gapDays = calculateGapDays(last4Days);
  const hasLongGap = gapDays >= 4; // If 4+ consecutive gap days detected
  
  let effectiveCheckIns = totalRealCheckIns;
  if (hasLongGap && totalRealCheckIns > 3) {
    effectiveCheckIns = 3; // Soft reset after long gap
    console.log(`[Momentum] Soft reset applied: ${totalRealCheckIns} check-ins → ${effectiveCheckIns} effective`);
  }
  
  // Apply ramp cap if under 11 check-ins (or 3 if soft reset)
  if (effectiveCheckIns <= 10) {
    const { score: cappedScore } = applyRampCap(finalScore, effectiveCheckIns);
    finalScore = cappedScore;
  }
  
  // Step 5: Calculate trend and delta
let delta = 0;
let trend: 'up' | 'down' | 'stable' = 'stable';

if (previousMomentum !== undefined) {
  delta = finalScore - prevMomentum;
  if (delta > 2) trend = 'up';
  if (delta < -2) trend = 'down';
}

// Step 6: Generate message
const message = generateMessage(finalScore, trend, currentStreak, dampeningApplied);

return {
  proposedScore: Math.max(0, Math.min(100, finalScore)),
  rawScore,
  dampeningApplied,
  message
};
}

/**
 * Apply ramp cap based on check-in count
 */
function applyRampCap(score: number, checkInCount: number): { score: number; message: string } {
  if (checkInCount === 1) {
    return {
      score: 0,
      message: "Initializing"
    };
  }
  if (checkInCount === 2) {
    return {
      score: Math.round(score * 0.20),
      message: "Building a foundation"
    };
  }
  if (checkInCount === 3) {
    return {
      score: Math.round(score * 0.30),
      message: "Finding your rhythm"
    };
  }
  if (checkInCount <= 6) {
    return {
      score: Math.round(score * 0.60),
      message: "Momentum is forming"
    };
  }
  if (checkInCount <= 10) {
    return {
      score: Math.round(score * 0.80),
      message: "Momentum is forming"
    };
  }
  
  // Check-in 11+: No cap
  return { score, message: "" };
}

/**
 * Calculate daily score from behavior grades
 */
export function calculateDailyScore(behaviorGrades: BehaviorGrade[]): number {
  if (behaviorGrades.length === 0) return 0;
  
  const total = behaviorGrades.reduce((sum, behavior) => sum + behavior.grade, 0);
  const average = total / behaviorGrades.length;
  
  return Math.round(average);
}