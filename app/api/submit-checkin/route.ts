import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/app/firebase/admin';
import { calculateNewtonianMomentum, calculateDailyScore } from '@/app/services/newtonianMomentum';
import { resolveReward, isSolidDay, isEliteDay } from '@/app/services/rewardEngine';
import { FieldValue } from 'firebase-admin/firestore';
import { getPhaseIndex, MOMENTUM_PHASES } from '@/app/utils/momentumPhases';

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

  async function awardBadgeIfNew(
    email: string,
    badgeId: string,
    type: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    const ref = adminDb.collection('users').doc(email).collection('badges').doc(badgeId);
    const snap = await ref.get();
    if (snap.exists) return false;
    await ref.set({
      type,
      earnedAt: new Date().toISOString(),
      ...extra,
    });
    return true;
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
        if (snap.exists) {
          if (snap.data()?.checkinType === 'gap_fill') {
            last4Days.unshift(snap.data()!.momentumScore ?? 0);
          } else if (snap.data()?.dailyScore !== undefined) {
            last4Days.unshift(snap.data()!.dailyScore);
          }
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
        ? (prevData.momentumScore ?? 0)
        : 0;
      const currentStreak = prevData?.currentStreak ?? 0;

    // Count real check-ins directly from Firestore — chained counter is unreliable
const allMomentumSnap = await adminDb
.collection('users').doc(email)
.collection('momentum')
.get();
const prevTotalRealCheckIns = allMomentumSnap.docs.filter(
d => /^\d{4}-\d{2}-\d{2}$/.test(d.id) && d.data().checkinType === 'real'
).length;
const totalRealCheckIns = prevTotalRealCheckIns + 1;

// Calculate days since last real check-in for re-entry cap
let daysSinceLastRealCheckin = 0;
for (let i = 1; i <= 30; i++) {
  const lookback = new Date(baseDate);
  lookback.setDate(lookback.getDate() - i);
  const lookbackKey = lookback.toLocaleDateString('en-CA');
  const lookbackSnap = await adminDb
    .collection('users').doc(email)
    .collection('momentum').doc(lookbackKey)
    .get();
  if (lookbackSnap.exists && lookbackSnap.data()?.checkinType === 'real') {
    daysSinceLastRealCheckin = i;
    break;
  }
  if (i === 30) daysSinceLastRealCheckin = 30;
}

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

    // Re-entry cap — applies for 7 real check-ins after a 7+ day hiatus
    // Rise is effort-scaled: (dailyScore / 100) × 8 max per day
    // Only applies to users past ramp cap (totalRealCheckIns > 9)
    if (daysSinceLastRealCheckin >= 7 && totalRealCheckIns > 9) {
      // Count consecutive real check-ins since returning from hiatus
      // Walk back from yesterday counting real check-ins until we hit a gap
      let consecutiveRealCheckIns = 0;
      for (let i = 1; i <= 14; i++) {
        const lookback = new Date(baseDate);
        lookback.setDate(lookback.getDate() - i);
        const lookbackKey = lookback.toLocaleDateString('en-CA');
        const lookbackSnap = await adminDb
          .collection('users').doc(email)
          .collection('momentum').doc(lookbackKey)
          .get();
        if (!lookbackSnap.exists) break;
        const data = lookbackSnap.data()!;
        if (data.checkinType !== 'real') break;
        consecutiveRealCheckIns++;
      }

      // consecutiveRealCheckIns is how many real check-ins exist before today
      // Today is check-in number consecutiveRealCheckIns + 1 in the return sequence
      const returnCheckInNumber = consecutiveRealCheckIns + 1;

      if (returnCheckInNumber <= 7) {
        const maxRise = (dailyScore / 100) * 8;
        const cappedScore = Math.round(previousMomentum + maxRise);
        if (momentumScore > cappedScore) {
          momentumScore = cappedScore;
        }
      }
    }

    // Get user doc for reward context
    const userSnap = await adminDb.collection('users').doc(email).get();
    const userData = userSnap.data() ?? {};
    const peakMomentum: number = userData.peakMomentum ?? 0;

    // Resolve reward
    const momentumDelta = momentumScore - previousMomentum;

    const reward = resolveReward({
      totalRealCheckIns,
      momentum: momentumScore,
      momentumDelta,
      peakMomentum,
      hasEverHit80Momentum: userData.hasEverHit80Momentum ?? false,
      hasEverHit90Momentum: userData.hasEverHit90Momentum ?? false,
      hasEverHit100Momentum: userData.hasEverHit100Momentum ?? false,
      hasEverHitZone: userData.hasEverHitZone ?? false,
      isEliteDay: isEliteDay(gradesToRatings(behaviorGrades), exerciseDeclared ?? false),
      isSolidDay: isSolidDay(gradesToRatings(behaviorGrades), exerciseDeclared ?? false),
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
    if (reward.stateUpdates?.hasEverHitZone) userUpdates.hasEverHitZone = true;
    if (reward.stateUpdates?.hasEverHit80Momentum) userUpdates.hasEverHit80Momentum = true;
    if (reward.stateUpdates?.hasEverHit90Momentum) userUpdates.hasEverHit90Momentum = true;
    if (reward.stateUpdates?.hasEverHit100Momentum) userUpdates.hasEverHit100Momentum = true;
    if (momentumScore > peakMomentum) userUpdates.peakMomentum = momentumScore;
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
      await awardBadgeIfNew(email, 'phase_Initiation', 'phase_transition', {
        phaseName: 'Initiation',
        fromPhase: '',
      });
    }

    const prevPhaseIndex = getPhaseIndex(prevTotalRealCheckIns);
    const newPhaseIndex  = getPhaseIndex(totalRealCheckIns);
    const phaseTransition = newPhaseIndex > prevPhaseIndex
      ? { from: MOMENTUM_PHASES[prevPhaseIndex].name, to: MOMENTUM_PHASES[newPhaseIndex].name }
      : null;

   // Award badges
   if (phaseTransition) {
    const badgeId = `phase_${phaseTransition.to}`;
    await awardBadgeIfNew(email, badgeId, 'phase_transition', {
      phaseName: phaseTransition.to,
      fromPhase: phaseTransition.from,
    });
  }
  // Milestone badges: 10, 25, 50, 75, then every 50 after 100
  const milestoneBadgeNumbers = [10, 25, 50, 75];
  if (milestoneBadgeNumbers.includes(totalRealCheckIns)) {
    await awardBadgeIfNew(email, `checkin_${totalRealCheckIns}`, 'milestone', {
      phaseName: String(totalRealCheckIns),
    });
  }
  if (totalRealCheckIns > 100) {
    const offset = totalRealCheckIns - 100;
    if (offset % 50 === 0 || (offset - 25) % 50 === 0) {
      await awardBadgeIfNew(email, `checkin_${totalRealCheckIns}`, 'milestone', {
        phaseName: String(totalRealCheckIns),
      });
    }
  }

  const milestoneCount = [10, 25, 50, 75].includes(totalRealCheckIns) ||
    (totalRealCheckIns > 100 && (
      (totalRealCheckIns - 100) % 50 === 0 ||
      ((totalRealCheckIns - 100) - 25) % 50 === 0
    ))
    ? totalRealCheckIns
    : null;

return NextResponse.json({
    success: true,
    reward,
    momentumScore,
    momentumDelta: momentumScore - previousMomentum,
    phaseTransition,
    milestoneCount,
    totalRealCheckIns,
  });
  } catch (err) {
    console.error('[submit-checkin] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}