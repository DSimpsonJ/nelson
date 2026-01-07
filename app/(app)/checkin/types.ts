// Canonical check-in types - single source of truth

export type BehaviorId = 
  | 'nutrition_pattern'
  | 'energy_balance'
  | 'protein'
  | 'hydration'
  | 'sleep'
  | 'mindset'
  | 'movement';

export type Rating = 'elite' | 'solid' | 'not_great' | 'off';

export type CheckinAnswers = Record<BehaviorId, Rating>;

export interface CheckinPayload {
  behaviorRatings: CheckinAnswers;  // Canonical - user truth
  behaviorGrades: number[];          // Derived - computed from ratings
  date: string;
}

export interface BehaviorMetadata {
  id: BehaviorId;
  title: string;
  prompt: string;
  tooltip: string;
  icon: string;
}

export interface RatingMetadata {
  value: Rating;
  label: string;
  grade: number;
  description?: string;
}