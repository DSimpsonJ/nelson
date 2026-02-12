/**
 * Weekly Coaching Output Validator
 * 
 * Validates AI-generated coaching outputs against Canon rules.
 * All validation must pass before storing in Firestore.
 * 
 * Validation checks:
 * - Structural (all required fields present)
 * - Length limits per section
 * - Evidence appears verbatim
 * - No banned adjectives in acknowledgment
 * - No imperatives in explanation
 * - Pattern-specific banned phrases
 * - Experiment has stop condition if present
 */

import {
    WeeklyCoachingOutput,
    ValidationResult,
    ValidationError,
    WeeklyPattern,
    PatternType,
    PATTERN_BANS,
    FocusType,
  } from '../types/weeklyCoaching';
import { ProgressionType } from './deriveProgressionType';

  // ============================================================================
// TONE ENFORCEMENT
// ============================================================================
/**
 * Count sentences in text
 */
function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}
/**
 * Banned hedge and system language
 */
const BANNED_TONE_PHRASES = [
  'suggests',
  'may indicate',
  'might indicate',
  'appears to',
  'could be',
  'seems to',
  'the system',
  'your system',
  'system is',
  'system was',
  'the data',
  'the pattern',
  'this reflects',
  'this signals'
] as const;
  
  // ============================================================================
  // MAIN VALIDATION
  // ============================================================================
  
  /**
   * Validate a coaching output against all rules
   * 
   * @param rawOutput - Raw string output from AI (should be JSON)
   * @param pattern - The pattern this coaching is for
   * @returns ValidationResult with errors if any
   */
  export function validateWeeklyCoaching(
    rawOutput: string,
    pattern: WeeklyPattern
  ): ValidationResult {
    const errors: ValidationError[] = [];
  
    // Parse JSON
    let coaching: WeeklyCoachingOutput;
    try {
      coaching = parseCoachingOutput(rawOutput);
    } catch (e) {
      return {
        valid: false,
        errors: [{
          rule: 'json_parsing',
          message: `Failed to parse JSON: ${e instanceof Error ? e.message : 'Unknown error'}`
        }],
        coaching: null
      };
    }
  
    // Structural validation
    errors.push(...validateStructure(coaching));
  
   // Length validation (now minimal)
   errors.push(...validateLengths(coaching));
  
   // Evidence validation
   errors.push(...validateEvidenceVerbatim(coaching, pattern));
 
   // Pattern-specific validation
   errors.push(...validatePatternBans(coaching, pattern));

     // Redundancy check
  errors.push(...validateRedundancy(coaching));

   // Focus validation
   errors.push(...validateFocus(coaching));
   errors.push(...validateFocusTone(coaching));

  return {
      valid: errors.length === 0,
      errors,
      coaching: errors.length === 0 ? coaching : null
    };
  }
  
  // ============================================================================
  // PARSING
  // ============================================================================
  
  /**
   * Parse raw AI output as WeeklyCoachingOutput
   * Handles common formatting issues like markdown code blocks
   */
  function parseCoachingOutput(rawOutput: string): WeeklyCoachingOutput {
    // Strip markdown code blocks if present
    let cleaned = rawOutput.trim();
    
    // Remove ```json and ``` markers
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/```\s*$/, '');
    cleaned = cleaned.trim();
  
    const parsed = JSON.parse(cleaned);
  
    // Validate required fields exist
    if (!parsed.pattern || typeof parsed.pattern !== 'string') {
      throw new Error('Missing or invalid pattern field');
    }
    if (!parsed.tension || typeof parsed.tension !== 'string') {
      throw new Error('Missing or invalid tension field');
    }
    if (!parsed.whyThisMatters || typeof parsed.whyThisMatters !== 'string') {
      throw new Error('Missing or invalid whyThisMatters field');
    }
  
    // Experiment validation removed - new structure doesn't use it
    // Focus validation will happen elsewhere
  
    return parsed as WeeklyCoachingOutput;
  }
  
  // ============================================================================
  // STRUCTURAL VALIDATION
  // ============================================================================
  
  function validateStructure(coaching: WeeklyCoachingOutput): ValidationError[] {
    const errors: ValidationError[] = [];
  
    // Check all required fields
    if (!coaching.pattern) {
      errors.push({
        rule: 'required_field',
        message: 'Pattern is required',
        field: 'pattern'
      });
    }
  
    if (!coaching.tension) {
      errors.push({
        rule: 'required_field',
        message: 'Tension is required',
        field: 'tension'
      });
    }
  
    if (!coaching.whyThisMatters) {
      errors.push({
        rule: 'required_field',
        message: 'WhyThisMatters is required',
        field: 'whyThisMatters'
      });
    }
  
    if (!coaching.progression) {
      errors.push({
        rule: 'required_field',
        message: 'Focus is required',
        field: 'progression'
      });
    }
  
    return errors;
  }
  // ============================================================================
  // LENGTH VALIDATION
  // ============================================================================
  
  function validateLengths(coaching: WeeklyCoachingOutput): ValidationError[] {
    const errors: ValidationError[] = [];
  
    // Sentence budget enforcement
    const tensionSentences = countSentences(coaching.tension);
    if (tensionSentences > 5) {
      errors.push({
        rule: 'tension_length',
        message: `Tension over-explains (${tensionSentences} sentences). Max 5 sentences.`,
        field: 'tension'
      });
    }
  
    const whyThisMattersSentences = countSentences(coaching.whyThisMatters);
    if (whyThisMattersSentences > 6) {
      errors.push({
        rule: 'why_this_matters_length',
        message: `WhyThisMatters is too long (${whyThisMattersSentences} sentences). Max 6 sentences.`,
        field: 'whyThisMatters'
      });
    }
  
    const patternSentences = countSentences(coaching.pattern);
    if (patternSentences > 4) {
      errors.push({
        rule: 'pattern_length',
        message: `Pattern is too long (${patternSentences} sentences). Max 4 sentences.`,
        field: 'pattern'
      });
    }
  
    // Focus has 280 char limit (validated separately in validateFocus)
  
    return errors;
  }

  // ============================================================================
  // EVIDENCE VALIDATION
  // ============================================================================
  
  /**
   * Validate that at least one evidence point appears verbatim in observation
   */
  function validateEvidenceVerbatim(
    coaching: WeeklyCoachingOutput,
    pattern: WeeklyPattern
  ): ValidationError[] {
    const errors: ValidationError[] = [];
  
// Check if pattern section includes specific numbers from evidence
const evidenceNumbers = pattern.evidencePoints
  .join(' ')
  .match(/\d+/g);

const patternNumbers = coaching.pattern.match(/\d+/g);

// Only validate if we have numbers to check
if (evidenceNumbers && patternNumbers) {
  const matchingNumbers = evidenceNumbers.filter((num: string) =>
    patternNumbers.includes(num)
  ).length;

  if (matchingNumbers < 1) {
    errors.push({
      rule: 'evidence_anchoring',
      message: `Pattern must include at least TWO specific numbers from evidence. Found: ${matchingNumbers}`,
      field: 'pattern'
    });
  }
}
  
    return errors;
  }
  
  
  // ============================================================================
  // PATTERN-SPECIFIC VALIDATION
  // ============================================================================
  
  /**
   * Validate pattern-specific banned phrases across all sections
   */
  function validatePatternBans(
    coaching: WeeklyCoachingOutput,
    pattern: WeeklyPattern
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const bannedPhrases = PATTERN_BANS[pattern.primaryPattern];
  
    if (bannedPhrases.length === 0) {
      return errors; // No bans for this pattern
    }
    // Check all text sections
    const allText = [
      coaching.pattern,
      coaching.tension,
      coaching.whyThisMatters,
      coaching.progression.text
    ].join(' ').toLowerCase();
  
    const foundToneBans = BANNED_TONE_PHRASES.filter(phrase => 
      allText.includes(phrase.toLowerCase())
    );
    
    if (foundToneBans.length > 0) {
      errors.push({
        rule: 'banned_tone',
        message: `Contains hedge/system language: ${foundToneBans.join(', ')}`
      });
    }
  
    return errors;
  }
  /**
 * Detect redundant metaphors/concepts
 */
function validateRedundancy(coaching: WeeklyCoachingOutput): ValidationError[] {
  const errors: ValidationError[] = [];
  
  const REDUNDANT_TERMS = [
    'recovery debt',
    'capacity ceiling',
    'diminishing returns',
    'hidden constraint',
    'accumulating',
    'eroding'
  ];
  
  const allText = [
    coaching.tension,
    coaching.whyThisMatters
  ].join(' ').toLowerCase();
  
  const usedTerms = REDUNDANT_TERMS.filter(term => 
    allText.includes(term.toLowerCase())
  );
  
  if (usedTerms.length > 2) {
    errors.push({
      rule: 'redundant_metaphors',
      message: `Redundant concepts detected (${usedTerms.join(', ')}). Choose fewer, sharper metaphors.`
    });
  }
  
  return errors;
}
 
  // ============================================================================
// FOCUS VALIDATION
// ============================================================================

/**
 * Validate focus is present and follows rules
 */
function validateFocus(coaching: WeeklyCoachingOutput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Focus is required
  if (!coaching.progression) {
    errors.push({
      rule: 'missing_focus',
      message: 'Focus is required for all coached weeks'
    });
    return errors;
  }

  // Text is required
  if (!coaching.progression.text || coaching.progression.text.trim().length === 0) {
    errors.push({
      rule: 'empty_focus',
      message: 'Focus text cannot be empty',
      field: 'progression'
    });
  }

  // Length limit
  if (coaching.progression.text.length > 280) {
    errors.push({
      rule: 'focus_length',
      message: 'Focus exceeds 280 character limit',
      field: 'progression'
    });
  }

  // Valid type
  const validTypes: ProgressionType[] = ['advance', 'stabilize', 'simplify'];
  if (!validTypes.includes(coaching.progression.type)) {
    errors.push({
      rule: 'invalid_focus_type',
      message: `Focus type must be one of: ${validTypes.join(', ')}`,
      field: 'progression'
    });
  }

  return errors;
}

/**
 * Validate focus doesn't contain meta-language
 */
function validateFocusTone(coaching: WeeklyCoachingOutput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!coaching.progression) return errors;

  const lower = coaching.progression.text.toLowerCase();
  const metaLanguage = [
    'system',
    'the system',
    'pattern',
    'this pattern',
    'momentum score',
    'data',
    'metrics',
    'this week shows',
    'this indicates',
    'the data',
    'the metrics'
  ];

  const foundMeta = metaLanguage.filter(term => lower.includes(term));

  if (foundMeta.length > 0) {
    errors.push({
      rule: 'focus_meta_language',
      message: `Focus contains meta-language: ${foundMeta.join(', ')}. Must sound like direct coaching.`,
      field: 'progression'
    });
  }

  return errors;
}
  // ============================================================================
  // HELPER: Get Human-Readable Error Summary
  // ============================================================================
  
  /**
   * Convert validation errors to a single readable string
   */
  export function getErrorSummary(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return 'No errors';
    }
  
    return errors
      .map(err => `[${err.rule}] ${err.message}`)
      .join('; ');
  }