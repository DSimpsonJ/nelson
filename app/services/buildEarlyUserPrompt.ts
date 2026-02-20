/**
 * EARLY USER COACHING PROMPT
 *
 * Used when canCoach is false (insufficient_data or building_foundation).
 * Bypasses the full pattern/constraint machinery entirely.
 * Produces a simple, honest, human-sounding card based on whatever data exists.
 *
 * Output matches the same JSON structure as the full coaching system
 * so the frontend renders it identically.
 */

interface BehaviorSummary {
    name: string;
    average: number;
  }
  
  interface EarlyUserPromptArgs {
    checkInsThisWeek: number;
    totalLifetimeCheckIns: number;
    behaviorAverages: BehaviorSummary[]; // whatever data exists, can be sparse
    patternType: 'insufficient_data' | 'building_foundation';
  }
  
  export function buildEarlyUserPrompt(args: EarlyUserPromptArgs): string {
    const { checkInsThisWeek, totalLifetimeCheckIns, behaviorAverages, patternType } = args;
  
    // Sort behaviors: highest average first, lowest last
    const sorted = [...behaviorAverages]
      .filter(b => b.average > 0)
      .sort((a, b) => b.average - a.average);
  
    const topBehavior = sorted[0] ?? null;
    const bottomBehavior = sorted[sorted.length - 1] ?? null;
  
    // Label map for human-readable behavior names
    const behaviorLabels: Record<string, string> = {
      nutrition_quality: 'nutrition',
      portion_control: 'portion control',
      protein: 'protein',
      hydration: 'hydration',
      sleep: 'sleep',
      mindset: 'mindset',
      movement: 'movement',
    };
  
    const topLabel = topBehavior ? (behaviorLabels[topBehavior.name] ?? topBehavior.name) : null;
    const bottomLabel = bottomBehavior && bottomBehavior.name !== topBehavior?.name
      ? (behaviorLabels[bottomBehavior.name] ?? bottomBehavior.name)
      : null;
  
    const dataContext = sorted.length > 0
      ? `Behavior data so far:\n${sorted.map(b => `- ${behaviorLabels[b.name] ?? b.name}: ${Math.round(b.average)}%`).join('\n')}`
      : 'No behavior data available yet.';
  
    return `You are Nelson, an evidence-based personal health coach. You are direct, warm, and honest. You never guilt, never hype, never use motivational poster language.
  
  This user is early in their Nelson journey.
  - Check-ins this week: ${checkInsThisWeek}
  - Total lifetime check-ins: ${totalLifetimeCheckIns}
  - Pattern type: ${patternType}
  
  ${dataContext}
  
  ${topLabel ? `Their strongest area so far is ${topLabel} (${Math.round(topBehavior!.average)}%).` : ''}
  ${bottomLabel ? `Their lowest area so far is ${bottomLabel} (${Math.round(bottomBehavior!.average)}%).` : ''}
  
  Write a brief, honest coaching card for this early user. The tone should feel like a calm, smart friend checking in — not a fitness app, not a coach trying to motivate them.
  
  Rules:
  - Acknowledge they don't have much data yet, factually and briefly
  - Call out one genuine positive from what little data exists (or just the fact that they showed up)
  - Note one area that looks like it needs attention, without drama
  - Tell them to keep checking in and that next Monday's briefing will have more to work with
  - No exclamation marks
  - No "You've got this" or any motivational filler
  - No guilt language
  - Sound like a person, not a system
  - Keep it short — this is not a full coaching report
  
  Respond with ONLY this JSON, no markdown, no preamble:
  
  {
    "pattern": "string (2 sentences max — what you see so far, factually)",
    "tension": "string (1-2 sentences — the one area to watch)",
    "whyThisMatters": "string (2-3 sentences — why checking in consistently matters right now, forward-looking)",
    "progression": {
      "text": "string (1 sentence — one simple thing to focus on this week)",
      "type": "advance"
    }
  }`;
  }
  
  /**
   * Calculate behavior averages from raw momentum docs
   * Called in route.ts before building the early user prompt
   */
  export function calculateEarlyBehaviorAverages(
    weekData: Array<{ behaviorGrades?: Array<{ name: string; grade: number }> }>
  ): BehaviorSummary[] {
    const behaviorNames = [
      'nutrition_quality', 'portion_control', 'protein',
      'hydration', 'sleep', 'mindset', 'movement'
    ];
  
    return behaviorNames.map(name => {
      const grades = weekData
        .flatMap(day => day.behaviorGrades ?? [])
        .filter(b => b.name === name)
        .map(b => b.grade);
  
      const average = grades.length > 0
        ? grades.reduce((sum, g) => sum + g, 0) / grades.length
        : 0;
  
      return { name, average };
    });
  }