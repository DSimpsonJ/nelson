/**
 * GET /api/cron/send-drip-emails
 * Vercel Cron Job - Runs daily at 10am UTC
 * Sends day 13 and day 14 emails to eligible users
 */

import { adminDb } from '@/app/firebase/admin';
import {
  triggerConversionEmail,
  triggerEscalation1Email,
  triggerEscalation2Email,
  triggerPrePaywallEmail,
  triggerReengagementEmail,
  triggerWelcomeEmail,
} from '@/app/services/loopsService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Respond immediately so cron-job.org doesn't time out
  // Vercel continues processing in the background
  (async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const results = { welcome: 0, prePaywall: 0, conversion: 0, reengagement: 0, escalation1: 0, escalation2: 0, errors: 0 };

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
        if (accountAgeDays === 1) {
            await triggerWelcomeEmail(email, firstName);
            results.welcome++;
          }
  
          if (accountAgeDays === 13) {
            await triggerPrePaywallEmail(email, firstName);
            results.prePaywall++;
          }
  
          if (accountAgeDays === 14) {
            await triggerConversionEmail(email, firstName);
            results.conversion++;
          }

        // Re-engagement -- 2 days no check-in (fires regardless of account age > 3)
        if (accountAgeDays > 3) {
          const twoDaysAgo = new Date(today + 'T00:00:00');
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
          const twoDaysAgoKey = twoDaysAgo.toLocaleDateString('en-CA');

          const recentSnap = await adminDb
            .collection('users').doc(email)
            .collection('momentum')
            .where('date', '>=', twoDaysAgoKey)
            .where('checkinCompleted', '==', true)
            .limit(1)
            .get();

          if (recentSnap.empty) {
            // 2-day re-engagement (welcome sequence still running, fire anyway)
            const lastReengagement = data.lastReengagementEmail;
            const daysSinceLast = lastReengagement
              ? Math.floor(
                  (new Date(today).getTime() - new Date(lastReengagement).getTime()) /
                  (1000 * 60 * 60 * 24)
                )
              : 999;

            if (daysSinceLast >= 7) {
              await triggerReengagementEmail(email, firstName);
              await adminDb.collection('users').doc(email).update({
                lastReengagementEmail: today,
              });
              results.reengagement++;
            }

            // Escalation 1 -- fires only after welcome sequence ends (day 14+)
            // Requires 7+ days inactive and never sent before (or sent 30+ days ago)
            if (accountAgeDays > 13) {
              const sevenDaysAgo = new Date(today + 'T00:00:00');
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              const sevenDaysAgoKey = sevenDaysAgo.toLocaleDateString('en-CA');

              const lastEscalation1 = data.lastEscalation1Email;
              const daysSinceEscalation1 = lastEscalation1
                ? Math.floor(
                    (new Date(today).getTime() - new Date(lastEscalation1).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 999;

              // Last check-in must be 7+ days ago
              const lastCI = data.lastCheckInDate;
              const daysSinceCI = lastCI
                ? Math.floor(
                    (new Date(today).getTime() - new Date(lastCI + 'T00:00:00').getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 999;

              if (daysSinceCI >= 7 && daysSinceEscalation1 >= 30) {
                await triggerEscalation1Email(email, firstName);
                await adminDb.collection('users').doc(email).update({
                  lastEscalation1Email: today,
                });
                results.escalation1++;
              }
            }

            // Escalation 2 -- final attempt, 14+ days inactive, after welcome sequence
            if (accountAgeDays > 13) {
              const lastEscalation2 = data.lastEscalation2Email;
              const daysSinceEscalation2 = lastEscalation2
                ? Math.floor(
                    (new Date(today).getTime() - new Date(lastEscalation2).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 999;

              const lastCI = data.lastCheckInDate;
              const daysSinceCI = lastCI
                ? Math.floor(
                    (new Date(today).getTime() - new Date(lastCI + 'T00:00:00').getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 999;

              // Only fires if escalation 1 was already sent (at least 7 days ago)
              const lastEscalation1 = data.lastEscalation1Email;
              const daysSinceEscalation1 = lastEscalation1
                ? Math.floor(
                    (new Date(today).getTime() - new Date(lastEscalation1).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 999;

              if (
                daysSinceCI >= 14 &&
                daysSinceEscalation2 >= 30 &&
                daysSinceEscalation1 >= 7
              ) {
                await triggerEscalation2Email(email, firstName);
                await adminDb.collection('users').doc(email).update({
                  lastEscalation2Email: today,
                });
                results.escalation2++;
              }
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

    console.log('[drip-emails] Completed:', results);
  } catch (err) {
    console.error('[drip-emails] Fatal error:', err);
  }
})();

return NextResponse.json({ success: true, message: 'Drip email processing started' });
}