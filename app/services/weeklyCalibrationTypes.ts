export type ForceLevel = 'just_enough' | 'steady_push' | 'deliberate_shove';
export type DragSource = 'time_logistics' | 'recovery_energy' | 'mental_stress' | 'none';
export type StructuralState = 'solid' | 'stressed_holding' | 'warning_signs' | 'something_wrong';
export type GoalAlignment = 'clear_steady' | 'mostly_less_urgent' | 'not_really' | 'not_sure';
export type InterpretationConfidence = 'low' | 'medium' | 'high';

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