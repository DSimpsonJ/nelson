import { adminAuth } from '@/app/firebase/admin';
import { LoopsClient } from 'loops';
import { NextRequest, NextResponse } from 'next/server';

const loops = new LoopsClient(process.env.LOOPS_API_KEY!);

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

    await loops.sendTransactionalEmail({
      transactionalId: 'cmorbhfs200ag0i3nzy77bhoq',
      email,
      dataVariables: {
        resetLink,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[send-password-reset] Error:', err);
    return NextResponse.json({ success: true });
  }
}