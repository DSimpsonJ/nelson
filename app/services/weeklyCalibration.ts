/**
 * WEEKLY CALIBRATION
 * 
 * User answers 4 strategic questions once per week to train their AI.
 * These answers modify constraint interpretation without overriding behavioral ground truth.
 * 
 * Philosophy:
 * - Not survey data, state correction
 * - Answers influence NEXT week's coaching only
 * - Behavior remains ground truth, calibration explains it
 * - Low confidence calibration = conservative coaching
 * 
 * Timing: After coaching is delivered, before user leaves
 */

import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/app/firebase/config";

// ============================================================================
// TYPES
// ============================================================================

export type ForceLevel = 'just_enough' | 'steady_push' | 'deliberate_shove';
export type DragSource = 'time_logistics' | 'recovery_energy' | 'mental_stress' | 'none';
export type StructuralState = 'solid' | 'stressed_holding' | 'warning_signs' | 'something_wrong';
export type GoalAlignment = 'clear_steady' | 'mostly_less_urgent' | 'not_really' | 'not_sure';
export type InterpretationConfidence = 'low' | 'medium' | 'high';

export interface WeeklyCalibration {
  weekId: string;
  
  // Question 1: Force application (relative to intent)
  forceLevel: ForceLevel;
  
  // Question 2: Drag source (primary resistance)
  dragSource: DragSource;
  
  // Question 3: Structural integrity (load tolerance)
  structuralState: StructuralState;
  
  // Question 4: Slope alignment (goal validity)
  goalAlignment: GoalAlignment;
  
  // Derived (not user-entered)
  interpretationConfidence: InterpretationConfidence;
  
  // Metadata
  answeredAt: Timestamp;
}

// ============================================================================
// CALIBRATION QUESTIONS (For UI)
// ============================================================================

export const CALIBRATION_QUESTIONS = {
  force: {
    text: "This week, exercise was mostly...",
    options: [
      { value: 'just_enough', label: "Just doing the minimum" },
      { value: 'steady_push', label: "Steady and consistent" },
      { value: 'deliberate_shove', label: "Pushing harder than usual" }
    ]
  },
  drag: {
    text: "What (if anything) made this week more difficult?",
    options: [
      { value: 'time_logistics', label: "Time and scheduling" },
      { value: 'recovery_energy', label: "Low energy or poor recovery" },
      { value: 'mental_stress', label: "Stress or mental overload" },
      { value: 'none', label: "It was a good week" }
    ]
  },
  structure: {
    text: "Overall, how did your body feel?",
    options: [
      { value: 'solid', label: "Good to great" },
      { value: 'stressed_holding', label: "A bit worn down, but good enough" },
      { value: 'warning_signs', label: "I noticed some warning signs" },
      { value: 'something_wrong', label: "Something is wrong" }
    ]
  },
  goal: {
    text: "About your current goal...",
    options: [
      { value: 'clear_steady', label: "It still feels right" },
      { value: 'mostly_less_urgent', label: "It still matters, but not as much" },
      { value: 'not_really', label: "I'm not sure anymore" },
      { value: 'not_sure', label: "I need a change" }
    ]
  }
} as const;

// ============================================================================
// INTERPRETATION CONFIDENCE
// ============================================================================

/**
 * Derive interpretation confidence from answer coherence
 * 
 * High confidence: Answers tell a coherent story
 * Medium confidence: Some ambiguity but usable
 * Low confidence: Contradictory or unclear signals
 */
function deriveInterpretationConfidence(
  forceLevel: ForceLevel,
  dragSource: DragSource,
  structuralState: StructuralState,
  goalAlignment: GoalAlignment
): InterpretationConfidence {
  
  // High confidence patterns (coherent stories)
  
  // Overreaching: high force + recovery drag + structural stress
  if (forceLevel === 'deliberate_shove' && 
      dragSource === 'recovery_energy' && 
      (structuralState === 'warning_signs' || structuralState === 'something_wrong')) {
    return 'high';
  }
  
  // Sustainable build: steady force + manageable drag + solid structure
  if (forceLevel === 'steady_push' && 
      dragSource === 'none' && 
      structuralState === 'solid') {
    return 'high';
  }
  
  // Clear constraint: any force + specific drag + stressed structure
  if (dragSource !== 'none' && 
      (structuralState === 'stressed_holding' || structuralState === 'warning_signs')) {
    return 'high';
  }
  
  // Low confidence patterns (contradictory or unclear)
  
  // Minimal effort + no drag + perfect structure + unclear goals = ?
  if (forceLevel === 'just_enough' && 
      dragSource === 'none' && 
      structuralState === 'solid' && 
      goalAlignment === 'not_sure') {
    return 'low';
  }
  
  // High force + no drag + solid structure but goal misaligned = confused
  if (forceLevel === 'deliberate_shove' && 
      dragSource === 'none' && 
      structuralState === 'solid' && 
      goalAlignment === 'not_really') {
    return 'low';
  }
  
  // Goal uncertainty makes everything less reliable
  if (goalAlignment === 'not_sure' || goalAlignment === 'not_really') {
    return 'low';
  }
  
  // Default to medium (some signal, use cautiously)
  return 'medium';
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Save weekly calibration answers
 */
export async function saveWeeklyCalibration(
  email: string,
  weekId: string,
  answers: {
    forceLevel: ForceLevel;
    dragSource: DragSource;
    structuralState: StructuralState;
    goalAlignment: GoalAlignment;
  }
): Promise<void> {
  
  const confidence = deriveInterpretationConfidence(
    answers.forceLevel,
    answers.dragSource,
    answers.structuralState,
    answers.goalAlignment
  );
  
  const calibration: WeeklyCalibration = {
    weekId,
    ...answers,
    interpretationConfidence: confidence,
    answeredAt: Timestamp.now()
  };
  
  const calibrationRef = doc(
    db, 
    'users', email, 
    'weeklyCalibrations', weekId
  );
  
  await setDoc(calibrationRef, calibration);
  
  console.log(`[Calibration] Saved for ${weekId}, confidence: ${confidence}`);
}

/**
 * Retrieve calibration for a specific week
 */
export async function getWeeklyCalibration(
  email: string,
  weekId: string
): Promise<WeeklyCalibration | null> {
  
  const calibrationRef = doc(
    db, 
    'users', email, 
    'weeklyCalibrations', weekId
  );
  
  const snap = await getDoc(calibrationRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return snap.data() as WeeklyCalibration;
}

/**
 * Get calibration from PREVIOUS week for current coaching generation
 */
export async function getPreviousWeekCalibration(
  email: string,
  currentWeekId: string
): Promise<WeeklyCalibration | null> {
  
  // Parse current week (e.g., "2026-W05")
  const [year, weekNum] = currentWeekId.split('-W').map(Number);
  
  // Previous week
  const prevWeekNum = weekNum - 1;
  const prevWeekId = prevWeekNum >= 1 
    ? `${year}-W${prevWeekNum.toString().padStart(2, '0')}`
    : `${year - 1}-W52`; // Handle year boundary
  
  return getWeeklyCalibration(email, prevWeekId);
}

// ============================================================================
// FORMATTING FOR COACHING PROMPT
// ============================================================================

/**
 * Format calibration for coaching prompt
 * Only include if confidence is medium or high
 */
export function formatCalibrationForPrompt(
  calibration: WeeklyCalibration | null
): string {
  
  if (!calibration) {
    return "No calibration data from previous week.";
  }
  
  // Low confidence = don't use
  if (calibration.interpretationConfidence === 'low') {
    return "Previous week calibration available but low confidence - use cautiously.";
  }
  
  const lines: string[] = [];
  
  lines.push(`## Last Week's Calibration (${calibration.weekId})`);
  lines.push(`Confidence: ${calibration.interpretationConfidence}`);
  lines.push('');
  
  // Force level
  const forceLabels = {
    just_enough: "just enough to keep momentum alive",
    steady_push: "a steady, repeatable push",
    deliberate_shove: "an intentional push beyond baseline"
  };
  lines.push(`Force: Exercise felt like ${forceLabels[calibration.forceLevel]}`);
  
  // Drag source
  const dragLabels = {
    time_logistics: "time and logistics",
    recovery_energy: "recovery and energy",
    mental_stress: "mental load and stress",
    none: "nothing significant"
  };
  lines.push(`Drag: Primary resistance was ${dragLabels[calibration.dragSource]}`);
  
  // Structural state
  const structureLabels = {
    solid: "solid",
    stressed_holding: "stressed but holding",
    warning_signs: "warning signs present",
    something_wrong: "something wrong"
  };
  lines.push(`Structure: Body state was ${structureLabels[calibration.structuralState]}`);
  
  // Goal alignment
  const goalLabels = {
    clear_steady: "clear and steady",
    mostly_less_urgent: "mostly aligned but less urgent",
    not_really: "not really aligned",
    not_sure: "uncertain"
  };
  lines.push(`Direction: Goal alignment is ${goalLabels[calibration.goalAlignment]}`);
  
  lines.push('');
  lines.push('USAGE RULES:');
  lines.push('- Use calibration to explain behavioral patterns, not override them');
  lines.push('- Only quote ONE calibration answer per coaching section (max)');
  lines.push('- If calibration confirms what behavior already shows, stay silent');
  lines.push('- Mismatches between force/drag/structure are HIGH SIGNAL');
  
  return lines.join('\n');
}

// ============================================================================
// CONSTRAINT MODIFIERS
// ============================================================================

/**
 * How calibration modifies constraint interpretation
 * 
 * This is used by coaching generation to adjust assumptions
 */
export interface CalibrationModifiers {
  // Effort interpretation
  effortLevel: 'minimal' | 'moderate' | 'high';
  
  // Primary limiter (overrides inferred if high confidence)
  primaryLimiter?: 'time' | 'recovery' | 'mental' | null;
  
  // Risk posture
  riskPosture: 'conservative' | 'neutral' | 'aggressive';
  
  // Goal validity
  goalValid: boolean;
}

/**
 * Derive constraint modifiers from calibration
 */
export function deriveCalibrationModifiers(
  calibration: WeeklyCalibration | null
): CalibrationModifiers | null {
  
  if (!calibration || calibration.interpretationConfidence === 'low') {
    return null;
  }
  
  // Effort level
  const effortMap: Record<ForceLevel, 'minimal' | 'moderate' | 'high'> = {
    just_enough: 'minimal',
    steady_push: 'moderate',
    deliberate_shove: 'high'
  };
  
  // Primary limiter (only if explicitly stated)
  let primaryLimiter: 'time' | 'recovery' | 'mental' | null = null;
  if (calibration.dragSource === 'time_logistics') primaryLimiter = 'time';
  if (calibration.dragSource === 'recovery_energy') primaryLimiter = 'recovery';
  if (calibration.dragSource === 'mental_stress') primaryLimiter = 'mental';
  
  // Risk posture
  let riskPosture: 'conservative' | 'neutral' | 'aggressive' = 'neutral';
  if (calibration.structuralState === 'warning_signs' || 
      calibration.structuralState === 'something_wrong') {
    riskPosture = 'conservative';
  } else if (calibration.structuralState === 'solid' && 
             calibration.dragSource === 'none') {
    riskPosture = 'aggressive';
  }
  
  // Goal validity
  const goalValid = calibration.goalAlignment === 'clear_steady' || 
                    calibration.goalAlignment === 'mostly_less_urgent';
  
  return {
    effortLevel: effortMap[calibration.forceLevel],
    primaryLimiter,
    riskPosture,
    goalValid
  };
}