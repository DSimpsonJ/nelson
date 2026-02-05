/**
 * GET /api/cron/generate-weekly-coaching
 * 
 * Runs every Monday at 8am UTC (3am Eastern)
 * Generates weekly coaching for all users with 6+ check-ins in previous week
 * 
 * Flow:
 * 1. Verify cron secret (Vercel authentication)
 * 2. Get all users from Firestore
 * 3. For each user, check previous week's check-in count
 * 4. If >= 6 check-ins, generate coaching
 * 5. Return summary of results
 */

import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/app/firebase/config';
import { detectWeeklyPattern } from '@/app/services/detectWeeklyPattern';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the previous week's weekId
 * If today is Monday Feb 10, 2026, returns "2026-W06" (last week)
 */
function getPreviousWeekId(): string {
  const now = new Date();
  
  // Go back 7 days to get last week
  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  // Get ISO week number
  const firstDayOfYear = new Date(lastWeek.getFullYear(), 0, 1);
  const pastDaysOfYear = (lastWeek.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  
  return `${lastWeek.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Get week date range for a weekId
 */
function getWeekDateRange(weekId: string): { start: string; end: string } {
  // Parse weekId like "2026-W06"
  const [year, week] = weekId.split('-W').map(Number);
  
  // Get first day of year
  const firstDayOfYear = new Date(year, 0, 1);
  
  // Calculate the Monday of the target week
  const daysToMonday = (week - 1) * 7 - firstDayOfYear.getDay() + 1;
  const monday = new Date(year, 0, 1 + daysToMonday);
  
  // Sunday is 6 days after Monday
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0]
  };
}

/**
 * Count check-ins for a user in a specific week
 */
async function getCheckInCount(email: string, weekId: string): Promise<number> {
  const { start, end } = getWeekDateRange(weekId);
  
  const momentumRef = collection(db, 'users', email, 'momentum');
  const q = query(
    momentumRef,
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.size;
}

/**
 * Generate coaching for a single user
 * Reuses existing logic from /api/generate-weekly-coaching
 */
async function generateCoachingForUser(email: string, weekId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    console.log(`[Cron] Generating coaching for ${email}, week ${weekId}`);
    
    // Detect pattern for the week
    const pattern = await detectWeeklyPattern(email, weekId);
    
    if (!pattern.canCoach) {
      console.log(`[Cron] ${email} - Pattern detected but not eligible for coaching`);
      return { success: false, error: 'Not eligible for coaching' };
    }
    
    // Call the existing generate-weekly-coaching API endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate-weekly-coaching`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, weekId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`[Cron] ✓ Generated coaching for ${email}`);
      return { success: true };
    } else {
      console.log(`[Cron] ✗ Failed for ${email}:`, result.errors);
      return { success: false, error: result.errors?.[0] || 'Unknown error' };
    }
    
  } catch (error) {
    console.error(`[Cron] Error generating for ${email}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ============================================================================
// MAIN CRON HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  console.log('[Cron] Weekly coaching generation started');
  const startTime = Date.now();
  
  // 1. Verify cron secret (Vercel passes this in Authorization header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('[Cron] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // 2. Get previous week's weekId
    const weekId = getPreviousWeekId();
    console.log(`[Cron] Generating coaching for week: ${weekId}`);
    
    // 3. Get all users
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    console.log(`[Cron] Found ${usersSnapshot.size} total users`);
    
    const results: Array<{
      email: string;
      checkIns: number;
      generated: boolean;
      error?: string;
    }> = [];
    
    // 4. Process each user
    for (const userDoc of usersSnapshot.docs) {
      const email = userDoc.id;
      
      // Check if user has 6+ check-ins last week
      const checkInCount = await getCheckInCount(email, weekId);
      console.log(`[Cron] ${email}: ${checkInCount} check-ins`);
      
      if (checkInCount >= 6) {
        // Generate coaching
        const result = await generateCoachingForUser(email, weekId);
        
        results.push({
          email,
          checkIns: checkInCount,
          generated: result.success,
          error: result.error
        });
      } else {
        // Not enough check-ins
        results.push({
          email,
          checkIns: checkInCount,
          generated: false,
          error: 'Insufficient check-ins (need 6+)'
        });
      }
    }
    
    // 5. Summary
    const generated = results.filter(r => r.generated).length;
    const failed = results.filter(r => !r.generated && r.checkIns >= 6).length;
    const insufficient = results.filter(r => r.checkIns < 6).length;
    const duration = Date.now() - startTime;
    
    console.log(`[Cron] Complete in ${duration}ms - Generated: ${generated}, Failed: ${failed}, Insufficient: ${insufficient}`);
    
    return NextResponse.json({
      success: true,
      weekId,
      summary: {
        totalUsers: usersSnapshot.size,
        generated,
        failed,
        insufficientCheckIns: insufficient,
        durationMs: duration
      },
      results
    });
    
  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}