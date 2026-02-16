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
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/app/firebase/config';

/**
 * Calculate the week ID for the week that just ended.
 * If today is Monday, we want last week (previous Monday-Sunday).
 * 
 * Week format: YYYY-Www (e.g., "2026-W06")
 * Week runs Monday-Sunday (ISO 8601)
 */
function getPreviousWeekId(): string {
  const now = new Date();
  
  // Simple approach: Get current ISO week, subtract 1
  
  // Find Monday of current week
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  
  // Go back 7 days to last Monday
  monday.setDate(monday.getDate() - 7);
  
  // ISO week calculation
  const yearStart = new Date(monday.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((monday.getTime() - yearStart.getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + yearStart.getDay() + 1) / 7);
  
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get all user emails from Firestore users collection
 */
async function getAllUserEmails(): Promise<string[]> {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    const emails: string[] = [];
    snapshot.forEach((doc) => {
      emails.push(doc.id); // Document ID is the email
    });
    
    return emails;
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

  // 5. Generate coaching for each user
  const results: Array<{
    email: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const email of userEmails) {
    console.log(`[Cron] Processing: ${email}`);
    
    const result = await generateCoachingForUser(email, weekId, baseUrl);
    results.push({
      email,
      ...result,
    });

    if (result.success) {
      console.log(`[Cron] âœ“ Success: ${email}`);
    } else {
      console.error(`[Cron] âœ— Failed: ${email} - ${result.error}`);
    }
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