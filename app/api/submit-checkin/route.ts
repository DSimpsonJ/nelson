import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/app/firebase/admin';
import { calculateNewtonianMomentum, calculateDailyScore } from '@/app/services/newtonianMomentum';
import { resolveReward } from '@/app/services/rewardEngine';
import { FieldValue } from 'firebase-admin/firestore';

// Matches writeDailyMomentum applyRampCap exactly
function applyRampCap(score: number, checkInCount: number): number {
  let cap: number;
  if (checkInCount <= 1) cap = 10;
  else if (checkInCount <= 2) cap = 20;
  else if (checkInCount <= 5) cap = 40;
  else if (checkInCount <= 7) cap = 60;
  else if (checkInCount <= 9) cap = 80;
  else return score;

  const scaled = Math.round((score / 100) * cap);
  return Math.min(scaled, cap);
}
function gradesToRatings(grades: { name: string; grade: number }[]): Record<string, string> {
    const ratingMap: Record<number, string> = { 100: 'elite', 80: 'solid', 50: 'not-great', 0: 'off' };
    const result: Record<string, string> = {};
    for (const { name, grade } of grades) {
      result[name] = ratingMap[grade] ?? 'off';
    }
    return result;
  }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
        idToken, email, date, behaviorGrades, currentFocus,
        goal, accountAgeDays, exerciseDeclared, isFirstCheckin, note,
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
      const prevData = prevSnap.exists ? prevSnap.data()! : null;
      const previousMomentum = prevData
        ? (prevData.checkinType === 'gap_fill'
            ? (prevData.momentumScore ?? 0)          // frozen value from gap-fill
            : (prevData.rawMomentumScore ?? prevData.momentumScore ?? 0))  // real check-in
        : 0;
      const currentStreak = prevData?.currentStreak ?? 0;

    // Get totalRealCheckIns from previous doc (we'll increment it)
    const prevTotalRealCheckIns = prevSnap.exists ? (prevSnap.data()?.totalRealCheckIns ?? 0) : 0;
    const totalRealCheckIns = prevTotalRealCheckIns + 1;

    // Calculate daily score
    const dailyScore = calculateDailyScore(behaviorGrades);

    // Apply movement modifier before momentum calc (matches writeDailyMomentum)
    const movementModifier = exerciseDeclared
      ? 1.00
      : totalRealCheckIns <= 9 ? 0.92
      : totalRealCheckIns <= 29 ? 0.88
      : 0.82;

    const modifiedDailyScore = Math.round(dailyScore * movementModifier);

    // Calculate momentum
    const momentumResult = calculateNewtonianMomentum({
      todayScore: modifiedDailyScore,
      last4Days,
      currentStreak: currentStreak + 1,
      previousMomentum,
      totalRealCheckIns,
      exerciseCompleted: exerciseDeclared,
    });

    // Apply ramp cap
    let momentumScore = momentumResult.proposedScore;
    if (totalRealCheckIns <= 9) {
      momentumScore = applyRampCap(momentumResult.proposedScore, totalRealCheckIns);
    }

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
      isSolidWeek: false,
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
        momentumDelta: momentumScore - previousMomentum,
        currentStreak: currentStreak + 1,
        totalRealCheckIns,
        behaviorGrades,
        behaviorRatings: gradesToRatings(behaviorGrades), 
        exerciseCompleted: exerciseDeclared ?? false,
        checkinCompleted: true,
        checkinType: 'real',
        momentumTrend: momentumScore - previousMomentum > 2 ? 'up' : momentumScore - previousMomentum < -2 ? 'down' : 'stable',
visualState: 'solid' as const,
        primary: { habitKey: currentFocus.habitKey, done: exerciseDeclared ?? false },
        createdAt: new Date().toISOString(),
        ...(note && note.trim() !== '' ? { note: note.trim() } : {}),
      });

    // Update user doc
    const userUpdates: Record<string, unknown> = { lastCheckInDate: date };
    if (reward.stateUpdates?.hasEverHit80Momentum) userUpdates.hasEverHit80Momentum = true;
    if (reward.stateUpdates?.hasEverHit90Momentum) userUpdates.hasEverHit90Momentum = true;
    if (reward.stateUpdates?.hasEverHit100Momentum) userUpdates.hasEverHit100Momentum = true;
    // Write trialStartDate on first check-in only — do not overwrite if already set
    if (isFirstCheckin && !userData.trialStartDate) {
      userUpdates.trialStartDate = new Date().toISOString();
    }
    await adminDb.collection('users').doc(email).update(userUpdates);

    // Write firstCheckinDate if first check-in
    if (isFirstCheckin) {
      await adminDb
        .collection('users').doc(email)
        .collection('metadata').doc('accountInfo')
        .set({ firstCheckinDate: date, createdAt: new Date().toISOString() }, { merge: true });
    }

    return NextResponse.json({
        success: true,
        reward,
        momentumScore,
        momentumDelta: momentumScore - previousMomentum,
      });
  } catch (err) {
    console.error('[submit-checkin] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}