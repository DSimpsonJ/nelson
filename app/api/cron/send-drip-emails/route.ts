/**
 * GET /api/cron/send-drip-emails
 * Vercel Cron Job - Runs daily at 10am UTC
 * Sends day 13 and day 14 emails to eligible users
 */

import { adminDb } from '@/app/firebase/admin';
import {
  sendConversionEmail,
  sendPrePaywallEmail,
  sendReengagementEmail,
} from '@/app/services/emailService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toLocaleDateString('en-CA');
  const results = { prePaywall: 0, conversion: 0, reengagement: 0, errors: 0 };

  try {
    const usersSnap = await adminDb.collection('users').get();

    for (const userDoc of usersSnap.docs) {
      const email = userDoc.id;
      const data = userDoc.data();
      const firstName = data.firstName || data.name || undefined;

      try {
        // Get firstCheckinDate from metadata
        const metaSnap = await adminDb
          .collection('users').doc(email)
          .collection('metadata').doc('accountInfo')
          .get();

        if (!metaSnap.exists) continue;

        const firstCheckinDate = metaSnap.data()?.firstCheckinDate;
        if (!firstCheckinDate) continue;

        const accountAgeDays = Math.floor(
          (new Date(today).getTime() - new Date(firstCheckinDate).getTime()) /
          (1000 * 60 * 60 * 24)
        ) + 1;

        // Day 13 -- pre-paywall warmup
        if (accountAgeDays === 13) {
          await sendPrePaywallEmail(email, firstName);
          results.prePaywall++;
        }

        // Day 14 -- conversion
        if (accountAgeDays === 14) {
          await sendConversionEmail(email, firstName);
          results.conversion++;
        }

        // Re-engagement -- 3 days no check-in
        if (accountAgeDays > 7) {
          const threeDaysAgo = new Date(today + 'T00:00:00');
          threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
          const threeDaysAgoKey = threeDaysAgo.toLocaleDateString('en-CA');

          const recentSnap = await adminDb
            .collection('users').doc(email)
            .collection('momentum')
            .where('date', '>=', threeDaysAgoKey)
            .where('checkinCompleted', '==', true)
            .limit(1)
            .get();

          if (recentSnap.empty) {
            // Check we haven't already sent re-engagement recently
            const lastReengagement = data.lastReengagementEmail;
            const daysSinceLast = lastReengagement
              ? Math.floor(
                  (new Date(today).getTime() - new Date(lastReengagement).getTime()) /
                  (1000 * 60 * 60 * 24)
                )
              : 999;

            if (daysSinceLast >= 7) {
              await sendReengagementEmail(email, firstName);
              await adminDb.collection('users').doc(email).update({
                lastReengagementEmail: today,
              });
              results.reengagement++;
            }
          }
        }

        // Sequential delay to avoid rate limits
        await new Promise(res => setTimeout(res, 300));

      } catch (userErr) {
        console.error(`[drip-emails] Error for ${email}:`, userErr);
        results.errors++;
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[drip-emails] Fatal error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}