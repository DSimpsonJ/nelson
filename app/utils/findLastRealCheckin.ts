import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Searches backwards through momentum history to find the last real check-in.
 * Skips gap-fill days and returns data from the most recent real check-in.
 * 
 * @param email - User's email
 * @param startDate - Date to start searching backwards from (as "YYYY-MM-DD")
 * @param maxDaysBack - Maximum number of days to search (default: 30)
 * @returns The data from the last real check-in, or null if not found
 */
export async function findLastRealCheckin(
  email: string,
  startDate: string,
  maxDaysBack: number = 30
): Promise<any | null> {
  const baseDate = new Date(startDate);
  
  for (let i = 1; i <= maxDaysBack; i++) {
    const lookbackDate = new Date(baseDate);
    lookbackDate.setDate(lookbackDate.getDate() - i);
    const lookbackKey = lookbackDate.toLocaleDateString("en-CA");
    
    const lookbackRef = doc(db, "users", email, "momentum", lookbackKey);
    const lookbackSnap = await getDoc(lookbackRef);
    
    if (lookbackSnap.exists()) {
      const data = lookbackSnap.data();
      
      // Found a real check-in
      if (data.checkinType === "real") {
        return {
          date: lookbackKey,
          data: data
        };
      }
    }
  }
  
  // No real check-in found within the lookback window
  return null;
}

/**
 * Gets a specific field value from the last real check-in.
 * Convenience wrapper around findLastRealCheckin.
 * 
 * @param email - User's email
 * @param startDate - Date to start searching backwards from
 * @param fieldName - Name of the field to extract
 * @param defaultValue - Value to return if field not found
 * @returns The field value, or defaultValue if not found
 */
export async function getLastRealValue<T>(
  email: string,
  startDate: string,
  fieldName: string,
  defaultValue: T
): Promise<T> {
  const result = await findLastRealCheckin(email, startDate);
  
  if (result && result.data[fieldName] !== undefined) {
    return result.data[fieldName];
  }
  
  return defaultValue;
}