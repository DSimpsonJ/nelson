import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/app/firebase/admin';
import { calculateNewtonianMomentum, calculateDailyScore } from '@/app/services/newtonianMomentum';
import { resolveReward } from '@/app/services/rewardEngine';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      idToken, email, date, behaviorGrades, currentFocus,
      goal, accountAgeDays, exerciseDeclared, isFirstCheckin,
    } = body;

    // Verify token
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get last 4 days of momentum scores
    const last4Days: number[] = [];
    const baseDate = new Date(date + 'T00:00:00');
    for (let i = 1; i <= 4; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const dateKey = d.toLocaleDateString('en-CA');
      const snap = await adminDb
        .collection('users').doc(email)
        .collection('momentum').doc(dateKey)
        .get();
      if (snap.exists && snap.data()?.checkinType !== 'gap_fill' && snap.data()?.dailyScore !== undefined) {
        last4Days.unshift(snap.data()!.dailyScore);
      }
    }

    // Get previous momentum doc for streak + prior score
    const prevDate = new Date(baseDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevSnap = await adminDb
      .collection('users').doc(email)
      .collection('momentum').doc(prevDate.toLocaleDateString('en-CA'))
      .get();
    const previousMomentum = prevSnap.exists ? (prevSnap.data()?.momentumScore ?? 0) : 0;
    const currentStreak = prevSnap.exists ? (prevSnap.data()?.currentStreak ?? 0) : 0;

    // Get totalRealCheckIns from previous doc (we'll increment it)
    const prevTotalRealCheckIns = prevSnap.exists ? (prevSnap.data()?.totalRealCheckIns ?? 0) : 0;
    const totalRealCheckIns = prevTotalRealCheckIns + 1;

    // Calculate daily score and momentum
    const dailyScore = calculateDailyScore(behaviorGrades);
    const momentumResult = calculateNewtonianMomentum({
      todayScore: dailyScore,
      last4Days,
      currentStreak: currentStreak + 1,
      previousMomentum,
      totalRealCheckIns,
      exerciseCompleted: exerciseDeclared,
    });

    // Apply ramp caps
    let momentumScore = momentumResult.proposedScore;
    if (totalRealCheckIns <= 2) momentumScore = Math.min(momentumScore, 30);
    else if (totalRealCheckIns <= 5) momentumScore = Math.min(momentumScore, 60);
    else if (totalRealCheckIns <= 9) momentumScore = Math.min(momentumScore, 80);

    // Get user doc for reward context
    const userSnap = await adminDb.collection('users').doc(email).get();
    const userData = userSnap.data() ?? {};

    // Resolve reward
    const reward = resolveReward({
      totalRealCheckIns,
      momentum: momentumScore,
      hasEverHit80Momentum: userData.hasEverHit80Momentum ?? false,
      hasEverHit90Momentum: userData.hasEverHit90Momentum ?? false,
      hasEverHit100Momentum: userData.hasEverHit100Momentum ?? false,
      isEliteDay: dailyScore === 100,
      isSolidDay: dailyScore >= 75,
      isSolidWeek: false, // not calculated here
    });

    // Write momentum doc
    await adminDb
      .collection('users').doc(email)
      .collection('momentum').doc(date)
      .set({
        date,
        accountAgeDays,
        dailyScore,
        rawMomentumScore: momentumResult.rawScore,
        momentumScore,
        currentStreak: currentStreak + 1,
        totalRealCheckIns,
        behaviorGrades,
        exerciseCompleted: exerciseDeclared ?? false,
        checkinCompleted: true,
        primary: { habitKey: currentFocus.habitKey, done: exerciseDeclared ?? false },
        createdAt: new Date().toISOString(),
      });

    // Update user doc
    const userUpdates: Record<string, unknown> = { lastCheckInDate: date };
    if (reward.stateUpdates?.hasEverHit80Momentum) userUpdates.hasEverHit80Momentum = true;
    if (reward.stateUpdates?.hasEverHit90Momentum) userUpdates.hasEverHit90Momentum = true;
    if (reward.stateUpdates?.hasEverHit100Momentum) userUpdates.hasEverHit100Momentum = true;
    await adminDb.collection('users').doc(email).update(userUpdates);

    // Write firstCheckinDate if first check-in
    if (isFirstCheckin) {
      await adminDb
        .collection('users').doc(email)
        .collection('metadata').doc('accountInfo')
        .set({ firstCheckinDate: date, createdAt: new Date().toISOString() }, { merge: true });
    }

    return NextResponse.json({ success: true, reward });
  } catch (err) {
    console.error('[submit-checkin] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}