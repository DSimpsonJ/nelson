import { BehaviorMetadata, RatingMetadata, Rating, BehaviorId } from './types';

// Canonical behavior list - ORDER IS PERMANENT
// Never sort dynamically, always use BEHAVIORS.map()
export const BEHAVIORS: BehaviorMetadata[] = [
  {
    id: 'nutrition_pattern',
    title: 'Nutrition Pattern',
    prompt: 'How was the structure and overall quality of your meals yesterday?',
    tooltip: 'Planned, whole foods, zero deviation = Elite. Wise, intentional choices = Solid. Random, unstructured = Not Great.',
    icon: '🍽️',
  },
  {
    id: 'energy_balance',
    title: 'Energy Balance',
    prompt: 'Did you undereat, eat as intended, overeat, or have an indulgent day?',
    tooltip: 'Perfect alignment with needs = Elite. Appropriate intake = Solid. Heavy or light day = Not Great.',
    icon: '⚖️',
  },
  {
    id: 'protein',
    title: 'Protein',
    prompt: 'How did you do with protein yesterday?',
    tooltip: 'Hit target at every meal = Elite. Hit daily target = Solid. Close but missed = Not Great. Way off = Off.',
    icon: '🥩',
  },
  {
    id: 'hydration',
    title: 'Hydration',
    prompt: 'How was your hydration yesterday?',
    tooltip: 'Crushed your target = Elite. Hit your target = Solid. Got close = Not Great. Forgot about it = Off.',
    icon: '💧',
  },
  {
    id: 'sleep',
    title: 'Sleep',
    prompt: 'How was your sleep last night?',
    tooltip: '7+ hours, great quality, no screens before bed = Elite. 7+ hours, decent quality = Solid. Less than 7 or poor quality = Not Great.',
    icon: '😴',
  },
  {
    id: 'mindset',
    title: 'Mindset',
    prompt: 'How was your overall mindset yesterday?',
    tooltip: 'Clear, focused, positive = Elite. Steady and productive = Solid. Foggy or distracted = Not Great. Completely off = Off.',
    icon: '🧠',
  },
  {
    id: 'movement',
    title: 'Movement',
    prompt: 'How was your movement yesterday?',
    tooltip: 'Your commitment + bonus activity = Elite. Commitment completed = Solid. Partial effort = Not Great. Skipped = Off.',
    icon: '🚶',
  },
];

// Canonical rating structure - LABELS ARE PERMANENT
// Always Elite/Solid/Not Great/Off, never change to Yes/No or other variants
export const RATINGS: RatingMetadata[] = [
  {
    value: 'elite',
    label: 'Elite',
    grade: 100,
    description: 'Rare performance',
  },
  {
    value: 'solid',
    label: 'Solid',
    grade: 80,
    description: 'Hit the standard',
  },
  {
    value: 'not_great',
    label: 'Not Great',
    grade: 50,
    description: 'Showed up anyway',
  },
  {
    value: 'off',
    label: 'Off',
    grade: 0,
    description: 'Happens to everyone',
  },
];

// Rating to grade mapping - CANONICAL TRUTH
// Grades are derived from ratings, ratings are user truth
export function getRatingGrade(rating: string): number {
  const found = RATINGS.find(r => r.value === rating);
  return found?.grade ?? 0;
}

// Get behavior order - use this, never Object.keys()
export function getBehaviorOrder(): BehaviorId[] {
  return BEHAVIORS.map(b => b.id);
}

// Get behavior metadata by ID
export function getBehavior(id: BehaviorId): BehaviorMetadata | undefined {
  return BEHAVIORS.find(b => b.id === id);
}

// Get rating metadata by value
export function getRating(value: string): RatingMetadata | undefined {
  return RATINGS.find(r => r.value === value);
}

// Convert answers to grades array (maintains behavior order)
export function answersToGrades(answers: Record<string, string>): number[] {
  return BEHAVIORS.map(behavior => 
    getRatingGrade(answers[behavior.id] || 'off')
  );
}