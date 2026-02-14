import { collection, addDoc, query, orderBy, limit, getDocs, where, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/app/firebase/config';
import { WeightEntry, WeightTrend } from '@/app/types/weight';

/**
 * Get ISO week string from date (YYYY-WXX format)
 */
function getWeekOf(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const dayOfWeek = d.getUTCDay();
  const nearestThursday = new Date(d);
  nearestThursday.setUTCDate(d.getUTCDate() + 4 - (dayOfWeek || 7));
  const yearStart = new Date(Date.UTC(nearestThursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((nearestThursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${nearestThursday.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

/**
 * Log a new weight entry
 */
export async function logWeight(email: string, weight: number): Promise<void> {
    const today = new Date().toLocaleDateString('en-CA');
    const weekOf = getWeekOf(today);
    
    const weightRef = collection(db, 'users', email, 'weightHistory');
    
    // Check if entry already exists for today
    const q = query(weightRef, where('date', '==', today));
    const existing = await getDocs(q);
    
    if (!existing.empty) {
      // Update existing entry
      const docRef = existing.docs[0].ref;
      await setDoc(docRef, {
        date: today,
        weight,
        timestamp: new Date().toISOString(),
        weekOf,
      });
    } else {
      // Create new entry
      await addDoc(weightRef, {
        date: today,
        weight,
        timestamp: new Date().toISOString(),
        weekOf,
      });
    }
  }

/**
 * Get weight trend over last 4 weeks
 */
export async function getWeightTrend(email: string): Promise<WeightTrend> {
  const weightRef = collection(db, 'users', email, 'weightHistory');
  const q = query(weightRef, orderBy('timestamp', 'desc'), limit(50)); // Get last 50 entries
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return {
      current: null,
      fourWeekChange: null,
      direction: 'stable',
      message: 'No weight logged yet',
    };
  }
  
  // Get all entries
  const entries = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as WeightEntry[];
  
  // Get current (latest entry)
  const current = entries[0].weight;
  
  // Group by week and calculate weekly averages
  const weeklyAverages = new Map<string, number[]>();
  
  entries.forEach(entry => {
    if (!weeklyAverages.has(entry.weekOf)) {
      weeklyAverages.set(entry.weekOf, []);
    }
    weeklyAverages.get(entry.weekOf)!.push(entry.weight);
  });
  
  // Calculate average for each week
  const weeklyData: { week: string; avg: number }[] = [];
  weeklyAverages.forEach((weights, week) => {
    const avg = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    weeklyData.push({ week, avg });
  });
  
  // Sort by week (descending - newest first)
  weeklyData.sort((a, b) => b.week.localeCompare(a.week));
  
  // Need at least 2 weeks for a trend
  if (weeklyData.length < 2) {
    return {
      current,
      fourWeekChange: null,
      direction: 'stable',
      message: 'Need more data',
    };
  }
  
  // Get last 4 weeks (or however many we have)
  const recentWeeks = weeklyData.slice(0, Math.min(4, weeklyData.length));
  
  // Compare newest week vs oldest week in the range
  const newestWeekAvg = recentWeeks[0].avg;
  const oldestWeekAvg = recentWeeks[recentWeeks.length - 1].avg;
  
  const change = newestWeekAvg - oldestWeekAvg;
  
  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (change > 0.5) direction = 'up';
  if (change < -0.5) direction = 'down';
  
  const message = direction === 'stable' 
    ? 'Trend: stable'
    : `${recentWeeks.length}-week trend: ${change > 0 ? '+' : ''}${change.toFixed(1)} lbs`;
  
  return {
    current,
    fourWeekChange: change,
    direction,
    message,
  };
}
/**
 * Get latest weight entry with date
 */
export async function getLatestWeightEntry(email: string): Promise<{ date: string; weight: number } | null> {
    const weightRef = collection(db, 'users', email, 'weightHistory');
    const q = query(weightRef, orderBy('timestamp', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return null;
    
    const data = snapshot.docs[0].data();
    return {
      date: data.date,
      weight: data.weight,
    };
  }
/**
 * Get latest weight entry
 */
export async function getLatestWeight(email: string): Promise<number | null> {
  const weightRef = collection(db, 'users', email, 'weightHistory');
  const q = query(weightRef, orderBy('timestamp', 'desc'), limit(1));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  return snapshot.docs[0].data().weight;
}