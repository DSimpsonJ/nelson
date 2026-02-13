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
  // Acknowledgement
  | "check_in_logged"
  
  // Check-in milestones
  | "milestone_burst"
  | "milestone_confetti"
  | "milestone_fireworks"
  
  // Performance celebrations (first-time only)
  | "first_80_momentum"
  | "first_90_momentum"
  | "first_100_momentum"
  
  // Performance celebrations (repeatable)
  | "perfect_day"
  | "solid_week";

export type ResponseClass = "completion" | "positive" | "celebration";

export type PayloadAnimation = "none" | "pulse" | "ring" | "confetti" | "burst" | "hero" | "fireworks";

export type PayloadIntensity = "small" | "medium" | "large";

export interface RewardPayload {
  animation: PayloadAnimation;
  intensity: PayloadIntensity;
  text: string;
  secondaryText: string;
  shareable: boolean;
}

export interface RewardContext {
  totalRealCheckIns: number;
  momentum: number;
  hasEverHit80Momentum: boolean;
  hasEverHit90Momentum: boolean;
  hasEverHit100Momentum: boolean;
  isPerfectDay: boolean;
  isSolidWeek: boolean;
}

export interface RewardResult {
  event: RewardEventType | null;
  payload: RewardPayload | null;
  stateUpdates?: {
    hasEverHit80Momentum?: true;
    hasEverHit90Momentum?: true;
    hasEverHit100Momentum?: true;
  };
}

// ============================================================================
// RESPONSE CONFIGURATION (Locked)
// ============================================================================

const RESPONSE_CONFIG: Record<RewardEventType, {
  class: ResponseClass;
  animation: PayloadAnimation;
  intensity: PayloadIntensity;
  primaryText: string;
  secondaryText: string;
  shareable: boolean;
  dynamic?: (ctx: RewardContext) => { primaryText: string; secondaryText: string };
}> = {
  // ACKNOWLEDGEMENT
  check_in_logged: {
    class: "positive",
    animation: "ring",
    intensity: "small",
    primaryText: "Check-in logged.",
    secondaryText: "",
    shareable: false,
  },
  
  // CHECK-IN MILESTONES - BURST
  milestone_burst: {
    class: "positive",
    animation: "burst",
    intensity: "medium",
    primaryText: "", // Dynamic
    secondaryText: "Momentum is building.",
    shareable: false,
    dynamic: (ctx) => ({
      primaryText: `That's ${ctx.totalRealCheckIns} check-ins!`,
      secondaryText: "Momentum is building.",
    }),
  },
  
  // CHECK-IN MILESTONES - CONFETTI
  milestone_confetti: {
    class: "celebration",
    animation: "confetti",
    intensity: "large",
    primaryText: "", // Dynamic
    secondaryText: "This is real progress.",
    shareable: true,
    dynamic: (ctx) => {
      if (ctx.totalRealCheckIns === 10) {
        return {
          primaryText: "That's 10 check-ins!",
          secondaryText: "Double digits. Keep going.",
        };
      }
      return {
        primaryText: `That's ${ctx.totalRealCheckIns} check-ins!`,
        secondaryText: "This is real progress.",
      };
    },
  },
  
  // CHECK-IN MILESTONES - FIREWORKS
  milestone_fireworks: {
    class: "celebration",
    animation: "fireworks",
    intensity: "large",
    primaryText: "", // Dynamic
    secondaryText: "You've built something here.",
    shareable: true,
    dynamic: (ctx) => {
      if (ctx.totalRealCheckIns === 25) {
        return {
          primaryText: "That's 25 check-ins!",
          secondaryText: "You've built something here.",
        };
      }
      if (ctx.totalRealCheckIns === 50) {
        return {
          primaryText: "That's 50 check-ins!",
          secondaryText: "This pattern is undeniable.",
        };
      }
      if (ctx.totalRealCheckIns === 100) {
        return {
          primaryText: "That's 100 check-ins!",
          secondaryText: "This is who you are now.",
        };
      }
      return {
        primaryText: `That's ${ctx.totalRealCheckIns} check-ins!`,
        secondaryText: "The pattern continues.",
      };
    },
  },
  
  // FIRST-TIME MOMENTUM MILESTONES
  first_80_momentum: {
    class: "celebration",
    animation: "confetti",
    intensity: "large",
    primaryText: "You hit 80% momentum!",
    secondaryText: "This pattern is real.",
    shareable: true,
  },
  
  first_90_momentum: {
    class: "celebration",
    animation: "confetti",
    intensity: "large",
    primaryText: "You hit 90% momentum!",
    secondaryText: "This is excellence.",
    shareable: true,
  },
  
  first_100_momentum: {
    class: "celebration",
    animation: "fireworks",
    intensity: "large",
    primaryText: "Perfect momentum!",
    secondaryText: "This is who you are now.",
    shareable: true,
  },
  
  // REPEATABLE PERFORMANCE CELEBRATIONS
  perfect_day: {
    class: "celebration",
    animation: "confetti",
    intensity: "large",
    primaryText: "Perfect day!",
    secondaryText: "All behaviors elite.",
    shareable: true,
  },
  
  solid_week: {
    class: "celebration",
    animation: "fireworks",
    intensity: "large",
    primaryText: "Solid week complete!",
    secondaryText: "Seven days of execution.",
    shareable: true,
  },
};

// ============================================================================
// PRIORITY ORDER (Hard Constraint)
// ============================================================================

const PRIORITY: RewardEventType[] = [
  // Performance celebrations - fireworks (highest priority)
  "solid_week",
  "first_100_momentum",
  "milestone_fireworks",
  
  // Performance celebrations - confetti
  "first_90_momentum",
  "first_80_momentum",
  "perfect_day",
  "milestone_confetti",
  
  // Milestone celebrations - burst
  "milestone_burst",
  
  // Acknowledgement (fallback)
  "check_in_logged",
];

// ============================================================================
// ELIGIBILITY FUNCTIONS (Pure Boolean Logic)
// ============================================================================

// ============================================================================
// MILESTONE MAP
// ============================================================================

const MILESTONE_MAP: Record<number, 'burst' | 'confetti' | 'fireworks'> = {
  // Block 1 (1-25)
  3: 'burst',
  10: 'confetti',
  15: 'burst',
  20: 'confetti',
  25: 'fireworks',
  
  // Block 2 (26-50)
  30: 'burst',
  35: 'burst',
  40: 'confetti',
  45: 'burst',
  50: 'fireworks',
};

function getCelebrationLevel(totalCheckIns: number): 'burst' | 'confetti' | 'fireworks' | null {
  // Direct match in milestone map
  if (MILESTONE_MAP[totalCheckIns]) {
    return MILESTONE_MAP[totalCheckIns];
  }
  
  // Every 50 thereafter = fireworks (75, 100, 150, 200...)
  if (totalCheckIns > 50 && totalCheckIns % 50 === 0) {
    return 'fireworks';
  }
  
  // Pattern repeats every 25 check-ins after first 50
  if (totalCheckIns > 50) {
    const positionIn25 = ((totalCheckIns - 50) % 25);
    const offset = 50 + positionIn25;
    
    // Map to equivalent position in 26-50 block
    const equivalentCheckIn = 25 + (positionIn25 + 1);
    if (MILESTONE_MAP[equivalentCheckIn]) {
      return MILESTONE_MAP[equivalentCheckIn];
    }
  }
  
  return null;
}

// ============================================================================
// ELIGIBILITY FUNCTIONS
// ============================================================================

// Check-in milestones
function eligibleMilestoneBurst(ctx: RewardContext): boolean {
  return getCelebrationLevel(ctx.totalRealCheckIns) === 'burst';
}

function eligibleMilestoneConfetti(ctx: RewardContext): boolean {
  return getCelebrationLevel(ctx.totalRealCheckIns) === 'confetti';
}

function eligibleMilestoneFireworks(ctx: RewardContext): boolean {
  return getCelebrationLevel(ctx.totalRealCheckIns) === 'fireworks';
}

// First-time momentum milestones
function eligibleFirst80Momentum(ctx: RewardContext): boolean {
  return ctx.momentum >= 80 && !ctx.hasEverHit80Momentum;
}

function eligibleFirst90Momentum(ctx: RewardContext): boolean {
  return ctx.momentum >= 90 && !ctx.hasEverHit90Momentum;
}

function eligibleFirst100Momentum(ctx: RewardContext): boolean {
  return ctx.momentum >= 100 && !ctx.hasEverHit100Momentum;
}

// Repeatable performance celebrations
function eligiblePerfectDay(ctx: RewardContext): boolean {
  return ctx.isPerfectDay;
}

function eligibleSolidWeek(ctx: RewardContext): boolean {
  return ctx.isSolidWeek;
}

// Fallback
function eligibleCheckInLogged(): boolean {
  return true;
}

// ============================================================================
// RUNTIME VALIDATION
// ============================================================================

function assertValidPayload(event: RewardEventType, config: typeof RESPONSE_CONFIG[RewardEventType]): void {
  const validAnimations: Record<RewardEventType, PayloadAnimation[]> = {
    check_in_logged: ["ring"],
    milestone_burst: ["burst"],
    milestone_confetti: ["confetti"],
    milestone_fireworks: ["fireworks"],
    first_80_momentum: ["confetti"],
    first_90_momentum: ["confetti"],
    first_100_momentum: ["fireworks"],
    perfect_day: ["confetti"],
    solid_week: ["fireworks"],
  };
  
  const allowedAnimations = validAnimations[event];
  if (!allowedAnimations.includes(config.animation)) {
    throw new Error(
      `[RewardEngine] ${event} must use one of: ${allowedAnimations.join(", ")}. Got: ${config.animation}`
    );
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
    solid_week: eligibleSolidWeek(ctx),
    first_100_momentum: eligibleFirst100Momentum(ctx),
    milestone_fireworks: eligibleMilestoneFireworks(ctx),
    
    first_90_momentum: eligibleFirst90Momentum(ctx),
    first_80_momentum: eligibleFirst80Momentum(ctx),
    perfect_day: eligiblePerfectDay(ctx),
    milestone_confetti: eligibleMilestoneConfetti(ctx),
    
    milestone_burst: eligibleMilestoneBurst(ctx),
    
    check_in_logged: eligibleCheckInLogged(),
  };
  
  // Find highest priority eligible event
  for (const event of PRIORITY) {
    if (eligibilityMap[event]) {
      const config = RESPONSE_CONFIG[event];
      
      // Use dynamic text if available, otherwise use static
      const { primaryText, secondaryText } = config.dynamic 
        ? config.dynamic(ctx)
        : { primaryText: config.primaryText, secondaryText: config.secondaryText };
      
      // Build state updates for first-time achievements
      const stateUpdates: RewardResult['stateUpdates'] = {};
      
      if (event === "first_80_momentum") {
        stateUpdates.hasEverHit80Momentum = true;
      }
      if (event === "first_90_momentum") {
        stateUpdates.hasEverHit90Momentum = true;
      }
      if (event === "first_100_momentum") {
        stateUpdates.hasEverHit100Momentum = true;
      }
      
      return {
        event,
        payload: {
          animation: config.animation,
          intensity: config.intensity,
          text: primaryText,
          secondaryText: secondaryText,
          shareable: config.shareable,
        },
        stateUpdates: Object.keys(stateUpdates).length > 0 ? stateUpdates : undefined,
      };
    }
  }
  
  // Should never reach here due to check_in_logged fallback
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
    'nutrition_quality',
    'portion_control',
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