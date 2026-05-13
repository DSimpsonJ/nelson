import { inngest } from './inngestClient';
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
} from './loopsService';
import { grantProEntitlement } from './revenuecatService';

// ─── Drip Email Orchestrator ──────────────────────────────────────────────────

export const drip = inngest.createFunction(
  {
    id: 'drip-email-orchestrator',
    triggers: [{ cron: '0 15 * * *' }], // 10am EST = 15:00 UTC
  },
  async ({ step }) => {
    const users = await step.run('fetch-users', async () => {
      const snap = await adminDb.collection('users').get();
      return snap.docs
        .filter((doc) => doc.data().hasCommitment === true)
        .map((doc) => ({ email: doc.id }));
    });

    await step.sendEvent(
      'fan-out-drip',
      users.map((user) => ({
        name: 'drip/process.user',
        data: { email: user.email },
      }))
    );

    return { firedFor: users.length };
  }
);

// ─── Per-User Drip Processor ──────────────────────────────────────────────────

export const dripUser = inngest.createFunction(
  {
    id: 'drip-email-user',
  triggers: [{ event: 'drip/process.user' }],
  concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const email = event.data.email as string;

    const userData = await step.run('fetch-user-data', async () => {
      const userDoc = await adminDb.collection('users').doc(email).get();
      const metaDoc = await adminDb
        .collection('users').doc(email)
        .collection('metadata').doc('accountInfo')
        .get();

      if (!metaDoc.exists) return null;
      const firstCheckinDate = metaDoc.data()?.firstCheckinDate;
      if (!firstCheckinDate) return null;

      return {
        data: userDoc.data()!,
        firstCheckinDate: firstCheckinDate as string,
      };
    });

    if (!userData) return { skipped: true, reason: 'no metadata' };

    const { data, firstCheckinDate } = userData;
    const today = new Date().toLocaleDateString('en-CA');
    const firstName: string | undefined = data.firstName || data.name || undefined;

    const accountAgeDays = Math.floor(
      (new Date(today).getTime() - new Date(firstCheckinDate).getTime()) /
      (1000 * 60 * 60 * 24)
    ) + 1;

    if (accountAgeDays === 1) {
      await step.run('welcome-email', async () => {
        await triggerWelcomeEmail(email, firstName);
      });
    }

    if (accountAgeDays === 13) {
      await step.run('pre-paywall-email', async () => {
        await triggerPrePaywallEmail(email, firstName);
      });
    }

    if (accountAgeDays === 14) {
      await step.run('conversion-email', async () => {
        await triggerConversionEmail(email, firstName);
      });
    }

    if (accountAgeDays > 3) {
      const recentCheckin = await step.run('check-recent-checkin', async () => {
        const twoDaysAgo = new Date(today + 'T00:00:00');
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysAgoKey = twoDaysAgo.toLocaleDateString('en-CA');

        const snap = await adminDb
          .collection('users').doc(email)
          .collection('momentum')
          .where('date', '>=', twoDaysAgoKey)
          .where('checkinCompleted', '==', true)
          .limit(1)
          .get();

        return !snap.empty;
      });

      if (!recentCheckin) {
        const lastCI = data.lastCheckInDate as string | undefined;
        const daysSinceCI = lastCI
          ? Math.floor(
              (new Date(today).getTime() - new Date(lastCI + 'T00:00:00').getTime()) /
              (1000 * 60 * 60 * 24)
            )
          : 999;

        const lastReengagement = data.lastReengagementEmail as string | undefined;
        const daysSinceLast = lastReengagement
          ? Math.floor(
              (new Date(today).getTime() - new Date(lastReengagement).getTime()) /
              (1000 * 60 * 60 * 24)
            )
          : 999;

        if (daysSinceLast >= 7) {
          await step.run('reengagement-email', async () => {
            await triggerReengagementEmail(email, firstName);
            await adminDb.collection('users').doc(email).update({
              lastReengagementEmail: today,
            });
          });
        }

        if (accountAgeDays > 13) {
          const lastE1 = data.lastEscalation1Email as string | undefined;
          const lastE2 = data.lastEscalation2Email as string | undefined;
          const lastE3 = data.lastEscalation3Email as string | undefined;
          const lastE4 = data.lastEscalation4Email as string | undefined;

          const daysSinceE1 = lastE1
            ? Math.floor((new Date(today).getTime() - new Date(lastE1).getTime()) / 86400000)
            : 999;
          const daysSinceE2 = lastE2
            ? Math.floor((new Date(today).getTime() - new Date(lastE2).getTime()) / 86400000)
            : 999;
          const daysSinceE3 = lastE3
            ? Math.floor((new Date(today).getTime() - new Date(lastE3).getTime()) / 86400000)
            : 999;
          const daysSinceE4 = lastE4
            ? Math.floor((new Date(today).getTime() - new Date(lastE4).getTime()) / 86400000)
            : 999;

          if (daysSinceCI >= 7 && daysSinceE1 >= 30) {
            await step.run('escalation-1', async () => {
              await grantProEntitlement(email, 'weekly');
              await triggerEscalation1Email(email, firstName);
              await adminDb.collection('users').doc(email).update({ lastEscalation1Email: today });
            });
          } else if (daysSinceCI >= 14 && daysSinceE1 < 999 && daysSinceE2 >= 30) {
            await step.run('escalation-2', async () => {
              await grantProEntitlement(email, 'weekly');
              await triggerEscalation2Email(email, firstName);
              await adminDb.collection('users').doc(email).update({ lastEscalation2Email: today });
            });
          } else if (daysSinceCI >= 21 && daysSinceE2 < 999 && daysSinceE3 >= 30) {
            await step.run('escalation-3', async () => {
              await grantProEntitlement(email, 'monthly');
              await triggerEscalation3Email(email, firstName);
              await adminDb.collection('users').doc(email).update({ lastEscalation3Email: today });
            });
          } else if (daysSinceCI >= 30 && daysSinceE3 < 999 && daysSinceE4 >= 60) {
            await step.run('escalation-4', async () => {
              await grantProEntitlement(email, 'monthly');
              await triggerEscalation4Email(email, firstName);
              await adminDb.collection('users').doc(email).update({ lastEscalation4Email: today });
            });
          }
        }
      }
    }

    return { processed: email };
  }
);

// ─── Coaching Orchestrator ────────────────────────────────────────────────────

export const coaching = inngest.createFunction(
  {
    id: 'coaching-orchestrator',
    triggers: [{ cron: '0 13 * * 1' }], // 8am EST Monday = 13:00 UTC
  },
  async ({ step }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toLocaleDateString('en-CA');

    const users = await step.run('fetch-eligible-users', async () => {
      const snap = await adminDb.collection('users').get();
      return snap.docs
        .filter((doc) => {
          const data = doc.data();
          if (data.hasCommitment !== true) return false;
          const lastCheckIn = data.lastCheckInDate;
          if (!lastCheckIn) return false;
          return lastCheckIn >= cutoffStr;
        })
        .map((doc) => doc.id);
    });

    const weekId = getPreviousWeekId();

    await step.sendEvent(
      'fan-out-coaching',
      users.map((email: string) => ({
        name: 'coaching/process.user',
        data: { email, weekId },
      }))
    );

    return { firedFor: users.length };
  }
);

// ─── Per-User Coaching Processor ─────────────────────────────────────────────

export const coachingUser = inngest.createFunction(
  {
    id: 'coaching-user',
    triggers: [{ event: 'coaching/process.user' }],
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const email = event.data.email as string;
    const weekId = event.data.weekId as string;

    await step.run('generate-coaching', async () => {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://thenelson.app';
      const response = await fetch(`${baseUrl}/api/generate-weekly-coaching`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ email, weekId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Coaching failed for ${email}: ${JSON.stringify(error)}`);
      }
    });

    return { processed: email };
  }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPreviousWeekId(): string {
  const now = new Date();
  const lastWeek = new Date(now);
  lastWeek.setDate(now.getDate() - 7);

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