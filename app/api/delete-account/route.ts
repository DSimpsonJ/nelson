/**
 * POST /api/delete-account
 *
 * Deletes all data for the authenticated user.
 * Required by Apple before App Store submission.
 *
 * Order:
 * 1. Verify Firebase ID token
 * 2. Confirm token email matches request body email
 * 3. Delete all Firestore subcollections (recursive)
 * 4. Delete top-level user document
 * 5. Delete Firebase Auth account
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/app/firebase/admin';

const SUBCOLLECTIONS = [
  'momentum',
  'weeklySummaries',
  'weeklyCalibrations',
  'weightHistory',
  'metadata',
  'sessions',
  'coachingProfile',
];

export async function POST(request: NextRequest) {
  try {
    // --- Auth verification ---
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // --- Parse and validate body ---
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Missing required field: email' }, { status: 400 });
    }

    // --- Ownership check ---
    if (decodedToken.email !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userRef = adminDb.collection('users').doc(email);

    // --- Delete subcollections ---
    // recursiveDelete handles arbitrarily large collections without batch limits
    for (const subcollection of SUBCOLLECTIONS) {
      await adminDb.recursiveDelete(userRef.collection(subcollection));
    }

    // --- Delete top-level user document ---
    await userRef.delete();

    // --- Delete Firebase Auth account ---
    await adminAuth.deleteUser(decodedToken.uid);

    console.log(`[DeleteAccount] Successfully deleted account: ${email}`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[DeleteAccount] Error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}