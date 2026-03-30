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

interface BehaviorRatingSummary {
  name: string;
  elite: number;
  solid: number;
  notGreat: number;
  off: number;
  total: number;
}

interface EarlyUserPromptArgs {
  checkInsThisWeek: number;
  totalLifetimeCheckIns: number;
  accountAgeDays: number;
  behaviorRatings: BehaviorRatingSummary[];
  patternType: 'insufficient_data' | 'building_foundation';
}

export function buildEarlyUserPrompt(args: EarlyUserPromptArgs): string {
  const { checkInsThisWeek, totalLifetimeCheckIns, accountAgeDays, behaviorRatings, patternType } = args;

  const behaviorLabels: Record<string, string> = {
    nutrition_quality: 'nutrition',
    portion_control: 'portion control',
    protein: 'protein',
    hydration: 'hydration',
    sleep: 'sleep',
    movement: 'movement',
  };

  // Only behaviors with at least one rating, mindset excluded
  const rated = behaviorRatings
    .filter(b => b.name !== 'mindset' && b.total > 0)
    .map(b => {
      const label = behaviorLabels[b.name] ?? b.name;
      const parts: string[] = [];
      if (b.elite > 0) parts.push(`${b.elite} Elite`);
      if (b.solid > 0) parts.push(`${b.solid} Solid`);
      if (b.notGreat > 0) parts.push(`${b.notGreat} Not Great`);
      if (b.off > 0) parts.push(`${b.off} Off`);
      return `- ${label}: ${parts.join(', ')} (${b.total} check-in${b.total > 1 ? 's' : ''})`;
    });

  const dataContext = rated.length > 0
    ? `Behavior data so far (rating counts, not averages):\n${rated.join('\n')}`
    : 'No behavior data available yet.';

  const daysAvailable = Math.min(accountAgeDays, 7);
  const hasMeaningfulData = totalLifetimeCheckIns >= 3;

  return `You are Nelson, an evidence-based personal health coach. You are direct, warm, and honest. You never guilt, never hype, never use motivational poster language.

This user is early in their Nelson journey. You are still getting to know them. Do not manufacture insights from thin data.

- Account age: ${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'}
- Days available to check in: ${daysAvailable}
- Check-ins completed this week: ${checkInsThisWeek} of ${daysAvailable} days available
- Total lifetime check-ins: ${totalLifetimeCheckIns}
- Pattern type: ${patternType}

${dataContext}

Rules:
- Do not produce percentages or averages. Use qualitative language only: "consistently solid", "mostly off", "mixed", "one strong check-in so far".
- Acknowledge limited data honestly and briefly. Do not pretend you have more signal than you do.
- If one behavior genuinely stands out across check-ins (consistently high or consistently low), name it. If nothing stands out clearly, say so.
- Tension field: if fewer than 3 lifetime check-ins, set tension to "Not enough check-ins yet to identify a clear pattern." Do not force a tension observation from 1-2 data points.
- Tell them next Monday's coaching will have more to work with as data builds.
- No exclamation marks. No "You've got this" or any motivational filler. No guilt language.
- Sound like a person, not a system. Keep it short.
- Never reference 7 days if the account is less than 7 days old.
- Mindset is a mental state tracked for context only. Never flag it as a tension area.

Respond with ONLY this JSON, no markdown, no preamble:

{
  "pattern": "string (2 sentences max — what you genuinely observe so far, qualitatively)",
  "tension": "string (1-2 sentences — one honest area to watch, or state insufficient data if fewer than 3 check-ins)",
  "whyThisMatters": "string (2-3 sentences — why consistent check-ins matter right now, forward-looking)",
  "progression": {
    "text": "string (1 sentence — one simple thing to focus on this week)",
    "type": "advance"
  }
}`;
}

/**
 * Calculate behavior rating counts from raw momentum docs.
 * Returns counts per rating tier, not averages.
 * Called in route.ts before building the early user prompt.
 */
export function calculateEarlyBehaviorRatings(
  weekData: Array<{ behaviorGrades?: Array<{ name: string; grade: number }> }>
): BehaviorRatingSummary[] {
  const behaviorNames = [
    'nutrition_quality', 'portion_control', 'protein',
    'hydration', 'sleep', 'mindset', 'movement'
  ];

  return behaviorNames.map(name => {
    const grades = weekData
      .flatMap(day => day.behaviorGrades ?? [])
      .filter(b => b.name === name)
      .map(b => b.grade);

    const elite   = grades.filter(g => g === 100).length;
    const solid   = grades.filter(g => g === 80).length;
    const notGreat = grades.filter(g => g === 50).length;
    const off     = grades.filter(g => g === 0).length;

    return { name, elite, solid, notGreat, off, total: grades.length };
  });
}

// Keep old export name as alias so any other callers don't break
export const calculateEarlyBehaviorAverages = calculateEarlyBehaviorRatings;