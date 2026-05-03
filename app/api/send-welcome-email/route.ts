import { adminAuth } from '@/app/firebase/admin';
import { triggerWelcomeEmail } from '@/app/services/loopsService';
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

    await triggerWelcomeEmail(decoded.email, firstName);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[send-welcome-email] Error:', err?.message || err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}