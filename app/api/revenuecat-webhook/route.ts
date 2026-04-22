import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/app/firebase/admin';

const REVENUECAT_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  try {
    // Verify the request is from RevenueCat
    const authHeader = req.headers.get('authorization');
    console.log('[revenuecat-webhook] auth header received:', authHeader);
    if (!authHeader || authHeader !== REVENUECAT_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const event = body.event;

    if (!event) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { type, app_user_id } = event;

    // app_user_id is the email — that's what you set as the RevenueCat user ID
    // Verify before trusting: confirm this matches your RC user ID setup
    const email = app_user_id;

    if (!email || !email.includes('@')) {
      console.error('[revenuecat-webhook] Invalid app_user_id:', app_user_id);
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(email);

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION': // user resubscribed before expiry
        await userRef.update({ isSubscriber: true });
        console.log(`[revenuecat-webhook] ${type} — set isSubscriber: true for ${email}`);
        break;

      case 'EXPIRATION':
        await userRef.update({ isSubscriber: false });
        console.log(`[revenuecat-webhook] EXPIRATION — set isSubscriber: false for ${email}`);
        break;

      case 'CANCELLATION':
        // User cancelled but keeps access until expiry — do not flip isSubscriber yet
        // EXPIRATION event fires when access actually ends
        console.log(`[revenuecat-webhook] CANCELLATION noted for ${email} — no Firestore change`);
        break;

      case 'BILLING_ISSUE':
        // Payment failed — RC will retry, don't revoke access yet
        console.log(`[revenuecat-webhook] BILLING_ISSUE for ${email} — no Firestore change`);
        break;

      default:
        console.log(`[revenuecat-webhook] Unhandled event type: ${type}`);
    }

    return NextResponse.json({ received: true });

  } catch (err) {
    console.error('[revenuecat-webhook] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}