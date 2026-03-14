# Nelson Mobile Build Reference
**Version:** 1.0  
**Created:** March 11, 2026  
**Purpose:** Single source of truth for building nelson-mobile screens against web app behavior. Every screen spec is derived from direct reading of web source files. No inference.

---

## How to Use This Document

Before building any mobile screen, find its spec below. The spec tells you exactly what Firestore reads to make, in what order, what to calculate, what to write, and what the guard conditions are. Build against this. Do not grep web files mid-session.

---

## Architecture Decisions (Locked)

- **Gap detection runs before every real check-in submission.** This is an architectural contract. It is not optional.
- **`checkinCompleted === true`** on today's momentum doc is the canonical check-in guard. Not `lastCheckInDate`. Not `missed`. This field alone.
- **`calculateDailyScore` filters `mindset` internally.** Send all 7 behaviors including mindset. Score is calculated from 6.
- **All momentum writes go through `/api/submit-checkin`** on the web server. Mobile calls this endpoint — it does not write momentum docs directly.
- **Gap fill writes go directly to Firestore from the client** (both web and mobile). Gap fills are not routed through the API.
- **`currentFocus` lives at `users/{email}/momentum/currentFocus`** — not a date-keyed doc.
- **ISO 8601 week calculation, Monday = week start.** Do not change.

---

## Firestore Collections Mobile Touches

```
users/{email}
  - firstName
  - weight
  - primaryFocus
  - readLearnSlugs: string[]
  - learnBannerLastSlug: string
  - hasSeenDashboardWelcome: boolean

users/{email}/momentum/{YYYY-MM-DD}
  - checkinCompleted: boolean         ← check-in guard
  - checkinType: "real" | "gap_fill"
  - missed: boolean
  - momentumScore: number
  - rawMomentumScore: number
  - momentumDelta: number
  - momentumTrend: "up" | "down" | "stable"
  - momentumMessage: string
  - visualState: "solid" | "outline" | "empty"
  - dailyScore: number
  - behaviorGrades: { name: string; grade: number }[]
  - behaviorRatings: Record<string, string>
  - exerciseCompleted: boolean
  - exerciseTargetMinutes: number
  - totalRealCheckIns: number
  - accountAgeDays: number
  - currentStreak: number
  - lifetimeStreak: number
  - streakSavers: number
  - note?: string
  - createdAt: string

users/{email}/momentum/currentFocus
  - habit: string                    e.g. "Move 10 minutes daily"
  - habitKey: string                 e.g. "movement_10min"
  - target: number                   target minutes
  - suggested?: boolean
  - lastLevelUpAt?: string

users/{email}/metadata/accountInfo
  - firstCheckinDate: string         YYYY-MM-DD

users/{email}/profile/plan
  - movementCommitment: number       minutes
  - goal: string
  - primaryHabit: { targetMinutes: number, ... }

users/{email}/profile/intake
  - firstName: string

users/{email}/weeklySummaries/{YYYY-Www}
  - status: "generated" | other
  - weekId: string
  - generatedAt: Timestamp
  - viewedAt?: Timestamp
  - coaching: {
      pattern: string
      tension: string
      whyThisMatters: string
      progression: { type: string; text: string }
    }
```

---

## Behavior IDs and Score Weights

The 7 behaviors sent to `/api/submit-checkin`:

| Field name (canonical) | Title in UI | Counts toward score? |
|---|---|---|
| `nutrition_quality` | Nutrition Quality | Yes |
| `portion_control` | Portion Control | Yes |
| `protein` | Protein Intake | Yes |
| `hydration` | Hydration | Yes |
| `sleep` | Sleep | Yes |
| `mindset` | Mental State | **No** (filtered by `calculateDailyScore`) |
| `movement` | Bonus Activity | Yes |

**Always send all 7.** `mindset` is stored for coaching context even though it doesn't affect the score.

### Grade Values
| Rating | Grade |
|---|---|
| `elite` | 100 |
| `solid` | 80 |
| `not-great` | 50 |
| `off` | 0 |

---

## Protein Range Calculation

Used in UI copy for the Protein Intake question.

```typescript
const weight = userData.weight || 170;
const capped = Math.min(weight, 240);
const low = Math.round(capped * 0.6);
const high = Math.round(capped * 1.0);
// Display as: `${low}-${high}g`
```

---

## accountAgeDays Calculation

Read from `metadata/accountInfo.firstCheckinDate`. Used in every real check-in submission.

```typescript
const today = new Date().toLocaleDateString('en-CA');
const firstCheckinDate = metaSnap.data()?.firstCheckinDate ?? today;
const accountAgeDays = Math.floor(
  (new Date(today).getTime() - new Date(firstCheckinDate + 'T00:00:00').getTime())
  / (1000 * 60 * 60 * 24)
) + 1;
// Minimum 1.
```

---

## Gap Detection (Mobile Implementation)

Gap detection must run **before** `submitCheckIn` is called. It is a client-side Firestore operation — there is no API endpoint for it.

**Logic:** Look back up to 30 days for the last real check-in (`missed !== true`). If the gap between that date and today is more than 1 day, fill each missing day with a gap-fill doc. Skip dates that already have a doc.

**Gap-fill doc shape:**
```typescript
{
  date: dateKey,                              // YYYY-MM-DD
  missed: true,
  gapResolved: false,
  rawMomentumScore: 0,
  momentumScore: lastCheckIn.momentumScore,   // Hold at last known — no decay written
  momentumDelta: 0,
  momentumTrend: 'stable',
  momentumMessage: 'Missed check-in - pending reconciliation',
  dailyScore: 0,
  visualState: 'empty',
  primary: { habitKey: '', done: false },
  stack: {},
  foundations: { protein: false, hydration: false, sleep: false, nutrition: false, movement: false },
  checkinType: 'gap_fill',
  checkinCompleted: false,
  currentStreak: 0,
  lifetimeStreak: 0,
  streakSavers: 0,
  totalRealCheckIns: lastCheckIn.totalRealCheckIns,  // Carry forward, don't increment
  createdAt: new Date().toISOString(),
}
```

**Decay rate:** `Math.round(momentum * 0.92)` per missed day. Note: the web app calculates `decayedMomentum` but writes `lastCheckIn.momentumScore` (frozen, no decay) to each gap doc. Mobile matches this behavior exactly.

**On failure:** Log and continue. Do not block check-in submission.

---

## `/api/submit-checkin` Contract

**POST** `https://thenelson.app/api/submit-checkin`

Request body:
```typescript
{
  idToken: string,           // Firebase ID token from user.getIdToken()
  email: string,
  date: string,              // YYYY-MM-DD, today
  behaviorGrades: [          // All 7, canonical name keys
    { name: 'nutrition_quality', grade: number },
    { name: 'portion_control', grade: number },
    { name: 'protein', grade: number },
    { name: 'hydration', grade: number },
    { name: 'sleep', grade: number },
    { name: 'mindset', grade: number },
    { name: 'movement', grade: number },
  ],
  currentFocus: {
    habitKey: string,        // e.g. "movement_10min"
    habit: string,           // e.g. "Move 10 minutes daily"
  },
  goal: string,              // user's primaryFocus field
  accountAgeDays: number,
  exerciseDeclared: boolean,
  isFirstCheckin: boolean,
}
```

Response: `{ success: true, momentumScore: number, reward: RewardResult }`  
On error: non-2xx with `{ error: string }`

**What the API does:**
1. Verifies Firebase ID token
2. Calls `calculateNewtonianMomentum` + `calculateDailyScore` (pure functions)
3. Applies ramp caps for first 9 check-ins
4. Resolves reward via `rewardEngine`
5. Writes momentum doc via `adminDb`
6. Updates `lastCheckInDate` on user doc
7. Writes `firstCheckinDate` to `metadata/accountInfo` on first check-in only

---

## Where `currentFocus` Comes From

Two sources, in priority order:

1. **`users/{email}/momentum/currentFocus`** — primary. Read `habit` and `habitKey` from this doc.
2. **`users/{email}/profile/plan`** — fallback if `currentFocus` doc doesn't exist. Use `movementCommitment` minutes to construct: `habitKey: "movement_${minutes}min"`, `habit: "Move ${minutes} minutes daily"`.

For the `movementMinutes` in the check-in submission, read `movementCommitment` from `profile/plan`.

---

## Screen Specs

---

### Screen: Daily Check-In (`app/(tabs)/checkin.tsx`)

**Status:** Built (March 11 session). Verified correct.

**Mount sequence:**
1. Fetch `users/{email}/momentum/{today}` → if `checkinCompleted === true`, redirect to checkin-success
2. Fetch `users/{email}` → read `weight` (protein range), `primaryFocus` (goal field)
3. Fetch `users/{email}/metadata/accountInfo` → calculate `accountAgeDays`
4. Fetch `users/{email}/profile/plan` → read `movementCommitment`

**Submission sequence:**
1. Run gap detection (client-side Firestore)
2. Assemble `behaviorGrades` (all 7, canonical names)
3. POST to `/api/submit-checkin` with `isFirstCheckin: false`
4. On success: `router.replace('/(tabs)/checkin-success' as any)` — passes `rewardAnimation` and `rewardText` as params

**Already-checked-in state:** Redirect to `/(tabs)/index`. No UI needed.

---

### Screen: Dashboard (`app/(tabs)/index.tsx`)

**Status:** Built (March 12 session). Verified correct on device.

**Mount sequence:**
1. Run gap detection (same as check-in — always runs on dashboard load)
2. Fetch `users/{email}` → `firstName`, `readLearnSlugs`
3. Fetch `users/{email}/profile/plan` → plan data
4. Fetch `users/{email}/momentum/currentFocus` → current habit
5. Fetch `users/{email}/momentum/{today}` → `todayMomentum`
6. Fetch all `users/{email}/momentum/*` (date-keyed docs only, filter `/^\d{4}-\d{2}-\d{2}$/`) → recent history, stats
7. Fetch `users/{email}/metadata/accountInfo` → `firstCheckinDate`
8. Fetch `users/{email}/weeklySummaries/*` (latest 1, ordered by `generatedAt` desc) → coaching card

**Display logic:**

*Momentum score:* `todayMomentum.momentumScore`. Animate from 0 on first load of the day (2300ms ease-out). Use `AsyncStorage` instead of `localStorage` to track if already animated today.

*Check-in guard:* `todayMomentum?.checkinCompleted === true`. If true: show momentum score. If false: show check-in CTA.

*Momentum message:* Read `todayMomentum.momentumMessage` — written by the API, display as-is. Do not recalculate on mobile.

*Stats row:*
- `currentStreak`: from `todayMomentum.currentStreak` (or most recent real doc if no today doc)
- `totalCheckIns`: count of all date-keyed momentum docs where `checkinType === "real"`
- `monthlyConsistency`: count of real check-ins in rolling 30-day window ÷ window size × 100

*Coaching card (CoachAccess equivalent):*
- Fetch latest `weeklySummaries` doc ordered by `generatedAt` desc
- If none: show "First briefing arrives Monday" state
- If `status === "generated"` and no `viewedAt`: show "New Intelligence" state (highlighted)
- If `status === "generated"` and has `viewedAt`: show standard coaching card with `progression.text`
- Tapping navigates to coaching detail screen

*Learn banner (LearnBanner equivalent):*
- Requires `firstCheckinDate` and `readLearnSlugs` from user doc
- Calls `learnService.getFirstUnreadArticle(firstCheckinDate, readLearnSlugs)` — **this service needs to be ported or called via API**
- If unread article exists and not dismissed: show banner with article title
- Dismiss writes `learnBannerLastSlug` to user doc

*Weight card:* Read `weight` from `users/{email}`. Display only if exists.

---

### Screen: Weekly Coaching Detail

**Status:** Built (March 13 session). Verified correct on device.

**Data:** Re-fetched on mount by weekId from `weeklySummaries` ordered by `generatedAt` desc, limit 5.

**Firestore write on view:** Set `viewedAt: serverTimestamp()` on the summary doc. This clears the "New Intelligence" state on the coaching card.

**Weekly calibration:** Checks `weeklyCalibrations/{weekId}` on load. If doc does not exist, shows calibration button. On complete, POSTs to `/api/save-weekly-calibration` with `Authorization: Bearer {idToken}`. Safety modal fires if `structuralState === 'something_wrong'`.

**Historical weeks:** Up to 4 previous `status === "generated"` summaries shown as collapsible cards.

---

### Screen: The Lab (`app/(tabs)/lab.tsx` or similar)

**Status:** Not built. Phase 3 Week 6-7.

**Data source:** All date-keyed momentum docs, ordered by date ascending.

**Key logic from `useMomentumHistory`:**
- Filter to docs matching `/^\d{4}-\d{2}-\d{2}$/`
- Primary observation window: `Math.min(accountAgeDays, 30)` days
- Build date range backwards from latest doc date
- Map dates to docs — dates with no doc get a synthetic empty entry (`missed: true, visualState: "gap"`)

---

### Screen: Settings

**Status:** Complete

**Required items (Apple-mandated):**
- Account deletion trigger (calls `/api/delete-account` or equivalent)
- Support link (`support@thenelson.app`)
- Privacy policy link (`https://thenelson.app/privacy`)
- Terms of Use link (`https://thenelson.app/terms`)
- Notification preference (time window for daily reminder)

---

## Reward System

The API resolves and returns a `RewardResult` on every check-in. Mobile receives this in the response body.

```typescript
interface RewardResult {
  event: RewardEventType | null;
  payload: {
    animation: "none" | "pulse" | "ring" | "confetti" | "burst" | "hero" | "fireworks";
    intensity: "small" | "medium" | "large";
    text: string;
    secondaryText: string;
    shareable: boolean;
  } | null;
}
```

**What to do with it on mobile:**
- `event === null` or `payload === null`: no celebration, just navigate to dashboard
- `animation === "ring"`: subtle acknowledgment (check_in_logged fallback)
- `animation === "burst"` or `"confetti"`: show celebration overlay before navigating
- `animation === "fireworks"`: show full-screen celebration

The `activate-celebration.tsx` screen exists for first check-in. Daily check-in success states will need their own celebration handling or can reuse a simplified version.

**One reward per check-in maximum.** The engine guarantees this.

---

## Week ID Format

Used for `weeklySummaries` document IDs. ISO 8601, Monday = week start.

```typescript
function getCurrentWeekId(): string {
  const now = new Date();
  const currentDay = now.getDay();
  const daysToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + daysToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const thursday = new Date(thisMonday);
  thursday.setDate(thisMonday.getDate() + 3);
  const year = thursday.getFullYear();

  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const firstMonday = new Date(year, 0, 1);
  firstMonday.setDate(1 + ((jan1Day === 0 ? -6 : 1) - jan1Day));

  const weekNumber = Math.floor(
    (thisMonday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  ) + 1;

  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}
```

---

## Known Issues / Open Items

| Item | Notes |
|---|---|
| `learnService` not ported to mobile | `LearnBanner` on web calls `getFirstUnreadArticle`. Either port this service or expose it via a lightweight API endpoint.
| `gapReconciliation` flow not implemented on mobile | Web check-in page shows a "did you exercise on [missed date]?" screen before allowing today's check-in. Mobile currently skips this — gap docs are written but never reconciled via user input. Acceptable for now, revisit in Phase 3 polish. |
| `activate-checkin.tsx` goal field | Was hardcoded as `'consistency'`. Fixed March 13 — now reads `primaryFocus` from `users/{email}`. |

---

## Files This Document Was Derived From

- `app/(app)/checkin/page.tsx` (web)
- `app/(app)/checkin/checkinModel.ts` (web)
- `app/(app)/dashboard/page.tsx` (web)
- `app/services/writeDailyMomentum.ts` (web)
- `app/services/newtonianMomentum.ts` (web)
- `app/services/missedCheckIns.ts` (web)
- `app/services/rewardEngine.ts` (web)
- `app/components/CoachAccess.tsx` (web)
- `app/components/LearnBanner.tsx` (web)
- `app/(app)/history/useMomentumHistory.ts` (web)
- `app/utils/date.ts` (web)
- `app/api/submit-checkin/route.ts` (web)