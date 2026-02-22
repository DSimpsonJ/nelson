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
      id: 'nutrition_quality',
      title: 'Nutrition Quality',
      prompt: 'How nutrient rich were your food choices yesterday?',
      tooltip:
        '**Elite:** All whole foods. Every meal intentional. No processed eating. ' +
        '**Solid:** Mostly whole foods. Intentional choices with some flexibility. ' +
        '**Not Great:** Mixed quality. Some whole foods, some convenience items. ' +
        '**Off:** Fast food, heavy snacking, or unstructured eating.',
      icon: '',
    },
    {
      id: 'portion_control',
      title: 'Portion Control',
      prompt: 'Did your intake align with your goals?',
      tooltip:
        '**Elite:** Fully aligned with your goals. Ate with control and stopped as planned. ' +
        '**Solid:** Generally aligned. Portions felt balanced. ' +
        '**Not Great:** Noticeably over or underate. Didn\'t match intention. ' +
        '**Off:** Way off target. Unstructured and misaligned.',
      icon: '',
    },
    {
      id: 'protein',
      title: 'Protein',
      prompt: `Did you pay attention to protein yesterday? (${proteinMin}-${proteinMax}g)`,
      tooltip:
        '**Elite:** Protein was a clear priority. Intentionally hit the upper end of your range. ' +
        '**Solid:** Included protein at every meal. Stayed within target range. ' +
        '**Not Great:** Got some protein, but likely missed your target. ' +
        '**Off:** Didn\'t prioritize protein. No attention to the target.',
      icon: '',
    },
    {
      id: 'hydration',
      title: 'Hydration',
      prompt: 'Daily fluid choices.',
      tooltip:
        '**Elite:** Hydrated intentionally all day. 64+ oz, mostly water. No alcohol or liquid calories. ' +
        '**Solid:** Stayed hydrated with mostly water. Minimal caloric drinks. ' +
        '**Not Great:** Inconsistent water. Relied on caloric drinks. ' +
        '**Off:** Little to no water. Heavy alcohol or sugary drinks.',
      icon: '',
    },
    {
      id: 'sleep',
      title: 'Sleep',
      prompt: 'Did your choices support good sleep?',
      tooltip:
        '**Elite:** Consistent schedule, 7+ hours in bed, intentional wind-down. Woke fully restored. ' +
        '**Solid:** Mostly consistent schedule, 7+ hours in bed. Woke feeling good. ' +
        '**Not Great:** Inconsistent schedule OR under 7 hours. Woke tired. ' +
        '**Off:** Late, short, or chaotic sleep. Woke exhausted.',
      icon: '',
    },
    {
      id: 'mindset',
      title: 'Mental State',
      prompt: 'How much mental capacity did you have yesterday?',
      tooltip:
        '**Elite:** Clear, focused, high energy. Emotionally steady and resilient. ' +
        '**Solid:** Stable and capable. Normal energy and clarity. A good day. ' +
        '**Not Great:** Low energy, distracted, or irritable. Pushed through. ' +
        '**Off:** Overwhelmed or mentally drained. Capacity was very low.',
      icon: '',
    },
    {
      id: 'movement',
      title: 'Bonus Activity',
      prompt: 'Outside of exercise, did you add extra movement?',
      tooltip:
        '**Elite:** Sought movement all day. Took every reasonable opportunity. ' +
        '**Solid:** Added one or two intentional movement choices. ' +
        '**Not Great:** Moved as usual. No intentional additions. ' +
        '**Off:** Minimized movement beyond what was required.',
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