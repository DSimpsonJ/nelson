/**
 * BEHAVIORAL DATA SCOPING
 * 
 * Filters behavioral data so the AI only receives detailed information
 * about the PRIMARY CONSTRAINT behavior. All other behaviors get a
 * one-line qualitative summary with no numbers, no deltas, no patterns.
 * 
 * This is the primary defense against cross-behavior causality.
 * The AI can't build a causal chain to sleep if it doesn't have
 * sleep deltas, sleep day patterns, or sleep-related notes.
 * 
 * Philosophy:
 * - Remove the raw material for cross-behavior reasoning
 * - Keep enough context to acknowledge wins (qualitative only)
 * - Filter user notes that would reintroduce non-constraint behaviors
 * - Let validation catch anything that slips through
 */

import { WeeklyConstraintSnapshot } from '@/app/services/deriveWeeklyConstraints';
import { DayOfWeekAnalysis } from '@/app/services/detectDayOfWeekPatterns';

// ============================================================================
// TYPES
// ============================================================================

export interface ScopedBehavioralData {
  /** Full detail for the constraint behavior: averages, deltas, day patterns */
  constraintDetail: string;
  
  /** One-line qualitative summary of all other behaviors (no numbers) */
  backgroundSummary: string;
  
  /** User notes filtered to only include constraint-relevant content */
  filteredNotes: string[];
  
  /** Which notes were dropped and why (for logging) */
  droppedNotes: Array<{ note: string; reason: string }>;
  
  /** What the constraint behavior is, for reference */
  constraintBehavior: string;
}

interface WeekOverWeekChange {
  behavior: string;
  currentAvg: number;
  previousAvg: number;
  delta: number;
  direction: 'up' | 'down' | 'flat';
}

// ============================================================================
// BEHAVIOR MAPPING
// ============================================================================

/**
 * Maps dominant limiter values to the behavior names used in data.
 * 
 * The dominant limiter from deriveWeeklyConstraints uses terms like
 * "nutrition", "recovery", "consistency", "progression". These map
 * to specific behavior names in weekOverWeekChanges and dayPatterns.
 */
const LIMITER_TO_BEHAVIORS: Record<string, string[]> = {
  'nutrition': ['nutrition pattern', 'energy balance', 'nutrition_pattern', 'protein'],
  'recovery': ['sleep'],
  'consistency': ['movement', 'exercise'],
  'progression': [], // All behaviors are relevant for progression limiter
  'time': ['movement', 'exercise'],
};

/**
 * Keywords in user notes that relate to specific behaviors.
 * Used to filter notes that would reintroduce non-constraint topics.
 */
const BEHAVIOR_NOTE_KEYWORDS: Record<string, string[]> = {
  'nutrition': ['food', 'meal', 'eat', 'eating', 'prep', 'cook', 'diet', 'calories', 'snack', 'lunch', 'dinner', 'breakfast', 'protein', 'carbs', 'fasting', 'hunger', 'hungry'],
  'sleep': ['sleep', 'bed', 'bedtime', 'phone', 'screen', 'wake', 'woke', 'tired', 'rest', 'nap', 'insomnia', 'night'],
  'hydration': ['water', 'hydrat', 'drink', 'drank', 'thirst', 'dehydrat'],
  'protein': ['protein', 'shake', 'supplement'],
  'movement': ['exercise', 'workout', 'gym', 'walk', 'run', 'lift', 'train', 'movement', 'steps'],
  'mindset': ['stress', 'anxious', 'anxiety', 'mental', 'mood', 'mindset', 'overwhelm'],
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Scope behavioral data to the primary constraint.
 * 
 * Returns detailed data ONLY for the constraint behavior,
 * qualitative summaries for everything else, and filtered notes.
 * 
 * @param dominantLimiter - The system-determined primary constraint
 * @param weeklyConstraints - Full weekly constraint snapshot
 * @param weekOverWeekChanges - Deltas from previous week
 * @param dayPatterns - Day-of-week analysis
 * @param userNotes - Raw user notes from check-ins
 */
export function scopeBehavioralData(
  dominantLimiter: string,
  weeklyConstraints: WeeklyConstraintSnapshot,
  weekOverWeekChanges?: WeekOverWeekChange[],
  dayPatterns?: DayOfWeekAnalysis,
  userNotes?: string[]
): ScopedBehavioralData {
  
  const limiter = dominantLimiter.toLowerCase();
  const relevantBehaviors = LIMITER_TO_BEHAVIORS[limiter] || [];
  
  // If progression limiter, show everything (all behaviors matter)
  if (limiter === 'progression') {
    return buildFullScope(weeklyConstraints, weekOverWeekChanges, dayPatterns, userNotes);
  }
  
  // ---- CONSTRAINT DETAIL ----
  const constraintDetail = buildConstraintDetail(
    limiter,
    relevantBehaviors,
    weeklyConstraints,
    weekOverWeekChanges,
    dayPatterns
  );
  
  // ---- BACKGROUND SUMMARY ----
  const backgroundSummary = buildBackgroundSummary(
    limiter,
    relevantBehaviors,
    weeklyConstraints,
    weekOverWeekChanges
  );
  
  // ---- FILTERED NOTES ----
  const { filtered, dropped } = filterUserNotes(limiter, relevantBehaviors, userNotes || []);
  
  return {
    constraintDetail,
    backgroundSummary,
    filteredNotes: filtered,
    droppedNotes: dropped,
    constraintBehavior: limiter,
  };
}

// ============================================================================
// CONSTRAINT DETAIL BUILDER
// ============================================================================

/**
 * Build full detail string for the constraint behavior only.
 * Includes: averages, week-over-week deltas, day-of-week patterns.
 */
function buildConstraintDetail(
  limiter: string,
  relevantBehaviors: string[],
  snapshot: WeeklyConstraintSnapshot,
  weekOverWeekChanges?: WeekOverWeekChange[],
  dayPatterns?: DayOfWeekAnalysis
): string {
  const lines: string[] = [];
  
  // Averages for constraint behavior
  if (limiter === 'nutrition') {
    lines.push(`Nutrition average: ${Math.round(snapshot.nutritionAverage)}% (pattern + energy balance combined)`);
    lines.push(`Protein average: ${Math.round(snapshot.proteinAverage)}%`);
  } else if (limiter === 'recovery') {
    lines.push(`Sleep average: ${Math.round(snapshot.sleepAverage)}%`);
    lines.push(`Sleep consistency: ${Math.round(snapshot.sleepConsistency * 100)}% of days at Solid or better`);
  } else if (limiter === 'consistency' || limiter === 'time') {
    lines.push(`Training frequency: ${snapshot.trainingFrequency} days this week`);
  }
  
  // Week-over-week deltas for constraint behavior only
  if (weekOverWeekChanges && weekOverWeekChanges.length > 0) {
    const constraintChanges = weekOverWeekChanges.filter(c => 
      isRelevantBehavior(c.behavior, relevantBehaviors)
    );
    
    if (constraintChanges.length > 0) {
      lines.push('');
      lines.push('Week-over-week change:');
      for (const c of constraintChanges) {
        const arrow = c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→';
        lines.push(`  ${c.behavior}: ${c.previousAvg} → ${c.currentAvg} (${c.delta > 0 ? '+' : ''}${c.delta}) ${arrow}`);
      }
    }
  }
  
  // Day-of-week patterns for constraint behavior only
  if (dayPatterns && dayPatterns.hasSignificantPatterns) {
    const constraintPatterns = dayPatterns.patterns.filter(p =>
      isRelevantBehavior(p.behavior, relevantBehaviors)
    );
    
    if (constraintPatterns.length > 0) {
      lines.push('');
      lines.push('Day-of-week patterns:');
      for (const p of constraintPatterns) {
        lines.push(`  ${p.behavior}: ${p.pattern}`);
        lines.push(`    Weekday avg: ${p.weekdayAvg}, Weekend avg: ${p.weekendAvg}`);
        lines.push(`    Worst day: ${p.worstDay} (${p.worstDayAvg}), Best day: ${p.bestDay} (${p.bestDayAvg})`);
      }
    }
  }
  
  return lines.join('\n');
}

// ============================================================================
// BACKGROUND SUMMARY BUILDER
// ============================================================================

/**
 * Build one-line qualitative summary for non-constraint behaviors.
 * No numbers. No deltas. No patterns. Just "strong/adequate/variable".
 * 
 * This gives the AI enough to acknowledge wins without building
 * causal chains to other behaviors.
 */
function buildBackgroundSummary(
  limiter: string,
  relevantBehaviors: string[],
  snapshot: WeeklyConstraintSnapshot,
  weekOverWeekChanges?: WeekOverWeekChange[]
): string {
  const parts: string[] = [];
  
  // Only include behaviors that are NOT the constraint
  if (limiter !== 'recovery') {
    parts.push(`Sleep: ${qualitativeLabel(snapshot.sleepAverage)}`);
  }
  if (limiter !== 'nutrition') {
    parts.push(`Nutrition: ${qualitativeLabel(snapshot.nutritionAverage)}`);
    parts.push(`Protein: ${qualitativeLabel(snapshot.proteinAverage)}`);
  }
  parts.push(`Hydration: ${qualitativeLabel(snapshot.hydrationAverage)}`);
  
  // Add improvement callouts for acknowledgment (qualitative only)
  if (weekOverWeekChanges) {
    const improvements = weekOverWeekChanges
      .filter(c => c.direction === 'up' && c.delta >= 15)
      .filter(c => !isRelevantBehavior(c.behavior, relevantBehaviors));
    
    if (improvements.length > 0) {
      const improvedNames = improvements.map(c => c.behavior).join(', ');
      parts.push(`Notable improvement: ${improvedNames}`);
    }
  }
  
  return parts.join(' · ');
}

/**
 * Convert a numeric average to a qualitative label.
 * No numbers leak through to the prompt.
 */
function qualitativeLabel(average: number): string {
  if (average >= 80) return 'strong';
  if (average >= 65) return 'adequate';
  if (average >= 50) return 'variable';
  return 'needs attention';
}

// ============================================================================
// USER NOTES FILTER
// ============================================================================

/**
 * Filter user notes to remove those that primarily discuss
 * non-constraint behaviors.
 * 
 * Logic:
 * - Count how many constraint-related keywords appear in the note
 * - Count how many non-constraint keywords appear
 * - Keep the note if constraint keywords >= non-constraint keywords
 * - Keep the note if it has zero behavior-specific keywords (general note)
 * - Drop the note if it's primarily about a non-constraint behavior
 * 
 * Example when constraint is nutrition:
 *   "Weekend completely off track with food" → KEEP (food = nutrition)
 *   "Late-night phone use disrupting sleep, then poor eating" → DROP (sleep > nutrition)
 *   "Felt great after early bedtime Monday" → DROP (sleep only)
 *   "Rough week at work" → KEEP (general, no specific behavior)
 */
function filterUserNotes(
  limiter: string,
  relevantBehaviors: string[],
  notes: string[]
): { filtered: string[]; dropped: Array<{ note: string; reason: string }> } {
  
  const filtered: string[] = [];
  const dropped: Array<{ note: string; reason: string }> = [];
  
  // Build keyword sets
  const constraintKeywords = getKeywordsForLimiter(limiter);
  const allNonConstraintKeywords = getAllKeywordsExcept(limiter);
  
  for (const note of notes) {
    const lower = note.toLowerCase();
    
    const constraintHits = constraintKeywords.filter(kw => lower.includes(kw)).length;
    const nonConstraintHits = allNonConstraintKeywords.filter(kw => lower.includes(kw)).length;
    
    if (constraintHits >= nonConstraintHits) {
      // Note is primarily about the constraint, or general
      filtered.push(note);
    } else if (nonConstraintHits === 0 && constraintHits === 0) {
      // General note with no behavior keywords, keep it
      filtered.push(note);
    } else {
      // Note is primarily about non-constraint behaviors
      dropped.push({
        note,
        reason: `Primarily discusses non-constraint behavior (${nonConstraintHits} non-constraint keywords vs ${constraintHits} constraint keywords)`
      });
    }
  }
  
  return { filtered, dropped };
}

/**
 * Get keywords for a specific limiter type
 */
function getKeywordsForLimiter(limiter: string): string[] {
  const keywords: string[] = [];
  
  if (limiter === 'nutrition') {
    keywords.push(...(BEHAVIOR_NOTE_KEYWORDS['nutrition'] || []));
    keywords.push(...(BEHAVIOR_NOTE_KEYWORDS['protein'] || []));
  } else if (limiter === 'recovery') {
    keywords.push(...(BEHAVIOR_NOTE_KEYWORDS['sleep'] || []));
  } else if (limiter === 'consistency' || limiter === 'time') {
    keywords.push(...(BEHAVIOR_NOTE_KEYWORDS['movement'] || []));
  }
  
  return keywords;
}

/**
 * Get all behavior keywords EXCEPT those for the given limiter
 */
function getAllKeywordsExcept(limiter: string): string[] {
  const excludeCategories: string[] = [];
  
  if (limiter === 'nutrition') {
    excludeCategories.push('nutrition', 'protein');
  } else if (limiter === 'recovery') {
    excludeCategories.push('sleep');
  } else if (limiter === 'consistency' || limiter === 'time') {
    excludeCategories.push('movement');
  }
  
  const keywords: string[] = [];
  for (const [category, kws] of Object.entries(BEHAVIOR_NOTE_KEYWORDS)) {
    if (!excludeCategories.includes(category)) {
      keywords.push(...kws);
    }
  }
  
  return keywords;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a behavior name matches the relevant behaviors for this constraint
 */
function isRelevantBehavior(behaviorName: string, relevantBehaviors: string[]): boolean {
  const lower = behaviorName.toLowerCase();
  return relevantBehaviors.some(rb => lower.includes(rb.toLowerCase()));
}

/**
 * Full scope for progression limiter (all data visible)
 */
function buildFullScope(
  snapshot: WeeklyConstraintSnapshot,
  weekOverWeekChanges?: WeekOverWeekChange[],
  dayPatterns?: DayOfWeekAnalysis,
  userNotes?: string[]
): ScopedBehavioralData {
  const lines: string[] = [];
  
  lines.push(`Sleep average: ${Math.round(snapshot.sleepAverage)}%`);
  lines.push(`Nutrition average: ${Math.round(snapshot.nutritionAverage)}%`);
  lines.push(`Protein average: ${Math.round(snapshot.proteinAverage)}%`);
  lines.push(`Hydration average: ${Math.round(snapshot.hydrationAverage)}%`);
  lines.push(`Training: ${snapshot.trainingFrequency} days`);
  
  if (weekOverWeekChanges) {
    lines.push('');
    lines.push('Week-over-week:');
    for (const c of weekOverWeekChanges) {
      const arrow = c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→';
      lines.push(`  ${c.behavior}: ${c.previousAvg} → ${c.currentAvg} (${c.delta > 0 ? '+' : ''}${c.delta}) ${arrow}`);
    }
  }
  
  return {
    constraintDetail: lines.join('\n'),
    backgroundSummary: 'All behaviors visible (progression limiter)',
    filteredNotes: userNotes || [],
    droppedNotes: [],
    constraintBehavior: 'progression',
  };
}