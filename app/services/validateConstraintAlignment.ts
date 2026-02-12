/**
 * CONSTRAINT ALIGNMENT VALIDATION
 * 
 * Validates that AI coaching output actually addresses the PRIMARY CONSTRAINT
 * and doesn't drift to other behaviors.
 * 
 * This runs BEFORE language enforcement and structural validation.
 * It's the first gate. If the output is talking about the wrong behavior,
 * nothing else matters.
 * 
 * Philosophy:
 * - Fail fast on constraint drift (don't waste time checking grammar)
 * - Clear error messages that tell the AI exactly what to fix
 * - Positive check (does Focus mention constraint?) AND negative check
 *   (does Tension mention non-constraint behaviors?)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ConstraintAlignmentResult {
    passed: boolean;
    error: string;
    details?: {
      constraintMentionedInFocus: boolean;
      nonConstraintInTension: string[];
      nonConstraintInFocus: string[];
      crossBehaviorCausality: boolean;
    };
  }
  
  // ============================================================================
  // KEYWORD MAPS
  // ============================================================================
  
  /**
   * Keywords that indicate the AI is discussing a specific behavior.
   * Used for both positive checks (is the constraint mentioned?)
   * and negative checks (are non-constraint behaviors mentioned?).
   */
  const BEHAVIOR_KEYWORDS: Record<string, string[]> = {
    'nutrition': [
      'nutrition', 'meal', 'food', 'eating', 'prep', 'calories', 'diet',
      'snack', 'lunch', 'dinner', 'breakfast', 'cooking', 'portion',
      'fasting', 'hunger', 'macro', 'fuel'
    ],
    'protein': [
      'protein', 'shake', 'supplement', 'amino'
    ],
    'sleep': [
      'sleep', 'bed', 'bedtime', 'phone', 'screen', 'wake', 'rest',
      'nap', 'insomnia', 'circadian', 'melatonin', 'pillow'
    ],
    'hydration': [
      'water', 'hydration', 'hydrate', 'dehydrat', 'fluid', 'oz',
      'bottle', 'drink'
    ],
    'movement': [
      'exercise', 'workout', 'gym', 'walk', 'run', 'lift', 'training',
      'movement', 'steps', 'cardio', 'strength'
    ],
    'mindset': [
      'mindset', 'stress', 'anxiety', 'mental', 'mood', 'overwhelm',
      'motivation'
    ],
  };
  
  /**
   * Words that create cross-behavior causal chains.
   * "Poor sleep CAUSED bad eating" or "Fix sleep AND nutrition follows"
   */
  const CAUSAL_CONNECTORS = [
    'because of your sleep',
    'because of your hydration',
    'because of your protein',
    'because of your exercise',
    'because of your movement',
    'due to sleep',
    'due to hydration',
    'due to protein',
    'leads to',
    'cascades into',
    'creates a cycle',
    'drives',
    'triggers',
    'fix sleep and',
    'fix hydration and',
    'fix protein and',
    'fix movement and',
    'improve sleep and',
    'improve hydration and',
    'once sleep improves',
    'once hydration improves',
    'when sleep stabilizes',
    'sleep-nutrition connection',
    'sleep-nutrition link',
    'recovery-nutrition',
  ];
  
  // ============================================================================
  // MAIN VALIDATION
  // ============================================================================
  
  /**
   * Validate that the coaching output aligns with the primary constraint.
   * 
   * Checks:
   * 1. Focus/Progression mentions the constraint behavior
   * 2. Tension doesn't primarily discuss non-constraint behaviors
   * 3. No cross-behavior causal chains
   * 
   * @param rawOutput - Raw JSON string from AI
   * @param dominantLimiter - System-determined constraint ("nutrition", "recovery", etc.)
   * @returns Validation result with clear error message for retry
   */
  export function validateConstraintAlignment(
    rawOutput: string,
    dominantLimiter: string
  ): ConstraintAlignmentResult {
    
    // Skip for progression limiter (all behaviors valid)
    if (dominantLimiter === 'progression') {
      return { passed: true, error: '' };
    }
    
    try {
      const cleaned = rawOutput
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      
      const parsed = JSON.parse(cleaned);
      
      const focusText = (parsed.progression?.text || '').toLowerCase();
      const tensionText = (parsed.tension || '').toLowerCase();
      const whyText = (parsed.whyThisMatters || '').toLowerCase();
      const allText = `${focusText} ${tensionText} ${whyText}`;
      
      // Get constraint and non-constraint keyword sets
      const constraintKeywords = getConstraintKeywords(dominantLimiter);
      const nonConstraintCategories = getNonConstraintCategories(dominantLimiter);
      
      // ---- CHECK 1: Focus must mention constraint behavior ----
      const constraintMentionedInFocus = constraintKeywords.some(kw => focusText.includes(kw));
      
      if (!constraintMentionedInFocus) {
        return {
          passed: false,
          error: `Your Focus does not address ${dominantLimiter}. The Focus must give specific, actionable ${dominantLimiter} advice (e.g., ${getExampleAdvice(dominantLimiter)}). Rewrite the Focus to directly address ${dominantLimiter}.`,
          details: {
            constraintMentionedInFocus: false,
            nonConstraintInTension: [],
            nonConstraintInFocus: [],
            crossBehaviorCausality: false,
          }
        };
      }
      
      // ---- CHECK 2: Tension should not primarily discuss other behaviors ----
      const nonConstraintInTension: string[] = [];
      for (const [category, keywords] of Object.entries(nonConstraintCategories)) {
        const found = keywords.filter(kw => tensionText.includes(kw));
        if (found.length > 0) {
          nonConstraintInTension.push(category);
        }
      }
      
      // Allow mentioning non-constraint behaviors in passing, but flag
      // if tension is primarily about them
      if (nonConstraintInTension.length > 0) {
        // Check if constraint is ALSO mentioned in tension (it should dominate)
        const constraintInTension = constraintKeywords.filter(kw => tensionText.includes(kw)).length;
        const nonConstraintHitCount = nonConstraintInTension.reduce((sum, cat) => {
          return sum + (nonConstraintCategories[cat] || []).filter(kw => tensionText.includes(kw)).length;
        }, 0);
        
        if (nonConstraintHitCount > constraintInTension) {
          return {
            passed: false,
            error: `Tension discusses ${nonConstraintInTension.join(', ')} more than ${dominantLimiter}. The Tension must describe the ${dominantLimiter} failure pattern. Do not explain why ${dominantLimiter} failed via other behaviors. Describe what is happening with ${dominantLimiter} directly.`,
            details: {
              constraintMentionedInFocus: true,
              nonConstraintInTension,
              nonConstraintInFocus: [],
              crossBehaviorCausality: false,
            }
          };
        }
      }
      
      // ---- CHECK 3: No cross-behavior causal chains ----
      const causalityFound = CAUSAL_CONNECTORS.filter(phrase => allText.includes(phrase));
      if (causalityFound.length > 0) {
        return {
          passed: false,
          error: `Cross-behavior causality detected: "${causalityFound[0]}". Do not explain ${dominantLimiter} failures through other behaviors. Describe what is happening with ${dominantLimiter} and give ${dominantLimiter}-specific advice.`,
          details: {
            constraintMentionedInFocus: true,
            nonConstraintInTension: [],
            nonConstraintInFocus: [],
            crossBehaviorCausality: true,
          }
        };
      }
      
      // ---- CHECK 4: Focus should not suggest fixing non-constraint behaviors ----
      const nonConstraintInFocus: string[] = [];
      for (const [category, keywords] of Object.entries(nonConstraintCategories)) {
        const found = keywords.filter(kw => focusText.includes(kw));
        if (found.length > 0) {
          nonConstraintInFocus.push(category);
        }
      }
      
      if (nonConstraintInFocus.length > 0) {
        return {
          passed: false,
          error: `Focus suggests addressing ${nonConstraintInFocus.join(', ')} but the constraint is ${dominantLimiter}. The Focus must give ${dominantLimiter}-specific direction for this week. Rewrite to address ${dominantLimiter} directly.`,
          details: {
            constraintMentionedInFocus: true,
            nonConstraintInTension: [],
            nonConstraintInFocus,
            crossBehaviorCausality: false,
          }
        };
      }
      
      return { passed: true, error: '' };
      
    } catch (e) {
      // Parse failure, let standard validation handle it
      return { passed: true, error: '' };
    }
  }
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  /**
   * Get keywords for the constraint behavior
   */
  function getConstraintKeywords(limiter: string): string[] {
    switch (limiter) {
      case 'nutrition':
        return [...(BEHAVIOR_KEYWORDS['nutrition'] || []), ...(BEHAVIOR_KEYWORDS['protein'] || [])];
      case 'recovery':
        return BEHAVIOR_KEYWORDS['sleep'] || [];
      case 'consistency':
      case 'time':
        return BEHAVIOR_KEYWORDS['movement'] || [];
      default:
        return [];
    }
  }
  
  /**
   * Get keyword map for all NON-constraint behaviors
   */
  function getNonConstraintCategories(limiter: string): Record<string, string[]> {
    const all = { ...BEHAVIOR_KEYWORDS };
    const result: Record<string, string[]> = {};
    
    // Remove constraint behavior categories
    const excludeKeys: string[] = [];
    if (limiter === 'nutrition') {
      excludeKeys.push('nutrition', 'protein');
    } else if (limiter === 'recovery') {
      excludeKeys.push('sleep');
    } else if (limiter === 'consistency' || limiter === 'time') {
      excludeKeys.push('movement');
    }
    
    for (const [key, keywords] of Object.entries(all)) {
      if (!excludeKeys.includes(key)) {
        result[key] = keywords;
      }
    }
    
    return result;
  }
  
  /**
   * Get example advice for a given constraint (used in error messages)
   */
  function getExampleAdvice(limiter: string): string {
    switch (limiter) {
      case 'nutrition':
        return '"Prep meals on Sunday" or "Pack lunch the night before"';
      case 'recovery':
        return '"Set a consistent bedtime this week" or "No screens 30 minutes before bed"';
      case 'consistency':
        return '"Commit to 4 exercise days this week" or "Schedule movement like a meeting"';
      case 'time':
        return '"Block 30 minutes for movement 3 days this week"';
      default:
        return 'specific, actionable advice for this behavior';
    }
  }