/**
 * HABIT EVENTS SYSTEM
 * 
 * Logs all significant habit-related events for history timeline
 */

import { doc, setDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/app/firebase/config";

// Event types
export type HabitEventType = 
  | "level_up"           // User advanced to next difficulty
  | "moved_to_stack"     // Primary habit moved to stack
  | "streak_saver_earned" // Earned a streak saver
  | "streak_saver_used"   // Used a streak saver
  | "new_primary"        // Started a new primary habit
  | "milestone_7day"     // 7 consecutive check-ins
  | "milestone_30day"    // 30 consecutive check-ins
  | "milestone_100day";  // 100 consecutive check-ins

export interface HabitEvent {
  id: string;
  type: HabitEventType;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO timestamp
  
  // Habit context
  habitKey?: string;
  habitName?: string;
  
  // Level-up specific
  fromLevel?: number;
  toLevel?: number;
  
  // Decline specific
  declineReason?: string;
  
  // Stack specific
  stackPosition?: number;
  
  // Streak specific
  streakLength?: number;
  saversRemaining?: number;
}

/**
 * Log a habit event to Firestore
 */
export async function logHabitEvent(
  email: string,
  event: Omit<HabitEvent, "id" | "timestamp">
): Promise<void> {
  const eventId = `${event.date}_${event.type}_${Date.now()}`;
  const eventRef = doc(db, "users", email, "habitEvents", eventId);
  
  const fullEvent: HabitEvent = {
    ...event,
    id: eventId,
    timestamp: new Date().toISOString(),
  };
  
  await setDoc(eventRef, fullEvent);
  console.log("[HabitEvents] Logged:", event.type, event.habitKey);
}

/**
 * Get recent habit events (for timeline display)
 */
export async function getRecentHabitEvents(
  email: string,
  limitCount: number = 50
): Promise<HabitEvent[]> {
  const eventsCol = collection(db, "users", email, "habitEvents");
  const q = query(eventsCol, orderBy("timestamp", "desc"), limit(limitCount));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as HabitEvent);
}

/**
 * Get events for a specific date (for day detail modal)
 */
export async function getEventsForDate(
  email: string,
  date: string
): Promise<HabitEvent[]> {
  const eventsCol = collection(db, "users", email, "habitEvents");
  const snapshot = await getDocs(eventsCol);
  
  return snapshot.docs
    .map(doc => doc.data() as HabitEvent)
    .filter(event => event.date === date);
}

/**
 * Get all level-up events (for progression visualization)
 */
export async function getLevelUpHistory(email: string): Promise<HabitEvent[]> {
  const eventsCol = collection(db, "users", email, "habitEvents");
  const snapshot = await getDocs(eventsCol);
  
  return snapshot.docs
    .map(doc => doc.data() as HabitEvent)
    .filter(event => event.type === "level_up")
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Helper to generate human-readable event descriptions
 */
export function getEventDescription(event: HabitEvent): string {
  switch (event.type) {
    case "level_up":
      return `Leveled up to ${event.toLevel} min walk`;
    
    case "moved_to_stack":
      return `Moved ${event.habitName || "habit"} to stack`;
    
    case "streak_saver_earned":
      return `Earned streak saver (${event.saversRemaining}/3)`;
    
    case "streak_saver_used":
      return `Used streak saver to maintain ${event.streakLength}-day streak`;
    
    case "new_primary":
      return `Started ${event.habitName} as primary focus`;
    
    case "milestone_7day":
      return `7-day check-in streak milestone`;
    
    case "milestone_30day":
      return `30-day check-in streak milestone 🎉`;
    
    case "milestone_100day":
      return `100-day check-in streak milestone 🔥`;
    
    default:
      return "Habit event";
  }
}

/**
 * Get event icon for timeline display
 */
export function getEventIcon(event: HabitEvent): string {
  switch (event.type) {
    case "level_up":
      return "📈";
    case "moved_to_stack":
      return "🧱";
    case "streak_saver_earned":
      return "🛡️";
    case "streak_saver_used":
      return "💾";
    case "new_primary":
      return "🎯";
    case "milestone_7day":
      return "⭐";
    case "milestone_30day":
      return "🎉";
    case "milestone_100day":
      return "🔥";
    default:
      return "📌";
  }
}