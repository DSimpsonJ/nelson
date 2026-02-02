/**
 * API Route: Save Weekly Calibration
 * 
 * POST /api/save-weekly-calibration
 * 
 * Saves user's weekly force check answers to Firestore
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveWeeklyCalibration, ForceLevel, DragSource, StructuralState, GoalAlignment } from '@/app/services/weeklyCalibration';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, weekId, answers } = body;

    // Validate required fields
    if (!email || !weekId || !answers) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate answer structure
    if (!answers.forceLevel || !answers.dragSource || 
        !answers.structuralState || !answers.goalAlignment) {
      return NextResponse.json(
        { error: 'Incomplete answers' },
        { status: 400 }
      );
    }

    // Save calibration
    await saveWeeklyCalibration(email, weekId, {
      forceLevel: answers.forceLevel as ForceLevel,
      dragSource: answers.dragSource as DragSource,
      structuralState: answers.structuralState as StructuralState,
      goalAlignment: answers.goalAlignment as GoalAlignment
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[API] Error saving weekly calibration:', error);
    return NextResponse.json(
      { error: 'Failed to save calibration' },
      { status: 500 }
    );
  }
}