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
    LENGTH_LIMITS,
    BANNED_ADJECTIVES,
    BANNED_IMPERATIVES,
    PATTERN_BANS
  } from '../types/weeklyCoaching';
  
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
  
    // Length validation
    errors.push(...validateLengths(coaching));
  
    // Evidence validation
    errors.push(...validateEvidenceVerbatim(coaching, pattern));
  
    // Acknowledgment validation
    errors.push(...validateAcknowledgment(coaching));
  
    // Explanation validation
    errors.push(...validateExplanation(coaching));
  
    // Pattern-specific validation
    errors.push(...validatePatternBans(coaching, pattern));
  
    // Notes usage validation (no aggregation or emotional mirroring)
    errors.push(...validateNotesUsage(coaching));
  
    // Experiment validation
    if (coaching.experiment) {
      errors.push(...validateExperiment(coaching.experiment));
    }
  
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
    if (!parsed.acknowledgment || typeof parsed.acknowledgment !== 'string') {
      throw new Error('Missing or invalid acknowledgment field');
    }
    if (!parsed.observation || typeof parsed.observation !== 'string') {
      throw new Error('Missing or invalid observation field');
    }
    if (!parsed.explanation || typeof parsed.explanation !== 'string') {
      throw new Error('Missing or invalid explanation field');
    }
    if (!parsed.orientation || typeof parsed.orientation !== 'string') {
      throw new Error('Missing or invalid orientation field');
    }
  
    // Validate experiment structure if present
    if (parsed.experiment) {
      if (!parsed.experiment.action || typeof parsed.experiment.action !== 'string') {
        throw new Error('Experiment missing or invalid action field');
      }
      if (!parsed.experiment.stopCondition || typeof parsed.experiment.stopCondition !== 'string') {
        throw new Error('Experiment missing or invalid stopCondition field');
      }
    }
  
    return parsed as WeeklyCoachingOutput;
  }
  
  // ============================================================================
  // STRUCTURAL VALIDATION
  // ============================================================================
  
  function validateStructure(coaching: WeeklyCoachingOutput): ValidationError[] {
    const errors: ValidationError[] = [];
  
    // Check all required fields
    if (!coaching.acknowledgment) {
      errors.push({
        rule: 'required_field',
        message: 'Acknowledgment is required',
        field: 'acknowledgment'
      });
    }
  
    if (!coaching.observation) {
      errors.push({
        rule: 'required_field',
        message: 'Observation is required',
        field: 'observation'
      });
    }
  
    if (!coaching.explanation) {
      errors.push({
        rule: 'required_field',
        message: 'Explanation is required',
        field: 'explanation'
      });
    }
  
    if (!coaching.orientation) {
      errors.push({
        rule: 'required_field',
        message: 'Orientation is required',
        field: 'orientation'
      });
    }
  
    return errors;
  }
  
  // ============================================================================
  // LENGTH VALIDATION
  // ============================================================================
  
  function validateLengths(coaching: WeeklyCoachingOutput): ValidationError[] {
    const errors: ValidationError[] = [];
  
    // Acknowledgment length
    if (coaching.acknowledgment.length > LENGTH_LIMITS.acknowledgment.maxChars) {
      errors.push({
        rule: 'length_limit',
        message: `Acknowledgment exceeds ${LENGTH_LIMITS.acknowledgment.maxChars} characters`,
        field: 'acknowledgment'
      });
    }
  
    // Observation length
    if (coaching.observation.length > LENGTH_LIMITS.observation.maxChars) {
      errors.push({
        rule: 'length_limit',
        message: `Observation exceeds ${LENGTH_LIMITS.observation.maxChars} characters`,
        field: 'observation'
      });
    }
  
    // Explanation length
    if (coaching.explanation.length > LENGTH_LIMITS.explanation.maxChars) {
      errors.push({
        rule: 'length_limit',
        message: `Explanation exceeds ${LENGTH_LIMITS.explanation.maxChars} characters`,
        field: 'explanation'
      });
    }
  
    // Orientation length
    if (coaching.orientation.length > LENGTH_LIMITS.orientation.maxChars) {
      errors.push({
        rule: 'length_limit',
        message: `Orientation exceeds ${LENGTH_LIMITS.orientation.maxChars} characters`,
        field: 'orientation'
      });
    }
  
    // Experiment lengths
    if (coaching.experiment) {
      if (coaching.experiment.action.length > LENGTH_LIMITS.experiment.action.maxChars) {
        errors.push({
          rule: 'length_limit',
          message: `Experiment action exceeds ${LENGTH_LIMITS.experiment.action.maxChars} characters`,
          field: 'experiment'
        });
      }
  
      if (coaching.experiment.stopCondition.length > LENGTH_LIMITS.experiment.stopCondition.maxChars) {
        errors.push({
          rule: 'length_limit',
          message: `Experiment stopCondition exceeds ${LENGTH_LIMITS.experiment.stopCondition.maxChars} characters`,
          field: 'experiment'
        });
      }
    }
  
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
  
    const hasVerbatimEvidence = pattern.evidencePoints.some(evidence => 
      coaching.observation.includes(evidence)
    );
  
    if (!hasVerbatimEvidence) {
      errors.push({
        rule: 'evidence_verbatim',
        message: 'Observation must include at least one evidence point verbatim',
        field: 'observation'
      });
    }
  
    return errors;
  }
  
  // ============================================================================
  // ACKNOWLEDGMENT VALIDATION
  // ============================================================================
  
  /**
   * Validate acknowledgment contains no banned adjectives
   */
  function validateAcknowledgment(coaching: WeeklyCoachingOutput): ValidationError[] {
    const errors: ValidationError[] = [];
    const lower = coaching.acknowledgment.toLowerCase();
  
    const foundAdjectives = BANNED_ADJECTIVES.filter(adj => 
      lower.includes(adj)
    );
  
    if (foundAdjectives.length > 0) {
      errors.push({
        rule: 'banned_adjectives',
        message: `Acknowledgment contains banned adjectives: ${foundAdjectives.join(', ')}`,
        field: 'acknowledgment'
      });
    }
  // Check for generic acknowledgments
  const genericPhrases = [
    'you checked in',
    'you maintained consistent',
    'this week produced',
    'you showed up'
  ];
  
  const isGeneric = genericPhrases.some(phrase => lower.includes(phrase)) && 
                    !lower.includes('despite') && 
                    !lower.includes('through') &&
                    !lower.includes('while');
  
  if (isGeneric) {
    errors.push({
      rule: 'generic_acknowledgment',
      message: 'Acknowledgment is too generic - must reference specific challenge/context from this week',
      field: 'acknowledgment'
    });
  }
    return errors;
  }
  
  // ============================================================================
  // EXPLANATION VALIDATION
  // ============================================================================
  
  /**
   * Validate explanation contains no imperatives
   */
  function validateExplanation(coaching: WeeklyCoachingOutput): ValidationError[] {
    const errors: ValidationError[] = [];
    const lower = coaching.explanation.toLowerCase();
  
    const foundImperatives = BANNED_IMPERATIVES.filter(imperative => 
      lower.includes(imperative)
    );
  
    if (foundImperatives.length > 0) {
      errors.push({
        rule: 'banned_imperatives',
        message: `Explanation contains imperatives: ${foundImperatives.join(', ')}`,
        field: 'explanation'
      });
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
      coaching.acknowledgment,
      coaching.observation,
      coaching.explanation,
      coaching.orientation,
      coaching.experiment?.action || '',
      coaching.experiment?.stopCondition || ''
    ].join(' ').toLowerCase();
  
    const foundBans = bannedPhrases.filter(phrase => 
      allText.includes(phrase.toLowerCase())
    );
  
    if (foundBans.length > 0) {
      errors.push({
        rule: 'pattern_banned_phrases',
        message: `Contains banned phrases for ${pattern.primaryPattern}: ${foundBans.join(', ')}`
      });
    }
  
    return errors;
  }
  
  /**
   * Validate that notes are not being aggregated or summarized
   */
  function validateNotesUsage(coaching: WeeklyCoachingOutput): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Aggregation language that indicates trend inference from notes
    const aggregationPhrases = [
      'your notes show',
      'notes show',
      'you often',
      'you typically',
      'you usually',
      'recurring',
      'keeps happening',
      'most days',
      'several times',
      'multiple times',
      'pattern of',
      'trend of',
      'sounds frustrating',
      'sounds difficult',
      'sounds challenging',
      'that must be'
    ];
  
    const allText = [
      coaching.acknowledgment,
      coaching.observation,
      coaching.explanation,
      coaching.orientation,
      coaching.experiment?.action || '',
      coaching.experiment?.stopCondition || ''
    ].join(' ').toLowerCase();
  
    const foundAggregation = aggregationPhrases.filter(phrase => 
      allText.includes(phrase.toLowerCase())
    );
  
    if (foundAggregation.length > 0) {
      errors.push({
        rule: 'notes_aggregation',
        message: `Contains aggregation/emotional language: ${foundAggregation.join(', ')}`
      });
    }
  
    return errors;
  }
  
  // ============================================================================
  // EXPERIMENT VALIDATION
  // ============================================================================
  
  /**
   * Validate experiment structure if present
   */
  function validateExperiment(experiment: WeeklyCoachingOutput['experiment']): ValidationError[] {
    const errors: ValidationError[] = [];
  
    if (!experiment) {
      return errors;
    }
  
    // Stop condition is required
    if (!experiment.stopCondition || experiment.stopCondition.trim().length === 0) {
      errors.push({
        rule: 'experiment_stop_condition',
        message: 'Experiment must include a stop condition',
        field: 'experiment'
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