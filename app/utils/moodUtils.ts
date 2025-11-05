// utils/moodUtils.ts
export function moodToScore(mood: string): number {
    switch (mood?.toLowerCase()) {
      case "energized":
        return 3;
      case "okay":
        return 2;
      case "tired":
        return 1;
      default:
        return 0;
    }
  }