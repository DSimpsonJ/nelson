import { BehaviorMetadata, RatingMetadata, Rating, BehaviorId } from './types';

// Function to generate behaviors with dynamic user data
export function getBehaviors(userWeight?: number): BehaviorMetadata[] {
  // Calculate protein range from weight
  const weight = userWeight || 170;
  const cappedWeight = Math.min(weight, 240);
  const proteinMin = Math.round(cappedWeight * 0.6);
  const proteinMax = Math.round(cappedWeight * 1.0);

  return [
    {
      id: 'nutrition_pattern',
      title: 'Nutrition Pattern',
      prompt: 'How was the structure and overall quality of your meals yesterday?',
      tooltip: 'Elite: Planned meals, whole foods, perfect execution. Solid: Intentional choices, mostly whole foods. Not Great: Random eating, processed foods. Off: Total chaos or missed meals.',
      icon: '🍽️',
    },
    {
      id: 'energy_balance',
      title: 'Energy Balance',
      prompt: 'Did you undereat, eat as intended, overeat, or have an indulgent day?',
      tooltip: 'Elite: Perfect portions, aligned with your goals and hunger. Solid: Appropriate intake, slight variation okay. Not Great: Noticeably over or under ate. Off: Way off target in either direction.',
      icon: '⚖️',
    },
    {
      id: 'protein',
      title: 'Protein',
      prompt: `How did you do with protein yesterday? (${proteinMin}-${proteinMax}g)`,
      tooltip: 'Elite: Hit target at every meal (breakfast, lunch, dinner). Solid: Hit daily target across all meals. Not Great: Got close but missed by 20-30g. Off: Way short of target or forgot completely.',
      icon: '🥩',
    },
    {
      id: 'hydration',
      title: 'Hydration',
      prompt: 'How was your hydration yesterday? (64-100oz)',
      tooltip: 'Elite: Exceeded target, urine clear/light yellow all day. Solid: Hit your daily target consistently. Not Great: Got close but fell short. Off: Barely drank water, dark urine.',
      icon: '💧',
    },
    {
      id: 'sleep',
      title: 'Sleep',
      prompt: 'How was your sleep last night?',
      tooltip: 'Elite: 7-9 hours, woke refreshed, consistent schedule, no screens 1hr before bed. Solid: 7+ hours, decent quality, woke mostly rested. Not Great: Under 7 hours or poor quality. Off: Barely slept or terrible quality.',
      icon: '😴',
    },
    {
      id: 'mindset',
      title: 'Mindset',
      prompt: 'How was your overall mindset yesterday?',
      tooltip: 'Elite: Clear, focused, positive, handled stress well. Solid: Steady and productive, normal ups and downs. Not Great: Foggy, distracted, or low energy. Off: Overwhelmed, anxious, or completely checked out.',
      icon: '🧠',
    },
    {
      id: 'movement',
      title: 'Movement',
      prompt: 'How was your movement yesterday?',
      tooltip: 'Elite: Completed your commitment PLUS bonus activity (walk, stretch, extra sets). Solid: Completed your full commitment. Not Great: Started but didn\'t finish, partial effort. Off: Skipped completely.',
      icon: '🚶',
    },
  ];
}

// For backwards compatibility - default behaviors
export const BEHAVIORS = getBehaviors();

// Canonical rating structure
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

export function getRatingGrade(rating: string): number {
  const found = RATINGS.find(r => r.value === rating);
  return found?.grade ?? 0;
}

export function getBehaviorOrder(): BehaviorId[] {
  return BEHAVIORS.map(b => b.id);
}

export function getBehavior(id: BehaviorId): BehaviorMetadata | undefined {
  return BEHAVIORS.find(b => b.id === id);
}

export function getRating(value: string): RatingMetadata | undefined {
  return RATINGS.find(r => r.value === value);
}

export function answersToGrades(answers: Record<string, string>): number[] {
  return BEHAVIORS.map(behavior => 
    getRatingGrade(answers[behavior.id] || 'off')
  );
}