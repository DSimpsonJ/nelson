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
      return { icon: "🔥", message: `7 day streak. Great job hitting a week. Don't stop!` };
    }
  
    if (streak > 7 && streak < 13) {
      return { icon: "🔥", message: `${streak} day streak. Strong momentum, keep it rolling!` };
    }
  
    if (streak === 13) {
      return { icon: "🔥", message: `13 day streak. You're one away from two full weeks!` };
    }
  
    if (streak === 14) {
      return { icon: "🔥🔥", message: `14 day streak. Two solid weeks. Keep it going!` };
    }
  
    if (streak >= 20 && streak < 30) {
      return { icon: "🔥🔥", message: `${streak} day streak. Unstoppable consistency!` };
    }
  
    if (streak >= 30 && streak < 50) {
      return { icon: "👑🔥", message: `${streak} day streak. 30 days strong. Major milestone unlocked.` };
    }
  
    if (streak >= 50 && streak < 100) {
      return { icon: "💪🔥", message: `${streak} day streak. Fifty days of consistency. That’s elite discipline.` };
    }
  
    if (streak >= 100) {
      return { icon: "🏆🔥", message: `${streak} day streak. 100 days strong. You’ve built an unbreakable habit.` };
    }
  
    return { icon: "🔥", message: `${streak} day streak. Stay the course!` };
  }