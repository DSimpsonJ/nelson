/**
 * LANGUAGE ENFORCEMENT LAYER
 * 
 * Pre-validation filter that rejects abstract, clinical, or system language.
 * Forces body-first, physical, practical language.
 * 
 * Philosophy:
 * - No auto-translation (AI must learn to speak correctly)
 * - Hard rejects force regeneration
 * - Abstract noun without bodily/practical consequence â†’ reject
 * 
 * This runs BEFORE standard validation.
 */

import { WeeklyCoachingOutput } from '../types/weeklyCoaching';

// ============================================================================
// BANNED ABSTRACT LANGUAGE
// ============================================================================

/**
 * Abstract nouns that must be replaced with body-first language
 */
const BANNED_ABSTRACT_NOUNS = [
  'recovery ceiling',
  'capacity ceiling',
  'capacity mismatch',
  'infrastructure',
  'recovery infrastructure',
  'capacity constraint',
  'load exceeding capacity',
  'recovery debt accumulating',
  'capacity management',
  'threshold optimization',
  'bandwidth',
  'bandwidth limitation',
  'execution failure',
  'adherence deficit'
] as const;

/**
 * Harsh/judgmental language that frames struggles as catastrophes
 * These make users feel judged rather than supported
 */
const BANNED_HARSH_LANGUAGE = [
  'chaos',
  'chaotic',
  'collapse',
  'collapsed',
  'collapsing',
  'disaster',
  'crisis',
  'catastrophe',
  'catastrophic',
  'terrible',
  'awful',
  'horrible',
  'breaking down',
  'falling apart',
  'unraveling',
  'spiraling',
  'plummeting',
  'cratering',
  'tanking',
  'derailed',
  'derailing',
  'out of control',
  'losing control',
  'completely off track',
  'totally off',
  'way off',
  'nowhere near'
] as const;

/**
 * Discouraging framings that undermine user confidence
 * These suggest the user is failing rather than learning
 */
const BANNED_DISCOURAGING_FRAMINGS = [
  'still struggling',
  'continue to struggle',
  'keep struggling',
  'unable to maintain',
  'failed to maintain',
  'can\'t seem to',
  'haven\'t been able to',
  'keeps failing',
  'keeps dropping',
  'repeatedly',
  'once again',
  'yet again',
  'same pattern'
] as const;

/**
 * System/clinical language that sounds robotic
 */
const BANNED_CLINICAL_LANGUAGE = [
  'is being utilized',
  'being fully utilized',
  'operating at capacity',
  'operating at your capacity',
  'capacity is being',
  'load is being',
  'recovery is being',
  'trajectory indicates',
  'data suggests',
  'metrics indicate',
  '7/7 days',
  '7/7',
  'x/x days',
  'within 2-3 weeks',
  'within two weeks',
  'within 2 weeks'
] as const;

/**
 * Vague abstractions without physical meaning
 */
const BANNED_VAGUE_ABSTRACTIONS = [
  'sustainable threshold',
  'sustainable baseline',
  'optimal load',
  'optimal volume',
  'appropriate intensity',
  'proper recovery',
  'adequate rest',
  'sufficient recovery'
] as const;

// ============================================================================
// REQUIRED BODY-FIRST ALTERNATIVES
// ============================================================================

/**
 * Examples of approved body-first language
 * (For reference in error messages)
 */
const APPROVED_ALTERNATIVES = {
  'recovery ceiling': [
    'your body can\'t absorb more right now',
    'your limit',
    'what you can handle'
  ],
  'capacity mismatch': [
    'effort is outrunning recovery',
    'asking too much of your body',
    'pushing faster than you can recover'
  ],
  'recovery debt accumulating': [
    'digging a hole',
    'borrowing from tomorrow',
    'running up a tab'
  ],
  'infrastructure': [
    'BANNED - use specific physical references',
    'sleep routine',
    'recovery setup',
    'what you do to recover'
  ],
  'sustainable threshold': [
    'what you can maintain',
    'your current limit',
    'where your body holds steady'
  ],
  'chaos': [
    'inconsistent',
    'scattered',
    'variable'
  ],
  'collapse': [
    'dropped',
    'fell',
    'declined',
    'dipped'
  ],
  'disaster': [
    'challenge',
    'struggle',
    'constraint'
  ],
  'breaking down': [
    'needs reinforcement',
    'needs support',
    'requires attention'
  ],
  'falling apart': [
    'loosening',
    'slipping',
    'becoming inconsistent'
  ],
  'still struggling': [
    'nutrition dropped this week',
    'nutrition needs attention',
    'nutrition is the current focus'
  ],
  'unable to maintain': [
    'nutrition dropped',
    'consistency loosened',
    'needs reinforcement'
  ],
  'failed to': [
    'didn\'t hit',
    'dropped below',
    'needs work'
  ],
  'can\'t seem to': [
    'nutrition needs attention',
    'this behavior needs focus',
    'this requires reinforcement'
  ],
  'keeps failing': [
    'this behavior is inconsistent',
    'this needs sustained focus',
    'structure will help here'
  ],
  'repeatedly': [
    'consistently',
    'this pattern shows',
    'data indicates'
  ]
} as const;

/**
 * Supportive framing required for celebration-worthy performance
 * 
 * CRITICAL: Solid is success, not baseline. 80% execution is the target.
 * Elite is exceptional, not expected.
 * 
 * ANY behavior hitting these thresholds deserves acknowledgment.
 * There are only 6 graded behaviors - even ONE at Solid/Elite is worth celebrating.
 */
const CELEBRATION_TRIGGERS = {
  solidWeek: {
    threshold: '80%+ on ANY behavior (all 7 days)',
    requiredTone: 'prominent acknowledgment - this is success',
    philosophy: 'Solid = success. ANY behavior at 80%+ all week must be acknowledged.',
    examples: [
      'Solid performance on [behavior] - this is success',
      '[Behavior] at 80%+ all week - you\'re hitting the target',
      'This level of consistency on [behavior] is what builds momentum',
      '80% execution on [behavior] - this is exactly what we\'re aiming for'
    ]
  },
  eliteWeek: {
    threshold: '100% on ANY behavior (all 7 days)',
    requiredTone: 'strong celebration - exceptional performance',
    philosophy: 'Elite is exceptional. ANY behavior at 100% all week deserves high praise.',
    examples: [
      'Elite performance on [behavior] - this is exceptional',
      'Perfect execution on [behavior] - 100% all week',
      'You nailed [behavior] completely - Elite level',
      '100% on [behavior] is outstanding work'
    ]
  }
} as const;

// ============================================================================
// VALIDATION LOGIC
// ============================================================================

interface LanguageViolation {
  phrase: string;
  location: 'pattern' | 'tension' | 'whyThisMatters' | 'focus';
  alternatives?: string[];
}

interface LanguageEnforcementResult {
  passed: boolean;
  violations: LanguageViolation[];
}

/**
 * Enforce body-first language and supportive tone across all coaching sections
 */
export function enforceBodyFirstLanguage(
  coaching: WeeklyCoachingOutput,
  solidWeek: string[] = [],
  eliteWeek: string[] = []
): LanguageEnforcementResult {
  
  const violations: LanguageViolation[] = [];
  
  // Check each section for banned language
  violations.push(...checkSection(coaching.pattern, 'pattern'));
  violations.push(...checkSection(coaching.tension, 'tension'));
  violations.push(...checkSection(coaching.whyThisMatters, 'whyThisMatters'));
  violations.push(...checkSection(coaching.progression.text, 'focus'));
  
  // Check celebration tone (Solid = success)
  violations.push(...checkCelebrationTone(coaching, solidWeek, eliteWeek));
  
  return {
    passed: violations.length === 0,
    violations
  };
}

/**
 * Check a section for banned language
 */
function checkSection(
  text: string,
  location: 'pattern' | 'tension' | 'whyThisMatters' | 'focus'
): LanguageViolation[] {
  
  const violations: LanguageViolation[] = [];
  const lower = text.toLowerCase();
  
  // Check banned abstract nouns
  for (const phrase of BANNED_ABSTRACT_NOUNS) {
    if (lower.includes(phrase)) {
      violations.push({
        phrase,
        location,
        alternatives: (APPROVED_ALTERNATIVES as any)[phrase] || undefined
      });
    }
  }
  
  // Check harsh/judgmental language
  for (const phrase of BANNED_HARSH_LANGUAGE) {
    if (lower.includes(phrase)) {
      violations.push({
        phrase,
        location,
        alternatives: (APPROVED_ALTERNATIVES as any)[phrase] || [
          'Use neutral, supportive language',
          'Frame as solvable challenge, not catastrophe'
        ]
      });
    }
  }
  
  // Check discouraging framings
  for (const phrase of BANNED_DISCOURAGING_FRAMINGS) {
    if (lower.includes(phrase)) {
      violations.push({
        phrase,
        location,
        alternatives: [
          'Frame as data point, not pattern of failure',
          'Use neutral observation: "nutrition dropped" not "still struggling"',
          'Suggest capability: "needs attention" not "unable to maintain"'
        ]
      });
    }
  }
  
  // Check clinical language
  for (const phrase of BANNED_CLINICAL_LANGUAGE) {
    if (lower.includes(phrase)) {
      violations.push({
        phrase,
        location,
        alternatives: ['Use active voice with body as subject']
      });
    }
  }
  
  // Check vague abstractions
  for (const phrase of BANNED_VAGUE_ABSTRACTIONS) {
    if (lower.includes(phrase)) {
      violations.push({
        phrase,
        location,
        alternatives: ['Be specific about physical state or practical action']
      });
    }
  }
  
  // Check for abstract nouns without practical consequences
  violations.push(...checkAbstractWithoutConsequence(text, location));
  
  return violations;
}

/**
 * Detect abstract nouns that lack bodily or practical grounding
 */
function checkAbstractWithoutConsequence(
  text: string,
  location: 'pattern' | 'tension' | 'whyThisMatters' | 'focus'
): LanguageViolation[] {
  
  const violations: LanguageViolation[] = [];
  
  // Pattern: "X is Y" where Y is abstract (ceiling, threshold, constraint)
  // Without physical grounding (tired, sore, can't, won't, breaks)
  
  const abstractPatterns = [
    /\b(ceiling|threshold)\b/gi,  // Removed "constraint" and "limit"
    /\b(infrastructure|bandwidth)\b/gi,  // Removed "capacity" 
    /\b(optimal|appropriate|adequate|sufficient)\b/gi
  ];
  
  const physicalGrounding = [
    /\b(tired|sore|hurt|pain|ache|stiff)\b/gi,
    /\b(can't|won't|break|fail|crash|quit)\b/gi,
    /\b(sleep|eat|move|rest|recover)\b/gi,
    /\b(body|muscle|joint|back|leg|arm)\b/gi
  ];
  
  // Check if abstract language exists
  const hasAbstract = abstractPatterns.some(pattern => pattern.test(text));
  
  if (hasAbstract) {
    // Check if it's grounded in physical/practical language
    const hasGrounding = physicalGrounding.some(pattern => pattern.test(text));
    
    if (!hasGrounding) {
      violations.push({
        phrase: 'Abstract language without physical grounding',
        location,
        alternatives: [
          'Reference body state (tired, sore, can\'t)',
          'Name practical consequence (skip days, quit, injury)',
          'Use physical verbs (break, crash, hold, recover)'
        ]
      });
    }
  }
  
  return violations;
}

/**
 * Check if coaching properly acknowledges Solid/Elite performance
 * 
 * CRITICAL PRINCIPLE: Solid = success, not just baseline
 * - 80% execution is the target, not a consolation prize
 * - Solid performance must be acknowledged BEFORE discussing constraints
 * - Users should feel successful when they hit Solid
 */
function checkCelebrationTone(
  coaching: WeeklyCoachingOutput,
  solidWeek: string[],
  eliteWeek: string[]
): LanguageViolation[] {
  
  const violations: LanguageViolation[] = [];
  
  // If user hit Elite on ANY behavior, require strong celebration
  if (eliteWeek.length >= 1) {
    const hasEliteCelebration = 
      /\b(elite|perfect|exceptional|nailed|outstanding|100%)\b/gi.test(coaching.pattern) ||
      /\b(elite|perfect|exceptional|nailed|outstanding|100%)\b/gi.test(coaching.whyThisMatters);
    
    if (!hasEliteCelebration) {
      violations.push({
        phrase: 'Missing Elite celebration',
        location: 'pattern',
        alternatives: [
          'Elite performance on ' + eliteWeek.join(', ') + ' - this is exceptional',
          'Perfect execution on ' + eliteWeek.join(' and ') + ' - 100% all week',
          '100% on ' + eliteWeek.join(', ') + ' is outstanding work'
        ]
      });
    }
  }
  
  // If user hit Solid on ANY behavior, require prominent acknowledgment
  // SOLID IS SUCCESS - must be celebrated as such
  if (solidWeek.length >= 1) {
    const hasSolidAcknowledgment =
      /\b(solid|consistent|success|target|hitting|80%)\b/gi.test(coaching.pattern) ||
      /\b(solid|consistent|success|target|hitting|80%)\b/gi.test(coaching.whyThisMatters);
    
    if (!hasSolidAcknowledgment) {
      violations.push({
        phrase: 'Missing Solid acknowledgment - Solid is success',
        location: 'pattern',
        alternatives: [
          'Solid performance on ' + solidWeek.join(', ') + ' - this is success',
          'This is exactly what success looks like on ' + solidWeek.join(', '),
          'You\'re hitting the target with ' + solidWeek.join(' and '),
          '80% execution on ' + solidWeek.join(', ') + ' - this is what we\'re aiming for'
        ]
      });
    }
  }
  
  // Check for problem-first framing (constraint mentioned before acknowledgment)
  // Pattern section should lead with what's working, then discuss constraint
  const patternLower = coaching.pattern.toLowerCase();
  const constraintWords = ['constraint', 'struggle', 'challenge', 'dropped', 'dipped', 'fell', 'inconsistent'];
  const celebrationWords = ['solid', 'elite', 'success', 'hitting', 'consistent', 'working'];
  
  // Find first occurrence of constraint vs celebration words
  let firstConstraintIndex = Infinity;
  let firstCelebrationIndex = Infinity;
  
  for (const word of constraintWords) {
    const index = patternLower.indexOf(word);
    if (index !== -1 && index < firstConstraintIndex) {
      firstConstraintIndex = index;
    }
  }
  
  for (const word of celebrationWords) {
    const index = patternLower.indexOf(word);
    if (index !== -1 && index < firstCelebrationIndex) {
      firstCelebrationIndex = index;
    }
  }
  
  // If user has ANY Solid/Elite performance, celebration should come first
  if ((solidWeek.length > 0 || eliteWeek.length > 0) && 
      firstConstraintIndex < firstCelebrationIndex) {
    violations.push({
      phrase: 'Problem-first framing detected',
      location: 'pattern',
      alternatives: [
        'Start with what\'s working (Solid/Elite behaviors)',
        'Acknowledge wins before discussing constraints',
        'Lead with success, then address the challenge'
      ]
    });
  }
  
  return violations;
}

// ============================================================================
// FORMATTING FOR ERROR MESSAGES
// ============================================================================

/**
 * Format violations for validation error
 */
export function formatLanguageViolations(
  violations: LanguageViolation[]
): string {
  
  if (violations.length === 0) {
    return '';
  }
  
  const lines: string[] = [];
  lines.push('LANGUAGE ENFORCEMENT FAILURE:');
  lines.push('');
  
  // Group by location
  const byLocation = violations.reduce((acc, v) => {
    if (!acc[v.location]) acc[v.location] = [];
    acc[v.location].push(v);
    return acc;
  }, {} as Record<string, LanguageViolation[]>);
  
  for (const [location, viols] of Object.entries(byLocation)) {
    lines.push(`In ${location}:`);
    
    for (const v of viols) {
      lines.push(`  âŒ Found: "${v.phrase}"`);
      
      if (v.alternatives && v.alternatives.length > 0) {
        lines.push(`  âœ… Use instead:`);
        v.alternatives.forEach(alt => {
          lines.push(`     - ${alt}`);
        });
      }
      lines.push('');
    }
  }
  
  lines.push('RULES:');
  lines.push('- Abstract nouns must have physical/practical grounding');
  lines.push('- No clinical or system language');
  lines.push('- No harsh/judgmental language (chaos, collapse, disaster, crisis)');
  lines.push('- Body-first language required');
  lines.push('- SOLID (80%+) = SUCCESS and must be celebrated prominently');
  lines.push('- Elite (100%) = exceptional and must be celebrated strongly');
  lines.push('- Lead with what\'s working before discussing constraints');
  
  return lines.join('\n');
}

// ============================================================================
// INTEGRATION WITH VALIDATION
// ============================================================================

/**
 * Pre-validation check to run before standard validation
 * Returns error message if language enforcement fails
 */
export function checkLanguageBeforeValidation(
  rawOutput: string,
  solidWeek: string[] = [],
  eliteWeek: string[] = []
): { passed: boolean; error?: string } {
  
  try {
    // Parse output
    let cleaned = rawOutput.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/```\s*$/, '');
    cleaned = cleaned.trim();
    
    const parsed = JSON.parse(cleaned) as WeeklyCoachingOutput;
    
    // Enforce language
    const result = enforceBodyFirstLanguage(parsed, solidWeek, eliteWeek);
    
    if (!result.passed) {
      return {
        passed: false,
        error: formatLanguageViolations(result.violations)
      };
    }
    
    return { passed: true };
    
  } catch (e) {
    // If parsing fails, let normal validation handle it
    return { passed: true };
  }
}