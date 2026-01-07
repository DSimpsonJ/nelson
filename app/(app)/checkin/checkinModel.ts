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
      tooltip:
        'Elite: Planned and executed as intended with no meaningful deviation. ' +
        'Solid: Intentional eating with minor, controlled deviation. ' +
        'Not Great: Intent existed, but food choices were inconsistent or reactive. ' +
        'Off: Little to no intentional structure. Mostly reactive or default eating.',
      icon: '',
    },
    {
      id: 'energy_balance',
      title: 'Energy Balance',
      prompt: 'Were your portions aligned with your goals?',
      tooltip:
        'Elite: Portions matched target as planned with high precision. ' +
        'Solid: Minor, controlled deviation from target. ' +
        'Not Great: Clear miss. Portions were meaningfully over or under target. ' +
        'Off: Major deviation with little or no portion control.',
      icon: '',
    },
    {
      id: 'protein',
  title: 'Protein',
  prompt: `Did you pay attention to protein yesterday? (${proteinMin}-${proteinMax}g)`,
  tooltip:
    'Elite: High-precision awareness. You could state your protein intake within a narrow range of grams. ' +
    'Solid: Protein was consciously prioritized and you are confident intake landed within the target range. ' +
    'Not Great: Protein intent was present, but intake likely fell outside the target range. ' +
    'Off: Little to no intentional attention to protein.',
  icon: '',
    },
    {
      id: 'hydration',
      title: 'Hydration',
      prompt: 'Did you stay hydrated yesterday? (64+ oz)',
      tooltip:
        'Elite: 64+ oz from water or non-caloric drinks only. ' +
        'Solid: 64+ oz, mostly water with minimal caloric drinks. ' +
        'Not Great: Below target or relied heavily on caloric drinks. ' +
        'Off: Little to no intentional hydration.',
      icon: '',
    },
    {
      id: 'sleep',
      title: 'Sleep',
      prompt: 'Did you set yourself up for quality sleep last night?',
      tooltip:
        'Elite: Consistent schedule (±30 min), 7+ hours in bed, intentional wind-down. ' +
        'Solid: Mostly consistent schedule with a 7+ hour sleep opportunity. ' +
        'Not Great: Inconsistent schedule **OR** insufficient sleep opportunity. ' +
'Off: Highly inconsistent schedule **AND** inadequate sleep opportunity.',
      icon: '',
    },
    {
      id: 'mindset',
      title: 'Mental State',
      prompt: 'How steady and functional were you yesterday?',
      tooltip:
        'Elite: Clear focus and emotional steadiness throughout the day. ' +
        'Solid: Generally steady with brief or manageable dips. ' +
        'Not Great: Focus or emotional regulation was meaningfully disrupted. ' +
        'Off: Mentally overwhelmed or emotionally taxed.',
      icon: '',
    },
    {
      id: 'movement',
      title: 'Bonus Activity',
      prompt: 'Did you look for extra movement opportunities yesterday?',
      tooltip:
        'Elite: Consistently sought and took extra movement opportunities. ' +
        'Solid: Added one or two intentional movement opportunities. ' +
        'Not Great: Movement was incidental with no intentional extras. ' +
        'Off: Little to no intentional movement.',
      icon: '',
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
  },
  {
    value: 'solid',
    label: 'Solid',
    grade: 80,
  },
  {
    value: 'not_great',
    label: 'Not Great',
    grade: 50,
  },
  {
    value: 'off',
    label: 'Off',
    grade: 0,
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