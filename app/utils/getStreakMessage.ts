// utils/getStreakMessage.ts

/**
 * Returns the right emoji and motivational message
 * for a user's check-in streak.
 */
export function getStreakMessage(streak: number): { icon: string; message: string } {
  if (streak < 2) {
    return { icon: "🔥", message: `${streak} day streak. Keep showing up!` };
  }

  if (streak < 6) {
    return { icon: "🔥", message: `${streak} day streak. Stay consistent!` };
  }

  if (streak === 6) {
    return { icon: "🔥", message: `6 day streak. One more for a full week!` };
  }

  if (streak === 7) {
    return { icon: "🔥", message: `7 days straight. That's a full week.` };
  }

  if (streak > 7 && streak < 13) {
    return { icon: "🔥", message: `${streak} days. Real momentum building.` };
  }

  if (streak === 13) {
    return { icon: "🔥", message: `13 day streak. You're one away from two full weeks!` };
  }

  if (streak === 14) {
    return { icon: "🔥🔥", message: `14 day streak. Two solid weeks. Keep it going!` };
  }

  if (streak >= 15 && streak < 20) {
    return { icon: "🔥🔥", message: `${streak} days. The pattern is solid.` };
  }

  if (streak >= 20 && streak < 30) {
    return { icon: "🔥🔥", message: `${streak} days. This is consistent execution.` };
  }

  if (streak >= 30 && streak < 50) {
    return { icon: "👑🔥", message: `${streak} days strong. This is who you are now.` };
  }

  if (streak >= 50 && streak < 100) {
    return { icon: "💪🔥", message: `${streak} days straight. This level of consistency is rare.` };
  }

  if (streak >= 100) {
    return { icon: "🏆🔥", message: `${streak} days. You've built something lasting.` };
  }

  return { icon: "🔥", message: `${streak} day streak. Stay the course!` };
}