/**
 * HABIT CONFIGURATION
 * 
 * Foundation Habits: No levels, binary completion, identity work
 * Growth Habits: Leveled progression, capacity building
 */

// Foundation habits - no progression, always binary
export const foundationHabits = [
    "protein_daily",
    "hydration_100oz",
    "sleep_7hr",
    "no_late_eating",
  ] as const;
  
  // Growth habit progression ladders
  export const growthHabitLadder = {
    movement: [10, 12, 15, 20, 25, 30], // minutes
  } as const;
  
  // Type helpers
  export type FoundationHabit = typeof foundationHabits[number];
  export type GrowthHabitType = keyof typeof growthHabitLadder;
  
  /**
   * Determine if a habit is a growth habit (can level up)
   */
  export function isGrowthHabit(habitKey: string): boolean {
    return habitKey.startsWith("walk_") || habitKey.includes("movement_");
  }
  
  /**
   * Determine if a habit is a foundation habit (no levels)
   */
  export function isFoundationHabit(habitKey: string): boolean {
    return foundationHabits.some(fh => habitKey.includes(fh.split("_")[0]));
  }
  
  /**
   * Extract current level value from habit key
   * e.g. "walk_12min" -> 12
   */
  export function extractMinutes(habitKey: string): number | null {
    const match = habitKey.match(/(\d+)min/);
    return match ? parseInt(match[1], 10) : null;
  }
  
  /**
   * Get the next level for a growth habit
   * Returns null if already at max or not a growth habit
   */
  export function getNextLevel(habitKey: string): number | null {
    if (!isGrowthHabit(habitKey)) return null;
    
    const currentMin = extractMinutes(habitKey);
    if (currentMin === null) return null;
    
    const ladder = growthHabitLadder.movement;
    const currentIndex = ladder.indexOf(currentMin as 10 | 12 | 15 | 20 | 25 | 30);
    
    if (currentIndex === -1 || currentIndex >= ladder.length - 1) {
      return null; // Not found or already at max
    }
    
    return ladder[currentIndex + 1];
  }
  
  /**
   * Build the next level habit key
   * e.g. "walk_12min" -> "walk_15min"
   */
  export function getNextLevelHabitKey(habitKey: string): string | null {
    const nextMin = getNextLevel(habitKey);
    if (nextMin === null) return null;
    
    return `walk_${nextMin}min`;
  }
  
  /**
   * Get current level index (0-based)
   * Useful for displaying "Level 2 of 6"
   */
  export function getCurrentLevelIndex(habitKey: string): number {
    const currentMin = extractMinutes(habitKey);
    if (currentMin === null) return 0;
    
    const ladder = growthHabitLadder.movement;
    const index = ladder.indexOf(currentMin as 10 | 12 | 15 | 20 | 25 | 30);
    return index >= 0 ? index : 0;
  }
  
  /**
   * Get total levels available for a growth habit
   */
  export function getTotalLevels(habitType: GrowthHabitType): number {
    return growthHabitLadder[habitType].length;
  }
  
  /**
   * Check if habit is at max level
   */
  export function isMaxLevel(habitKey: string): boolean {
    const currentMin = extractMinutes(habitKey);
    if (currentMin === null) return false;
    
    const ladder = growthHabitLadder.movement;
    return currentMin === ladder[ladder.length - 1];
  }
  
  /**
   * Get human-readable level description
   * e.g. "Level 2 of 6"
   */
  export function getLevelDescription(habitKey: string): string {
    const currentIndex = getCurrentLevelIndex(habitKey);
    const total = getTotalLevels("movement");
    return `Level ${currentIndex + 1} of ${total}`;
  }