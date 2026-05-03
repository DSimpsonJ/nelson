import { adminAuth } from '@/app/firebase/admin';
import { triggerPasswordReset } from '@/app/services/loopsService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const resetLink = await adminAuth.generatePasswordResetLink(email, {
      url: 'https://thenelson.app/login',
    });

    await triggerPasswordReset(email, resetLink);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[send-password-reset] Error:', err);
    return NextResponse.json({ success: true });
  }
}