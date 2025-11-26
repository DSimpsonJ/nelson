export type DayVisualState = "solid" | "outline" | "empty";

export function getDayVisualState(
  primaryHit: boolean,
  lifestyle: {
    nutrition: boolean;
    sleep: boolean;
    hydration: boolean;
    movement: boolean;
  }
): DayVisualState {
  if (primaryHit) return "solid";

  const lifestyleHit =
    lifestyle.nutrition ||
    lifestyle.sleep ||
    lifestyle.hydration ||
    lifestyle.movement;

  if (lifestyleHit) return "outline";

  return "empty";
}