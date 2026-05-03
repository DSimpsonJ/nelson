import { adminAuth } from '@/app/firebase/admin';
import { sendPasswordResetEmail } from '@/app/services/emailService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Generate Firebase password reset link
    const resetLink = await adminAuth.generatePasswordResetLink(email, {
      url: 'https://thenelson.app/login',
    });

    await sendPasswordResetEmail(email, resetLink);

    return NextResponse.json({ success: true });
} catch (err: any) {
    console.error('[send-password-reset] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}