import { LoopsClient } from 'loops';

const loops = new LoopsClient(process.env.LOOPS_API_KEY!);

// ─── Contact Management ───────────────────────────────────────────────────────

export async function createLoopsContact(
  email: string,
  properties?: {
    firstName?: string;
    accountAgeDays?: number;
    isSubscriber?: boolean;
    lastCheckinDate?: string;
  }
): Promise<void> {
  try {
    await loops.createContact({
      email,
      properties: properties ?? {},
    });
  } catch (err) {
    // Contact may already exist — try update instead
    await loops.updateContact({
      email,
      properties: properties ?? {},
    });
  }
}

export async function updateLoopsContact(
  email: string,
  properties: {
    firstName?: string;
    accountAgeDays?: number;
    isSubscriber?: boolean;
    lastCheckinDate?: string;
  }
): Promise<void> {
  try {
    await loops.updateContact({ email, properties });
  } catch (err) {
    console.error('[loops] updateContact error:', err);
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function sendLoopsEvent(
  email: string,
  eventName: string,
  contactProperties?: Record<string, string | number | boolean>,
  eventProperties?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    await loops.sendEvent({
      email,
      eventName,
      contactProperties,
      eventProperties,
    });
  } catch (err) {
    console.error(`[loops] sendEvent ${eventName} error:`, err);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export async function triggerWelcomeEmail(
  email: string,
  firstName?: string
): Promise<void> {
  await createLoopsContact(email, { firstName });
  await sendLoopsEvent(email, 'signup', { firstName: firstName ?? '' });
}

export async function triggerPasswordReset(
  email: string,
  resetLink: string
): Promise<void> {
  await sendLoopsEvent(email, 'password_reset_requested', undefined, {
    resetLink,
  });
}

export async function triggerPrePaywallEmail(
  email: string,
  firstName?: string
): Promise<void> {
  await sendLoopsEvent(email, 'day_13', { firstName: firstName ?? '' });
}

export async function triggerConversionEmail(
  email: string,
  firstName?: string
): Promise<void> {
  await sendLoopsEvent(email, 'day_14', { firstName: firstName ?? '' });
}

export async function triggerReengagementEmail(
  email: string,
  firstName?: string
): Promise<void> {
  await sendLoopsEvent(email, 'inactive_3_days', { firstName: firstName ?? '' });
}