/**
 * API Route: Save Weekly Calibration
 * 
 * POST /api/save-weekly-calibration
 * 
 * Saves user's weekly force check answers to Firestore.
 * Requires a valid Firebase ID token in the Authorization header.
 * Token email must match the email in the request body.
 */

import { adminAuth } from '@/app/firebase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { saveWeeklyCalibration, ForceLevel, DragSource, StructuralState, GoalAlignment } from '@/app/services/weeklyCalibration';

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

    // --- Parse body ---
    const body = await request.json();
    const { email, weekId, answers } = body;

    // --- Validate required fields ---
    if (!email || !weekId || !answers) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // --- Ownership check: token email must match request email ---
    if (decodedToken.email !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // --- Validate answer structure ---
    if (!answers.forceLevel || !answers.dragSource ||
        !answers.structuralState || !answers.goalAlignment) {
      return NextResponse.json({ error: 'Incomplete answers' }, { status: 400 });
    }

    // --- Save calibration ---
    await saveWeeklyCalibration(email, weekId, {
      forceLevel: answers.forceLevel as ForceLevel,
      dragSource: answers.dragSource as DragSource,
      structuralState: answers.structuralState as StructuralState,
      goalAlignment: answers.goalAlignment as GoalAlignment
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[API] Error saving weekly calibration:', error);
    return NextResponse.json({ error: 'Failed to save calibration' }, { status: 500 });
  }
}