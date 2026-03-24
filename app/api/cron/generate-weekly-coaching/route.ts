/**
 * GET /api/cron/generate-weekly-coaching
 * 
 * Vercel Cron Job - Runs every Monday at 8am UTC (3am Eastern)
 * 
 * Generates weekly coaching for ALL users for the week that just ended.
 * Week runs Monday-Sunday, so when this runs on Monday morning, it generates
 * coaching for the previous Monday-Sunday period.
 * 
 * Flow:
 * 1. Verify cron secret (security)
 * 2. Calculate previous week ID (the week that just ended)
 * 3. Fetch all users from Firestore
 * 4. For each user, call /api/generate-weekly-coaching
 * 5. Return summary of successes/failures
 * 
 * Environment Variables Required:
 * - CRON_SECRET: Secure random string for authentication
 * - NEXT_PUBLIC_APP_URL: Base URL (e.g., https://nelson-nu.vercel.app)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/app/firebase/admin';

/**
 * Calculate the week ID for the week that just ended.
 * If today is Monday, we want last week (previous Monday-Sunday).
 * 
 * Week format: YYYY-Www (e.g., "2026-W06")
 * Week runs Monday-Sunday (ISO 8601)
 */
function getPreviousWeekId(): string {
  const now = new Date();
  const lastWeek = new Date(now);
  lastWeek.setDate(now.getDate() - 7);

  // ISO 8601: anchor on Thursday of the target week
  const dayOfWeek = lastWeek.getDay();
  const thursday = new Date(lastWeek);
  thursday.setDate(lastWeek.getDate() + (4 - (dayOfWeek === 0 ? 7 : dayOfWeek)));

  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));

  const weekNum = Math.round((thursday.getTime() - weekOneMonday.getTime()) / 604800000) + 1;

  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get all user emails from Firestore users collection
 */
async function getAllUserEmails(): Promise<string[]> {
  try {
    const snapshot = await adminDb.collection('users').get();
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toLocaleDateString('en-CA'); // YYYY-MM-DD

    return snapshot.docs
      .filter(doc => {
        const data = doc.data();
        if (data.hasCommitment !== true) return false;
        const lastCheckIn = data.lastCheckInDate;
        if (!lastCheckIn) return false;
        return lastCheckIn >= cutoffStr;
      })
      .map(doc => doc.id);
  } catch (error) {
    console.error('[Cron] Error fetching users:', error);
    throw error;
  }
}

/**
 * Call the generate-weekly-coaching API for a single user
 */
async function generateCoachingForUser(
  email: string, 
  weekId: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/generate-weekly-coaching`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({
        email,
        weekId,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  console.log('[Cron] Weekly coaching generation started');
  
  // 1. Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Cron] Invalid authorization');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 2. Calculate previous week ID
  const weekId = getPreviousWeekId();
  console.log(`[Cron] Generating coaching for week: ${weekId}`);

  // 3. Get base URL for API calls
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nelson-nu.vercel.app';
  console.log(`[Cron] Using base URL: ${baseUrl}`);

  // 4. Fetch all users
  let userEmails: string[];
  try {
    userEmails = await getAllUserEmails();
    console.log(`[Cron] Found ${userEmails.length} users`);
  } catch (error) {
    console.error('[Cron] Failed to fetch users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }

  if (userEmails.length === 0) {
    console.log('[Cron] No users found');
    return NextResponse.json({
      success: true,
      weekId,
      totalUsers: 0,
      results: [],
      duration: Date.now() - startTime,
    });
  }

 // 5. Generate coaching for each user sequentially to avoid rate limits
 const results: { email: string; success: boolean; error?: string }[] = [];

 for (const email of userEmails) {
   console.log(`[Cron] Processing: ${email}`);
   const result = await generateCoachingForUser(email, weekId, baseUrl);
   results.push({ email, success: result.success, error: result.error });
   // Small delay between users to avoid Anthropic rate limits
   await new Promise(resolve => setTimeout(resolve, 1500));
 }

  // 6. Calculate summary
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const duration = Date.now() - startTime;

  console.log(`[Cron] Completed: ${successCount} successes, ${failureCount} failures in ${duration}ms`);

  return NextResponse.json({
    success: true,
    weekId,
    totalUsers: userEmails.length,
    successCount,
    failureCount,
    duration,
    results,
  });
}