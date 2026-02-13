/**
 * CELEBRATION TRIGGERS
 * 
 * Detects behavioral wins and generates celebration context for the AI prompt.
 * 
 * Philosophy:
 * - A human coach would pause on a win before discussing problems
 * - Celebration should feel earned, not automated
 * - Different levels of achievement get different warmth
 * - Solid is the target, Elite is acknowledged but not over-encouraged
 * - Even during rough weeks, wins exist and should be seen
 * 
 * Tiers (per behavior, per week):
 * 
 *   TIER 4 - "Perfect Week" (100% every day, all 7 days)
 *     → High praise. This is genuinely hard to do. Name it, respect it.
 *     → "Protein was perfect all seven days. That takes real intention."
 * 
 *   TIER 3 - "Strong Week" (80%+ every day, at least one day < 100%)
 *     → Warm praise. Consistency without a single miss is notable.
 *     → "Hydration didn't drop below Solid a single day this week."
 * 
 *   TIER 2 - "Excellent Average" (90-100% weekly average, but not every day 80+)
 *     → Respectful recognition. High performance even with variance.
 *     → "Sleep averaged 93% this week, your strongest category."
 * 
 *   TIER 1 - "Solid Average" (80-89% weekly average)
 *     → Acknowledgment. This is the target. Normalize it.
 *     → "Protein held steady at Solid this week."
 * 
 * The output is prompt text that tells the AI exactly how to celebrate,
 * with tone examples calibrated to each tier.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CelebrationItem {
    behavior: string;
    tier: 1 | 2 | 3 | 4;
    tierLabel: 'solid_average' | 'excellent_average' | 'strong_week' | 'perfect_week';
    average: number;
    allDaysSolid: boolean;    // Every day >= 80
    allDaysElite: boolean;    // Every day === 100
    daysWithData: number;
  }
  
  export interface CelebrationResult {
    celebrations: CelebrationItem[];
    promptText: string;        // Ready-to-inject prompt section
    hasCelebrations: boolean;
  }
  
  // ============================================================================
  // DETECTION
  // ============================================================================
  
  /**
   * Detect celebration-worthy performances from weekly behavior data.
   * Requires a full 7-day week with data for each behavior.
   */
  export function detectCelebrations(
    weekData: Array<{
      behaviorGrades: Array<{ name: string; grade: number }>;
    }>
  ): CelebrationResult {
    const celebrations: CelebrationItem[] = [];
  
    const behaviorNames = [
      { key: 'nutrition_quality', label: 'Nutrition Pattern' },
      { key: 'portion_control', label: 'Energy Balance' },
      { key: 'protein', label: 'Protein' },
      { key: 'hydration', label: 'Hydration' },
      { key: 'sleep', label: 'Sleep' },
      { key: 'mindset', label: 'Mindset' },
      { key: 'movement', label: 'Movement' },
    ];
  
    for (const behavior of behaviorNames) {
      const grades = weekData
        .map(day => {
          const found = day.behaviorGrades?.find(
            (b: { name: string; grade: number }) => b.name === behavior.key
          );
          return found?.grade ?? 0;
        })
        .filter(g => g > 0); // Only count days with actual ratings
  
      if (grades.length < 7) continue; // Need full week
  
      const average = Math.round(
        grades.reduce((sum, g) => sum + g, 0) / grades.length
      );
      const allDaysElite = grades.every(g => g === 100);
      const allDaysSolid = grades.every(g => g >= 80);
  
      // Determine tier
      let tier: 1 | 2 | 3 | 4 | null = null;
      let tierLabel: CelebrationItem['tierLabel'] | null = null;
  
      if (allDaysElite) {
        tier = 4;
        tierLabel = 'perfect_week';
      } else if (allDaysSolid) {
        tier = 3;
        tierLabel = 'strong_week';
      } else if (average >= 90) {
        tier = 2;
        tierLabel = 'excellent_average';
      } else if (average >= 80) {
        tier = 1;
        tierLabel = 'solid_average';
      }
  
      if (tier && tierLabel) {
        celebrations.push({
          behavior: behavior.label,
          tier,
          tierLabel,
          average,
          allDaysSolid,
          allDaysElite,
          daysWithData: grades.length,
        });
      }
    }
  
    // Sort: highest tier first, then alphabetical within same tier
    celebrations.sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      return a.behavior.localeCompare(b.behavior);
    });
  
    const promptText = buildCelebrationPrompt(celebrations);
  
    return {
      celebrations,
      promptText,
      hasCelebrations: celebrations.length > 0,
    };
  }
  
  // ============================================================================
  // PROMPT BUILDER
  // ============================================================================
  
  /**
   * Build celebration prompt text with tier-appropriate tone guidance.
   * This gets injected into the system prompt so the AI knows how to celebrate.
   */
  function buildCelebrationPrompt(celebrations: CelebrationItem[]): string {
    if (celebrations.length === 0) {
      return '';
    }
  
    const lines: string[] = [];
  
    lines.push('# WINS THIS WEEK (Celebrate these in Pattern section)');
    lines.push('');
    lines.push(
      'The following behaviors earned recognition. Acknowledge them in your Pattern section BEFORE discussing problems. Linger on these for a beat. A good coach makes people feel seen.'
    );
    lines.push('');
  
    // Group by tier for cleaner prompt
    const tier4 = celebrations.filter(c => c.tier === 4);
    const tier3 = celebrations.filter(c => c.tier === 3);
    const tier2 = celebrations.filter(c => c.tier === 2);
    const tier1 = celebrations.filter(c => c.tier === 1);
  
    if (tier4.length > 0) {
      lines.push('## PERFECT WEEK (100% every single day)');
      for (const c of tier4) {
        lines.push(`- ${c.behavior}: 100% all 7 days`);
      }
      lines.push('');
      lines.push(
        'This is genuinely impressive. Say so directly. Not with hype or exclamation marks, but with real respect. This took daily intention and follow-through.'
      );
      lines.push(
        'Tone: "Protein was perfect all seven days. That doesn\'t happen by accident, that\'s real consistency."'
      );
      lines.push(
        'Do NOT minimize this by immediately pivoting to what went wrong. Give it a full sentence of its own.'
      );
      lines.push('');
    }
  
    if (tier3.length > 0) {
      lines.push('## STRONG WEEK (Solid or better every day, no misses)');
      for (const c of tier3) {
        lines.push(`- ${c.behavior}: ${c.average}% average, never dropped below Solid`);
      }
      lines.push('');
      lines.push(
        'Not a single off day in this behavior. That\'s worth naming. Warm and genuine.'
      );
      lines.push(
        'Tone: "Hydration didn\'t drop below Solid once this week. That kind of consistency is exactly what builds momentum."'
      );
      lines.push('');
    }
  
    if (tier2.length > 0) {
      lines.push('## EXCELLENT AVERAGE (90%+ weekly average)');
      for (const c of tier2) {
        lines.push(`- ${c.behavior}: ${c.average}% average`);
      }
      lines.push('');
      lines.push(
        'High average, though there may have been variance day-to-day. Recognize the strength without overstating it.'
      );
      lines.push(
        'Tone: "Sleep averaged 93% this week, your strongest recovery signal."'
      );
      lines.push('');
    }
  
    if (tier1.length > 0) {
      lines.push('## SOLID WEEK (80%+ average, the target)');
      for (const c of tier1) {
        lines.push(`- ${c.behavior}: ${c.average}% average`);
      }
      lines.push('');
      lines.push(
        'This is the sustainable target. Acknowledge without fanfare. Normalizing Solid is the goal.'
      );
      lines.push(
        'Tone: "Protein held Solid this week." (Simple, clean, moves on.)'
      );
      lines.push('');
    }
  
    return lines.join('\n');
  }