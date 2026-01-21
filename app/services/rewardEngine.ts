/**
 * REWARD ENGINE
 * 
 * Handles all acknowledgment and celebration logic for Nelson.
 * This engine follows strict rules:
 * - One response per session maximum
 * - Celebrations are rare and boundary-based
 * - Positive feedback marks forward progress
 * - Completion acknowledgment is fallback only
 * - Silence is common and intentional
 * 
 * Authority: Locked per Canon and Handoff Document
 * Last Updated: January 2026
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type RewardEventType =
  // Completion (fallback only)
  | "session_complete"
  
  // Positive Acknowledgment (forward progress, no celebration)
  | "early_consistency"        // first time hitting 3 OR 7 consecutive days
  | "mid_consistency"          // first time hitting 14 OR 21 consecutive days
  | "solid_day"                // all foundations solid+ including exercise
  | "progress_signal"          // includes 100% momentum, general forward delta
  
  // Celebration (rare, boundary-based)
  | "solid_threshold_crossed"  // first time momentum crosses >= 80%
  | "pattern_confirmed_30"     // first 30 consecutive days
  | "pattern_maintained_30";   // each additional 30-day block thereafter

export type ResponseClass = "completion" | "positive" | "celebration";

export type PayloadAnimation = "none" | "pulse" | "ring" | "confetti" | "burst" | "hero" | "fireworks";

export type PayloadIntensity = "small" | "medium" | "large";

export interface RewardPayload {
  animation: PayloadAnimation;
  intensity: PayloadIntensity;
  text: string;
  shareable: boolean;
}

export interface RewardContext {
  momentum: number;
  previousMomentum: number;
  consecutiveDays: number;
  maxConsecutiveDaysEver: number;
  hasEverHitSolidMomentum: boolean;
  daysSinceLastCheckin: number;
  isSolidDay: boolean;
}

export interface RewardResult {
  event: RewardEventType | null;
  payload: RewardPayload | null;
  stateUpdates?: {
    hasEverHitSolidMomentum?: true;
    maxConsecutiveDaysEver?: number;
  };
}

// ============================================================================
// RESPONSE CONFIGURATION (Locked)
// ============================================================================

const RESPONSE_CONFIG: Record<RewardEventType, {
  class: ResponseClass;
  animation: PayloadAnimation;
  intensity: PayloadIntensity;
  text: string;
  shareable: boolean;
}> = {
  // COMPLETION
  session_complete: {
    class: "completion",
    animation: "none",
    intensity: "small",
    text: "Momentum has been updated.",
    shareable: false,
  },
  
  // POSITIVE ACKNOWLEDGMENT
  early_consistency: {
    class: "positive",
    animation: "pulse",
    intensity: "small",
    text: "Momentum is building.",
    shareable: false,
  },
  
  mid_consistency: {
    class: "positive",
    animation: "pulse",
    intensity: "small",
    text: "This was a strong execution.",
    shareable: false,
  },
  
  solid_day: {
    class: "positive",
    animation: "pulse",
    intensity: "small",
    text: "Solid day. All foundations plus exercise completed.",
    shareable: false,
  },
  
  progress_signal: {
    class: "positive",
    animation: "pulse",
    intensity: "small",
    text: "Forward progress.",
    shareable: false,
  },
  
  // CELEBRATIONS
  solid_threshold_crossed: {
    class: "celebration",
    animation: "hero",
    intensity: "large",
    text: "80% momentum achieved. This pattern is real.",
    shareable: true,
  },
  
  pattern_confirmed_30: {
    class: "celebration",
    animation: "hero",
    intensity: "large",
    text: "30 consecutive check-ins. Pattern established.",
    shareable: true,
  },
  
  pattern_maintained_30: {
    class: "celebration",
    animation: "hero",
    intensity: "large",
    text: "Another 30-day cycle complete. The pattern has been maintained.",
    shareable: true,
  },
};

// ============================================================================
// PRIORITY ORDER (Hard Constraint)
// ============================================================================

const PRIORITY: RewardEventType[] = [
  // Celebrations (highest priority)
  "solid_threshold_crossed",
  "pattern_confirmed_30",
  "pattern_maintained_30",
  
  // Positive acknowledgment
  "mid_consistency",
  "early_consistency",
  "solid_day",
  "progress_signal",
  
  // Completion (lowest priority)
  "session_complete",
];

// ============================================================================
// ELIGIBILITY FUNCTIONS (Pure Boolean Logic)
// ============================================================================

function eligibleSolidThreshold(ctx: RewardContext): boolean {
  return (
    ctx.momentum >= 80 &&
    ctx.previousMomentum < 80 &&
    !ctx.hasEverHitSolidMomentum
  );
}

function eligiblePatternConfirmed30(ctx: RewardContext): boolean {
  return ctx.consecutiveDays === 30;
}

function eligiblePatternMaintained30(ctx: RewardContext): boolean {
  return ctx.consecutiveDays > 30 && ctx.consecutiveDays % 30 === 0;
}

function eligibleEarlyConsistency(ctx: RewardContext): boolean {
  return (
    (ctx.consecutiveDays === 3 || ctx.consecutiveDays === 7) &&
    ctx.maxConsecutiveDaysEver < ctx.consecutiveDays
  );
}

function eligibleMidConsistency(ctx: RewardContext): boolean {
  return (
    (ctx.consecutiveDays === 14 || ctx.consecutiveDays === 21) &&
    ctx.maxConsecutiveDaysEver < ctx.consecutiveDays
  );
}

function eligibleReturnToPattern(ctx: RewardContext): boolean {
  return ctx.daysSinceLastCheckin > 1 && ctx.consecutiveDays === 1;
}

function eligibleSolidDay(ctx: RewardContext): boolean {
  return ctx.isSolidDay;
}

function eligibleProgressSignal(ctx: RewardContext): boolean {
  const delta = ctx.momentum - ctx.previousMomentum;
  return delta >= 5; // Meaningful progress only (5% threshold)
}

function eligibleSessionComplete(): boolean {
  return true; // Always eligible as fallback
}

// ============================================================================
// RUNTIME VALIDATION
// ============================================================================

function assertValidPayload(event: RewardEventType, config: typeof RESPONSE_CONFIG[RewardEventType]): void {
  // Positive acknowledgment cannot use celebration animations
  if (config.class === "positive" && ["burst", "hero", "fireworks"].includes(config.animation)) {
    throw new Error(`[RewardEngine] Positive acknowledgment cannot use celebration animation: ${event}`);
  }
  
  // Celebrations cannot use completion/positive animations
  if (config.class === "celebration" && ["none", "pulse", "ring"].includes(config.animation)) {
    throw new Error(`[RewardEngine] Celebration cannot use non-celebration animation: ${event}`);
  }
  
  // Completion must be silent
  if (config.class === "completion" && config.animation !== "none") {
    throw new Error(`[RewardEngine] Completion acknowledgment must have animation="none": ${event}`);
  }
}

// Validate all configs at module load time
Object.entries(RESPONSE_CONFIG).forEach(([event, config]) => {
  assertValidPayload(event as RewardEventType, config);
});

// ============================================================================
// MAIN RESOLVER (Single Output Guaranteed)
// ============================================================================

export function resolveReward(ctx: RewardContext): RewardResult {
  // Build eligibility map
  const eligibilityMap: Record<RewardEventType, boolean> = {
    solid_threshold_crossed: eligibleSolidThreshold(ctx),
    pattern_confirmed_30: eligiblePatternConfirmed30(ctx),
    pattern_maintained_30: eligiblePatternMaintained30(ctx),
    
    mid_consistency: eligibleMidConsistency(ctx),
    early_consistency: eligibleEarlyConsistency(ctx),
    solid_day: eligibleSolidDay(ctx),
    progress_signal: eligibleProgressSignal(ctx),
    
    session_complete: eligibleSessionComplete(),
  };
  
  // Find highest priority eligible event
  for (const event of PRIORITY) {
    if (eligibilityMap[event]) {
      const config = RESPONSE_CONFIG[event];
      
      // Build state updates if needed
      const stateUpdates: RewardResult['stateUpdates'] = {};
      
      if (event === "solid_threshold_crossed") {
        stateUpdates.hasEverHitSolidMomentum = true;
      }
      
      if (event === "early_consistency" || event === "mid_consistency") {
        stateUpdates.maxConsecutiveDaysEver = ctx.consecutiveDays;
      }
      
      return {
        event,
        payload: {
          animation: config.animation,
          intensity: config.intensity,
          text: config.text,
          shareable: config.shareable,
        },
        stateUpdates: Object.keys(stateUpdates).length > 0 ? stateUpdates : undefined,
      };
    }
  }
  
  // Should never reach here due to session_complete fallback
  return {
    event: null,
    payload: null,
  };
}

// ============================================================================
// UTILITY: Calculate isSolidDay from behavior ratings
// ============================================================================

export function isSolidDay(
  behaviorRatings: Record<string, string>,
  exerciseCompleted: boolean
): boolean {
  const requiredBehaviors = [
    'nutrition_pattern',
    'energy_balance',
    'protein',
    'hydration',
    'sleep',
    'mindset',
    'movement'
  ];
  
  const allBehaviorsSolid = requiredBehaviors.every(id => {
    const rating = behaviorRatings[id];
    return rating === 'elite' || rating === 'solid';
  });
  
  
  // Solid day requires ALL behaviors solid+ AND exercise completed
  return allBehaviorsSolid && exerciseCompleted;
}