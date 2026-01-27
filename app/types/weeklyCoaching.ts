/**
 * TypeScript Interfaces for Weekly Coaching System
 * 
 * These types define the complete data contracts for:
 * - AI-generated coaching outputs
 * - Firestore weekly summary records
 * - Validation results
 * - API requests/responses
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// PATTERN TYPES
// ============================================================================

export type FocusType = 
  | 'protect'
  | 'hold'
  | 'narrow'
  | 'ignore';

export type PatternType = 
  | 'insufficient_data'
  | 'building_foundation'
  | 'gap_disruption'
  | 'commitment_misaligned'
  | 'recovery_deficit'
  | 'effort_inconsistent'
  | 'variance_high'
  | 'momentum_decline'
  | 'building_momentum'
  | 'momentum_plateau';

export type SkipReason = 
  | 'insufficient_data' 
  | 'building_foundation';

export type SummaryStatus = 
  | 'generated'   // AI coaching successfully created and validated
  | 'skipped'     // Pattern not eligible for coaching
  | 'rejected';   // AI output failed validation

// ============================================================================
// AI COACHING OUTPUT
// ============================================================================

/**
 * ExperimentSuggestion
 * 
 * Optional bounded test the user can try.
 * Must be framed as experiment, not prescription.
 * Must include stop condition.
 */
export interface ExperimentSuggestion {
  /** What to test (max 2 sentences) */
  action: string;
  
  /** When to stop the test (max 1 sentence) */
  stopCondition: string;
}
/**
 * WeeklyFocus
 * 
 * One sentence directive for next 7 days.
 * Required for all coached weeks.
 */
export interface WeeklyFocus {
  /** The directive (max 280 chars, 2 sentences) */
  text: string;
  
  /** Focus type */
  type: FocusType;
}
/**
 * WeeklyCoachingOutput
 * 
 * The 5-part structure that AI must follow.
 * All sections required except experiment.
 * 
 * This is what the AI generates and what gets validated.
 */
export interface WeeklyCoachingOutput {
  /** Factual presence statement (max 2 sentences, no adjectives) */
  acknowledgment: string;
  
  /** Pattern type + evidence verbatim (max 3 sentences) */
  observation: string;
  
  /** Why this pattern matters (max 4 sentences, no imperatives) */
  explanation: string;
  
  /** What this means right now (max 3 sentences) */
  orientation: string;
  
  /** Optional test to try (zero or one) */
  experiment?: ExperimentSuggestion;
  focus: WeeklyFocus;  
}

// ============================================================================
// WEEKLY SUMMARY RECORD (FIRESTORE)
// ============================================================================

/**
 * WeeklySummaryRecord
 * 
 * Complete record stored in Firestore at:
 * users/{email}/weeklySummaries/{weekId}
 * 
 * Every week gets a record, regardless of coaching eligibility.
 * This provides deterministic state and audit trail.
 */
export interface WeeklySummaryRecord {
  /** Week identifier (e.g., "2026-W04") */
  weekId: string;
  
  /** Detected pattern type */
  patternType: PatternType;
  
  /** Whether this week is eligible for coaching */
  canCoach: boolean;
  
  /** Why coaching was skipped (null if coached or eligible) */
  skipReason: SkipReason | null;
  
  /** Evidence points from pattern detection (verbatim) */
  evidencePoints: string[];
  
  /** Model version used for generation ("none" if skipped) */
  modelVersion: string;
  
  /** Final status of this record */
  status: SummaryStatus;
  
  /** AI-generated coaching (only if status="generated") */
  coaching?: WeeklyCoachingOutput;
  
  /** Why validation failed (only if status="rejected") */
  rejectionReason?: string;
  
  /** Raw AI output for debugging (only if status="rejected") */
  rawOutput?: string;
  
  /** When this record was created */
  generatedAt: Timestamp;
  
  /** Number of days analyzed this week */
  daysAnalyzed: number;
  
  /** Actual check-ins completed this week */
  realCheckInsThisWeek: number;
  
  /** Total lifetime check-ins at time of generation */
  totalLifetimeCheckIns: number;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * ValidationError
 * 
 * Specific rule violation found during output validation
 */
export interface ValidationError {
  /** Which validation rule failed */
  rule: string;
  
  /** Human-readable explanation */
  message: string;
  
  /** Optional: which section/field had the problem */
  field?: keyof WeeklyCoachingOutput;
}

/**
 * ValidationResult
 * 
 * Result of validating an AI output against all rules
 */
export interface ValidationResult {
  /** Whether output passed all validation */
  valid: boolean;
  
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
  
  /** Successfully parsed coaching output (null if invalid) */
  coaching: WeeklyCoachingOutput | null;
}

// ============================================================================
// API CONTRACTS
// ============================================================================

/**
 * GenerateWeeklyCoachingRequest
 * 
 * Request payload for POST /api/generate-weekly-coaching
 */
export interface GenerateWeeklyCoachingRequest {
  /** User email */
  email: string;
  
  /** Week to generate coaching for */
  weekId: string;
  
  /** Optional: use fixture data instead of real pattern detection */
  useFixture?: PatternType;
}

/**
 * GenerateWeeklyCoachingResponse
 * 
 * Response from POST /api/generate-weekly-coaching
 */
export interface GenerateWeeklyCoachingResponse {
  /** Whether generation succeeded */
  success: boolean;
  
  /** The created/updated summary record */
  summary?: WeeklySummaryRecord;
  
  /** Error message if failed */
  error?: string;
  
  /** Validation errors if rejected */
  validationErrors?: ValidationError[];
}

// ============================================================================
// PATTERN DETECTION (from Phase 1)
// ============================================================================

/**
 * WeeklyPattern
 * 
 * Output from detectWeeklyPattern() service
 * This is the input to coaching generation
 */
export interface WeeklyPattern {
  /** Primary detected pattern */
  primaryPattern: PatternType;
  
  /** Evidence points supporting this pattern */
  evidencePoints: string[];
  
  /** Week identifier */
  weekId: string;
  
  /** Whether eligible for coaching */
  canCoach: boolean;
  
  /** Number of days in analysis window */
  daysAnalyzed: number;
  
  /** Actual check-ins this week */
  realCheckInsThisWeek: number;
  
  /** Total lifetime check-ins */
  totalLifetimeCheckIns: number;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * PatternConstraints
 * 
 * Pattern-specific bans and requirements injected into prompts
 */
export interface PatternConstraints {
  /** Words/phrases banned for this pattern */
  bannedPhrases: string[];
  
  /** Canon-approved alternatives to use instead of banned phrases */
  approvedAlternatives?: readonly string[];
  
  /** Required acknowledgments (if any) */
  requiredAcknowledgments?: readonly string[];
  
  /** Additional guidance for this pattern */
  specialInstructions?: string;
}

/**
 * PromptContext
 * 
 * All context needed to build a coaching prompt
 */
export interface PromptContext {
  /** The detected pattern */
  pattern: WeeklyPattern;
  
  /** Pattern-specific constraints */
  constraints: PatternConstraints;
  
  /** Base schema and rules (shared across all patterns) */
  baseSchema: string;
}

// ============================================================================
// LENGTH LIMITS (for validation)
// ============================================================================

export const LENGTH_LIMITS = {
  acknowledgment: {
    maxSentences: 2,
    maxChars: 300
  },
  observation: {
    maxSentences: 3,
    maxChars: 400
  },
  explanation: {
    maxSentences: 4,
    maxChars: 600
  },
  orientation: {
    maxSentences: 3,
    maxChars: 400
  },
  experiment: {
    action: {
      maxSentences: 2,
      maxChars: 300
    },
    stopCondition: {
      maxSentences: 1,
      maxChars: 150
    }
  }
} as const;

// ============================================================================
// BANNED CONTENT (for validation)
// ============================================================================

/**
 * Global banned adjectives (never allowed in acknowledgment)
 */
export const BANNED_ADJECTIVES = [
  'great',
  'good',
  'excellent',
  'amazing',
  'strong',
  'impressive',
  'outstanding',
  'fantastic',
  'wonderful',
  'awesome',
  'stellar',
  'terrific'
] as const;

/**
 * Banned imperatives (never allowed in explanation)
 */
export const BANNED_IMPERATIVES = [
  'do ',
  'start ',
  'try ',
  'you need to',
  'you should',
  'you must',
  'make sure',
  'be sure to'
] as const;

/**
 * Pattern-specific banned phrases
 */
export const PATTERN_BANS: Record<PatternType, string[]> = {
  building_momentum: [],
  
  momentum_plateau: [
    'stuck',
    'stagnation',
    'stagnant',
    'lacking progress',
    'not improving',
    'hitting a wall'
  ],
  
  commitment_misaligned: [],
  
  gap_disruption: [
    'discipline',
    'motivation',
    'priority',
    'priorities',
    'dedication',
    'commitment issue'
  ],
  
  recovery_deficit: [],
  
  effort_inconsistent: [
    'not trying',
    'half-hearted',
    'lack of effort'
  ],
  
  variance_high: [],
  momentum_decline: [
    'failure',
    'failed', 
    'falling apart',
    'lost control',
    'gave up'
  ],
  insufficient_data: [],
  
  building_foundation: []
} as const;

// ============================================================================
// MODEL CONFIG
// ============================================================================

export const MODEL_VERSION = 'claude-sonnet-4-20250514' as const;

export const MODEL_CONFIG = {
  model: MODEL_VERSION,
  max_tokens: 1000,
  temperature: 0.7
} as const;