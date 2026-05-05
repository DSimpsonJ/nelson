import { adminAuth } from '@/app/firebase/admin';
import { updateLoopsContact } from '@/app/services/loopsService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, firstName } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    await updateLoopsContact(email, { firstName });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[update-loops-contact] Error:', err?.message || err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}