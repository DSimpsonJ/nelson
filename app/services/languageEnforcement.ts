/**
 * LANGUAGE ENFORCEMENT LAYER
 * 
 * Pre-validation filter that rejects abstract, clinical, or system language.
 * Forces body-first, physical, practical language.
 * 
 * Philosophy:
 * - No auto-translation (AI must learn to speak correctly)
 * - Hard rejects force regeneration
 * - Abstract noun without bodily/practical consequence → reject
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
  ]
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
 * Enforce body-first language across all coaching sections
 */
export function enforceBodyFirstLanguage(
  coaching: WeeklyCoachingOutput
): LanguageEnforcementResult {
  
  const violations: LanguageViolation[] = [];
  
  // Check each section
  violations.push(...checkSection(coaching.pattern, 'pattern'));
  violations.push(...checkSection(coaching.tension, 'tension'));
  violations.push(...checkSection(coaching.whyThisMatters, 'whyThisMatters'));
  violations.push(...checkSection(coaching.focus.text, 'focus'));
  
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
      lines.push(`  ❌ Found: "${v.phrase}"`);
      
      if (v.alternatives && v.alternatives.length > 0) {
        lines.push(`  ✅ Use instead:`);
        v.alternatives.forEach(alt => {
          lines.push(`     - ${alt}`);
        });
      }
      lines.push('');
    }
  }
  
  lines.push('RULE: Abstract nouns must have physical/practical grounding.');
  lines.push('RULE: No clinical or system language.');
  lines.push('RULE: Body-first language required.');
  
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
  rawOutput: string
): { passed: boolean; error?: string } {
  
  try {
    // Parse output
    let cleaned = rawOutput.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/```\s*$/, '');
    cleaned = cleaned.trim();
    
    const parsed = JSON.parse(cleaned) as WeeklyCoachingOutput;
    
    // Enforce language
    const result = enforceBodyFirstLanguage(parsed);
    
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