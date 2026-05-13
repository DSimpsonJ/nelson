/**
 * GET /api/cron/send-drip-emails
 * Vercel Cron Job - Runs daily at 10am EST
 * Sends drip emails and re-engagement sequences to eligible users
 */

import { adminDb } from '@/app/firebase/admin';
import {
  triggerConversionEmail,
  triggerEscalation1Email,
  triggerEscalation2Email,
  triggerEscalation3Email,
  triggerEscalation4Email,
  triggerPrePaywallEmail,
  triggerReengagementEmail,
  triggerWelcomeEmail,
} from '@/app/services/loopsService';
import { grantProEntitlement } from '@/app/services/revenuecatService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  (async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const results = {
      welcome: 0,
      prePaywall: 0,
      conversion: 0,
      reengagement: 0,
      escalation1: 0,
      escalation2: 0,
      escalation3: 0,
      escalation4: 0,
      errors: 0,
    };

    try {
      const usersSnap = await adminDb.collection('users').get();

      for (const userDoc of usersSnap.docs) {
        const email = userDoc.id;
        const data = userDoc.data();
        const firstName = data.firstName || data.name || undefined;

        try {
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
          console.log(`[drip-debug] ${email} | accountAgeDays: ${accountAgeDays} | lastCheckInDate: ${data.lastCheckInDate} | firstCheckinDate: ${firstCheckinDate}`);

          // Welcome email -- day 1
          if (accountAgeDays === 1) {
            await triggerWelcomeEmail(email, firstName);
            results.welcome++;
          }

          // Pre-paywall -- day 13
          if (accountAgeDays === 13) {
            await triggerPrePaywallEmail(email, firstName);
            results.prePaywall++;
          }

          // Conversion -- day 14
          if (accountAgeDays === 14) {
            await triggerConversionEmail(email, firstName);
            results.conversion++;
          }

          // Re-engagement sequence -- only for users > 3 days old
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
              const lastCI = data.lastCheckInDate;
              const daysSinceCI = lastCI
                ? Math.floor(
                    (new Date(today).getTime() - new Date(lastCI + 'T00:00:00').getTime()) /
                    (1000 * 60 * 60 * 24)
                  )
                : 999;

              // 2-day re-engagement -- fires during and after welcome sequence
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

              // Escalation sequence -- only after welcome sequence ends (day 14+)
              if (accountAgeDays > 13) {
                const lastEscalation1 = data.lastEscalation1Email;
                const lastEscalation2 = data.lastEscalation2Email;
                const lastEscalation3 = data.lastEscalation3Email;
                const lastEscalation4 = data.lastEscalation4Email;

                const daysSinceE1 = lastEscalation1
                  ? Math.floor((new Date(today).getTime() - new Date(lastEscalation1).getTime()) / 86400000)
                  : 999;
                const daysSinceE2 = lastEscalation2
                  ? Math.floor((new Date(today).getTime() - new Date(lastEscalation2).getTime()) / 86400000)
                  : 999;
                const daysSinceE3 = lastEscalation3
                  ? Math.floor((new Date(today).getTime() - new Date(lastEscalation3).getTime()) / 86400000)
                  : 999;
                const daysSinceE4 = lastEscalation4
                  ? Math.floor((new Date(today).getTime() - new Date(lastEscalation4).getTime()) / 86400000)
                  : 999;

                // Escalation 1: 7+ days inactive, 30-day lockout -- 7 free days
                if (daysSinceCI >= 7 && daysSinceE1 >= 30) {
                  await grantProEntitlement(email, 'weekly');
                  await triggerEscalation1Email(email, firstName);
                  await adminDb.collection('users').doc(email).update({
                    lastEscalation1Email: today,
                  });
                  results.escalation1++;
                }

                // Escalation 2: 14+ days inactive, E1 sent 7+ days ago -- 7 free days
                else if (daysSinceCI >= 14 && daysSinceE1 < 999 && daysSinceE2 >= 30) {
                  await grantProEntitlement(email, 'weekly');
                  await triggerEscalation2Email(email, firstName);
                  await adminDb.collection('users').doc(email).update({
                    lastEscalation2Email: today,
                  });
                  results.escalation2++;
                }

                // Escalation 3: 21+ days inactive, E2 sent 7+ days ago -- 2 free weeks
                else if (daysSinceCI >= 21 && daysSinceE2 < 999 && daysSinceE3 >= 30) {
                  await grantProEntitlement(email, 'two_week');
                  await triggerEscalation3Email(email, firstName);
                  await adminDb.collection('users').doc(email).update({
                    lastEscalation3Email: today,
                  });
                  results.escalation3++;
                }

                // Escalation 4: 30+ days inactive, E3 sent 7+ days ago -- 1 free month
                else if (daysSinceCI >= 30 && daysSinceE3 < 999 && daysSinceE4 >= 60) {
                  await grantProEntitlement(email, 'monthly');
                  await triggerEscalation4Email(email, firstName);
                  await adminDb.collection('users').doc(email).update({
                    lastEscalation4Email: today,
                  });
                  results.escalation4++;
                }
              }
            }
          }

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