import { adminAuth } from '@/app/firebase/admin';
import { sendWelcomeEmail } from '@/app/services/emailService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { firstName } = body;

    await sendWelcomeEmail(decoded.email, firstName);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[send-welcome-email] Error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}