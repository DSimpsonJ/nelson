// /app/services/rewardEngine.ts

export type RewardEventType =
  // Micro-Rewards (Always fire)
  | "checkin_submitted"
  | "primary_done"
  
  // Pattern-Rewards (Frequent but meaningful)
  | "streak_3"
  | "streak_7"
  | "return_from_break"
  
  // Milestone-Rewards (Scarce, earned)
  | "level_up"
  | "commitment_complete"
  | "streak_21"
  | "streak_30"
  | "milestone_50"
  | "milestone_100"
  | "perfect_day";

export interface RewardPayload {
  animation: "none" | "pulse" | "ring" | "confetti" | "burst" | "fireworks" | "hero";
  intensity: "small" | "medium" | "large";
  text: string;
  shareable?: boolean;
}

export function getRewardForEvent(
  event: RewardEventType, 
  context?: any
): RewardPayload {
  switch (event) {
    
    // ============================================================================
    // LEVEL 1: MICRO-REWARDS (Always fire)
    // ============================================================================
    
    case "checkin_submitted":
      return {
        animation: "pulse",
        intensity: "small",
        text: "You showed up today! 👊"
      };
    
    case "primary_done":
      return {
        animation: "ring",
        intensity: "small",
        text: "Primary habit locked in."
      };
    
    // ============================================================================
    // LEVEL 2: PATTERN-REWARDS (Frequent but meaningful)
    // ============================================================================
    
    case "streak_3":
  return {
    animation: "confetti",
    intensity: "small",
        text: "Three days in a row. Very nice, momentum is building."
      };
    
      case "streak_7":
        return {
          animation: "hero",
          intensity: "medium",
          text: "One week straight? That's called consistency. Great job!"
        };
    
    case "return_from_break":
      return {
        animation: "hero",
        intensity: "medium",
        text: "Nice job, you're back on track. You got this!"
      };
    
    // ============================================================================
    // LEVEL 3: MILESTONE-REWARDS (Scarce, earned)
    // ============================================================================
    
    case "level_up":
  return {
    animation: "burst",
    intensity: "large",
    text: "You're expanding your capacity and stepping forward. Good stuff!'"
  };
    
    case "commitment_complete":
      return {
        animation: "hero",
        intensity: "large",
        text: "Seven days, boom! You did what you said you'd do, be proud of yourself.",
        shareable: true
      };
    
      case "streak_21":
        return {
          animation: "hero",
          intensity: "large",
          text: "21 days! You're in the zone now, keep up the great work!"
        };
      
      case "streak_30":
        return {
          animation: "hero",
          intensity: "large",
          text: "30 day milestone. This is who you are now. Amazing execution!",
          shareable: true
        };
    
    case "milestone_50":
      return {
        animation: "hero",
        intensity: "large",
        text: "You reached 50 check-ins. This is a big accomplishment!",
        shareable: true
      };
    
    case "milestone_100":
      return {
        animation: "hero",
        intensity: "large",
        text: "You reached 100 check-ins. This is a major milestone. Congrats!",
        shareable: true
      };
    
    case "perfect_day":
      return {
        animation: "fireworks",
        intensity: "large",
        text: "Perfect day. All foundations + primary. This is who you're becoming.",
        shareable: true
      };
    
    default:
      return { 
        animation: "none", 
        intensity: "small", 
        text: "" 
      };
  }
}