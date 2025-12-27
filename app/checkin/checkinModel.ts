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
      prompt: 'How was the quality of what you ate yesterday?',
      tooltip: 'Elite: All whole foods, planned and clean. Solid: Mostly whole foods, minimal processing. Not Great: Mix of whole foods and processed items. Off: Mostly processed, fast food, or random snacks.',
      icon: '🍽️',
    },
    {
      id: 'energy_balance',
      title: 'Energy Balance',
      prompt: 'Were your portions aligned with your goals?',
      tooltip: 'Elite: Portions aligned with goals, not stuffed or hungry. Solid: Ate appropriately, maybe slightly over or under. Not Great: Noticeably overate or underate. Off: Way off target in either direction.',
      icon: '⚖️',
    },
    {
      id: 'protein',
      title: 'Protein',
      prompt: `Did you pay attention to protein yesterday? (${proteinMin}-${proteinMax}g)`,
      tooltip: 'Elite: Tracked and hit the high end of your range. Solid: Protein at every meal, stayed in range. Not Great: Missed range, got some but didn\'t prioritize. Off: No attention to protein.',
      icon: '🥩',
    },
    {
      id: 'hydration',
      title: 'Hydration',
      prompt: 'Did you stay hydrated yesterday? (64+ oz)',
      tooltip: 'Elite: 64+ oz, consistent intake, zero empty-calorie beverages. Solid: 64+ oz, mostly water, maybe one drink with calories. Not Great: Got fluids but relied on caloric beverages. Off: Dehydrated, infrequent bathroom trips.',
      icon: '💧',
    },
    {
      id: 'sleep',
      title: 'Sleep',
      prompt: 'Did you set yourself up for quality sleep last night?',
      tooltip: 'Elite: Consistent schedule (±30 min), 7+ hours opportunity, wind-down routine, woke fully restored. Solid: Mostly consistent, 7+ hours, some routine, woke pretty good. Not Great: Inconsistent schedule OR under 7 hours, woke tired. Off: Random schedule, inadequate opportunity, woke wrecked.',
      icon: '😴',
    },
    {
      id: 'mindset',
      title: 'Mindset',
      prompt: 'How was your mental state yesterday?',
      tooltip: 'Elite: Clear, focused, optimistic, strong. Solid: Good and steady, normal energy and clarity. Not Great: Distracted, irritable, or low energy. Off: Mentally taxed or overwhelmed.',
      icon: '🧠',
    },
    {
      id: 'movement',
      title: 'Movement',
      prompt: 'Did you look for extra movement opportunities yesterday?',
      tooltip: 'Elite: Looked for and took movement opportunities all day. Solid: Added one or two intentional opportunities beyond basic activity. Not Great: Basic daily movement, extras were unintentional. Off: Kept movement to a minimum.',
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