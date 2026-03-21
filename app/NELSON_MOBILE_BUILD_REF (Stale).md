# Nelson Mobile Build Reference
**Version:** 1.1  
**Created:** March 11, 2026  
**Last Updated:** March 14, 2026  
**Purpose:** Single source of truth for building nelson-mobile screens against web app behavior. Every screen spec is derived from direct reading of web source files. No inference.

---

## How to Use This Document

Before building any mobile screen, find its spec below. The spec tells you exactly what Firestore reads to make, in what order, what to calculate, what to write, and what the guard conditions are. Build against this. Do not grep web files mid-session.

---

## Architecture Decisions (Locked)

- **Gap detection runs before every real check-in submission.** This is an architectural contract. It is not optional. Tested with real missed day — confirmed working March 14.
- **`checkinCompleted === true`** on today's momentum doc is the canonical check-in guard. Not `lastCheckInDate`. Not `missed`. This field alone.
- **`calculateDailyScore` filters `mindset` internally.** Send all 7 behaviors including mindset. Score is calculated from 6.
- **All momentum writes go through `/api/submit-checkin`** on the web server. Mobile calls this endpoint — it does not write momentum docs directly.
- **Gap fill writes go directly to Firestore from the client** (both web and mobile). Gap fills are not routed through the API.
- **`currentFocus` lives at `users/{email}/momentum/currentFocus`** — not a date-keyed doc.
- **ISO 8601 week calculation, Monday = week start.** Do not change.
- **`weightHistory` is the single source of truth for weight.** `users/{email}.weight` is kept in sync for protein calculations but should not be read as the primary weight source. Always read latest from `weightHistory`.
- **`learnService` is exposed via API endpoint** (`/api/learn-articles`) — not ported to mobile. Returns `{ articles, readSlugs }`. Mobile derives all learn state from this response.

---

## Firestore Collections Mobile Touches

```
users/{email}
  - firstName
  - weight                              ← kept in sync with weightHistory, not primary source
  - primaryFocus
  - readLearnSlugs: string[]            ← updated via arrayUnion on article read
  - learnBannerLastSlug: string         ← not currently used on mobile (banner uses API)
  - hasSeenDashboardWelcome: boolean

users/{email}/momentum/{YYYY-MM-DD}
  - checkinCompleted: boolean           ← check-in guard
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
  - behaviorRatings: Record<string, string>   ← written by /api/submit-checkin as of March 14
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
  - habit: string                       e.g. "Move 10 minutes daily"
  - habitKey: string                    e.g. "movement_10min"
  - target: number                      target minutes
  - suggested?: boolean
  - lastLevelUpAt?: string

users/{email}/metadata/accountInfo
  - firstCheckinDate: string            YYYY-MM-DD

users/{email}/profile/plan
  - movementCommitment: number          minutes
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

users/{email}/weightHistory/{auto-id}
  - date: string                        YYYY-MM-DD
  - weight: number
  - timestamp: string                   ISO string
  - weekOf: string                      YYYY-Www

articles/{auto-id}                      ← read server-side by /api/learn-articles only
  - slug: string
  - title: string
  - format: "read" | "watch"
  - duration: string
  - category: string
  - content: string
  - releaseType: "drip" | "broadcast"
  - dayNumber?: number
  - isPublished: boolean
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

Gap detection must run **before** `submitCheckIn` is called. It is a client-side Firestore operation — there is no API endpoint for it. **Confirmed working on device with a real missed day (March 14).**

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
  note?: string,             // optional, trimmed before send
}
```

Response: `{ success: true, momentumScore: number, momentumDelta: number, reward: RewardResult }`  
On error: non-2xx with `{ error: string }`

**What the API does:**
1. Verifies Firebase ID token
2. Calls `calculateNewtonianMomentum` + `calculateDailyScore` (pure functions)
3. Applies ramp caps for first 9 check-ins
4. Resolves reward via `rewardEngine`
5. Writes momentum doc via `adminDb` — including `behaviorRatings` (derived from `behaviorGrades`)
6. Updates `lastCheckInDate` on user doc
7. Writes `firstCheckinDate` to `metadata/accountInfo` on first check-in only

---

## `/api/learn-articles` Contract

**GET** `https://thenelson.app/api/learn-articles`  
**Authorization:** `Bearer {idToken}`

Response:
```typescript
{
  articles: Article[],   // eligible drip articles only, sorted by dayNumber asc
  readSlugs: string[]    // user's readLearnSlugs from their Firestore doc
}
```

**Mobile derives from this:**
- Learn screen: render `articles`, mark unread where `!readSlugs.includes(slug)`
- Dashboard banner: `articles.find(a => !readSlugs.includes(a.slug))` — first unread check
- Tab dot / banner visibility: `articles.some(a => !readSlugs.includes(a.slug))`

**Mark as read:** On article open, write `arrayUnion(slug)` to `users/{email}.readLearnSlugs` directly from mobile.

---

## Where `currentFocus` Comes From

Two sources, in priority order:

1. **`users/{email}/momentum/currentFocus`** — primary. Read `habit` and `habitKey` from this doc.
2. **`users/{email}/profile/plan`** — fallback if `currentFocus` doc doesn't exist. Use `movementCommitment` minutes to construct: `habitKey: "movement_${minutes}min"`, `habit: "Move ${minutes} minutes daily"`.

For the `movementMinutes` in the check-in submission, read `movementCommitment` from `profile/plan`.

---

## Weight Data Model

Weight has a single source of truth: `users/{email}/weightHistory`.

**On write (both onboarding and update):**
1. `addDoc` to `weightHistory` with `{ date, weight, timestamp, weekOf }`
2. `update` `users/{email}.weight` to keep protein range calculations in sync

**On read (dashboard weight card):** Query `weightHistory` ordered by `timestamp desc`, limit 1. Fall back to `users/{email}.weight` if query fails.

**`getWeekOf` helper** (used in both `intake-weight.tsx` and dashboard `handleWeightSave`):
```typescript
function getWeekOf(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const dayOfWeek = d.getUTCDay();
  const nearestThursday = new Date(d);
  nearestThursday.setUTCDate(d.getUTCDate() + 4 - (dayOfWeek || 7));
  const yearStart = new Date(Date.UTC(nearestThursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((nearestThursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${nearestThursday.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}
```

---

## Screen Specs

---

### Screen: Daily Check-In (`app/(tabs)/checkin.tsx`)

**Status:** Built (March 11). Verified correct.

**Mount sequence:**
1. Fetch `users/{email}/momentum/{today}` → if `checkinCompleted === true`, redirect to `/(tabs)/index`
2. Fetch `users/{email}` → read `weight` (protein range), `primaryFocus` (goal field)
3. Fetch `users/{email}/metadata/accountInfo` → calculate `accountAgeDays`
4. Fetch `users/{email}/profile/plan` → read `movementCommitment`

**Submission sequence:**
1. Run gap detection (client-side Firestore)
2. Assemble `behaviorGrades` (all 7, canonical names)
3. POST to `/api/submit-checkin` with `isFirstCheckin: false`
4. On success: `router.replace('/(tabs)/checkin-success' as any)` — passes `rewardAnimation`, `rewardText`, `rewardSecondaryText` as params

**Already-checked-in state:** Redirect to `/(tabs)/index`.

**Note:** checkin.tsx uses namespaced firestore() API | index.tsx uses modular getFirestore(). Both are correct for their respective APIs — exists() is a method in namespaced API, property in modular API. Style inconsistency only, no bug. No unification needed.**

---

### Screen: Dashboard (`app/(tabs)/index.tsx`)

**Status:** Built (March 12). Updated March 14 with weight update modal, weightHistory reads, learn banner, and LearnContext.

**Mount sequence:**
1. Run gap detection — always first
2. Fetch `users/{email}` → `firstName`
3. Fetch latest from `users/{email}/weightHistory` (ordered by `timestamp desc`, limit 1) → `weight`, `weightLastLogged`
4. Fetch `users/{email}/momentum/{today}` → `todayMomentum`
5. Fetch `users/{email}/momentum/currentFocus` → current habit
6. Fetch all `users/{email}/momentum/*` (date-keyed docs only) → stats
7. Fetch `users/{email}/metadata/accountInfo` → `firstCheckinDate`
8. Fetch `users/{email}/weeklySummaries/*` (latest 1, ordered by `generatedAt` desc) → coaching card
9. GET `/api/learn-articles` → derive `hasUnreadLearn` — non-blocking, silently fails

**Key behaviors:**
- Momentum animation: 2300ms ease-out, once per day via `AsyncStorage`
- Check-in guard: `todayMomentum?.checkinCompleted === true`
- Learn banner: shows if `hasUnreadLearn === true`, taps to Learn tab
- Weight card: shows UPDATE button → opens `WeightModal` → writes to `weightHistory` + `users/{email}.weight`
- History card: taps to `/(tabs)/lab`
- `setHasUnreadLearn` from `LearnContext` called after load — drives tab dot (currently removed from nav, reserved for Phase 5 icon pass)

---

### Screen: Check-In Success (`app/(tabs)/checkin-success.tsx`)

**Status:** Built (March 12). Verified correct.

Navigated to after successful POST to `/api/submit-checkin`. Receives `rewardAnimation`, `rewardText`, `rewardSecondaryText` as params. Continue button navigates to `/(tabs)`.

---

### Screen: Weekly Coaching Detail (`app/(tabs)/coaching.tsx`)

**Status:** Built (March 13). Verified correct on device.

**Data:** Fetches `weeklySummaries` ordered by `generatedAt` desc, limit 5 on mount.

**Firestore write on view:** Sets `viewedAt: serverTimestamp()` on the current week's summary doc.

**Calibration:** Checks `weeklyCalibrations/{weekId}` on load. Shows calibration button if doc does not exist. On complete, POSTs to `/api/save-weekly-calibration` with `Authorization: Bearer {idToken}`. Safety modal fires if `structuralState === 'something_wrong'`.

**Historical weeks:** Up to 4 previous `status === "generated"` summaries as collapsible cards. **Built and wired but not yet tested with real multi-week Firestore data.**

**`stabilize` progression type:** Renders identically to all other types (badge + text). No special handling needed — confirmed non-issue March 14.

---

### Screen: The Lab (`app/(tabs)/lab.tsx`)

**Status:** Built (March 14). Verified correct on device.

**Data source:** All date-keyed momentum docs, ordered by `date asc`.

**Sections:**
1. **Momentum Trend** — SVG line chart, 30-day rolling window, Y-axis 0/50/100%, X-axis every 5 days always ending on latest date
2. **Stats** — Days observed, check-ins, missed, exercise days/window, current run, longest run
3. **Behavior Distribution** — Sorted by `off` % descending, requires 3+ real check-ins, "More Data Needed" guard below threshold
4. **Calendar** — Month navigation (back unlimited, forward disabled at current month). Tapping a real check-in day opens day detail modal.

**Day detail modal:** Date, momentum score, exercise commitment, all 7 behavior ratings from `behaviorRatings`, note toggle. Gap days are not tappable.

**Key logic:**
- Filter docs to `/^\d{4}-\d{2}-\d{2}$/`
- `primarySize = Math.min(ageDays, 30)` from `latestDoc.accountAgeDays`
- Dates with no doc get synthetic gap entry (`checkinType: 'gap_fill'`, `visualState: 'gap'`)
- `behaviorRatings` field required for behavior display — written by `/api/submit-checkin` as of March 14. Pre-March 14 docs via web app have this field. Pre-March 14 mobile check-ins do not.

---

### Screen: Learn (`app/(tabs)/learn.tsx`)

**Status:** Built (March 14). Verified correct on device.

**Data source:** GET `/api/learn-articles` with Bearer token on mount. Refreshes on every focus via `useFocusEffect`.

**Display:** Article list sorted by `dayNumber` asc. Blue dot on unread articles (`!readSlugs.includes(slug)`). Empty state if no eligible articles. Tapping navigates to `/(tabs)/article` with `slug` param.

---

### Screen: Article Detail (`app/(tabs)/article.tsx`)

**Status:** Built (March 14). Verified correct on device.

**Data source:** GET `/api/learn-articles`, find article by slug from params.

**Mark as read:** On load, if `slug` not in `readSlugs`, writes `arrayUnion(slug)` to `users/{email}.readLearnSlugs`.

**Navigation:** Back button uses `router.push('/(tabs)/learn' as any)` — not `router.back()`.

---

### Screen: Settings (`app/(tabs)/settings.tsx`)

**Status:** Built (March 13). Verified correct.

- Sign out: `auth().signOut()` → root `_layout.tsx` redirects to login
- Delete account: two-step confirm → POST `/api/delete-account` with Bearer token → sign out
- Privacy Policy, Terms of Use: `Linking.openURL`
- Contact support: `mailto:support@thenelson.app`
- **Notification preference: not yet built** — required for Phase 4

---

## LearnContext

**File:** `app/(tabs)/LearnContext.tsx`  
**Purpose:** Shares `hasUnreadLearn` boolean between dashboard (writer) and tab layout (reader).

```typescript
// Usage in dashboard (index.tsx):
const { setHasUnreadLearn } = useLearnContext();
// Called after learn-articles fetch with derived boolean

// Usage in _layout.tsx:
const { hasUnreadLearn } = useLearnContext();
// Currently unused in nav UI — tab dot removed pending Phase 5 icon pass
// Reserved for future use
```

`LearnProvider` wraps `TabLayoutInner` in `_layout.tsx`.

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
- `event === null` or `payload === null`: no celebration, navigate to dashboard
- `animation === "ring"`: subtle acknowledgment
- `animation === "burst"` or `"confetti"`: show celebration overlay before navigating
- `animation === "fireworks"`: show full-screen celebration

The `activate-celebration.tsx` screen exists for first check-in. One reward per check-in maximum.

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
| checkin.tsx uses namespaced firestore() API | index.tsx uses modular getFirestore(). Both are correct for their respective APIs -- exists() is a method in namespaced API, property in modular API. Style inconsistency only, no bug. No unification needed. |
| gapReconciliation on mobile | Built and committed March 18, 2026. Mirrors web app behavior: single-day gap only, shown before check-in flow, Yes preserves momentum, No applies 0.92 decay. End-to-end test pending March 20. |
| **Historical weeks in coaching.tsx | Verified working March 18, 2026 with real multi-week Firestore data. Collapsible cards expand correctly, content displays correctly.** |
| `route.ts` divergence risk | Mobile momentum math lives in `route.ts`, web in `writeDailyMomentum.ts`. Every future change must be manually mirrored. No automated safeguard. |
| deletionBatch 500-doc limit | RESOLVED March 18, 2026. app/api/delete-account/route.ts now uses adminDb.recursiveDelete() per subcollection. Handles arbitrarily large collections. |
| Pre-March 14 mobile check-ins missing `behaviorRatings` | Lab day detail modal shows empty behaviors for these docs. Web app check-ins are unaffected. All check-ins from March 14 forward write `behaviorRatings` correctly. |
"**Notification preference in Settings | Built and committed March 18, 2026. Toggle in app/(tabs)/settings.tsx reads/writes users/{email}.notificationsEnabled. Scheduling deferred to Phase 4 (requires APNs + Apple Developer account).**
| Weight in The Lab | No weight display in Lab yet. Scope TBD — Phase 4. |
**Weight in coaching prompts | Deployed March 18, 2026. Reads users/{email}.weight in generate-weekly-coaching/route.ts, passes to buildScopedSystemPrompt.ts. Rules: weight only referenced when dominant limiter is protein, nutrition quality, or energy balance. Validator enforces banned weight phrases. Weight trend acknowledgment (positive and negative) deferred post-launch.**
| Canon audit complete | March 15, 2026. Violations fixed: lab.tsx behavior labels, index.tsx greeting subtext, coaching.tsx calibration CTA copy. Phase 3 exit criterion met. |
| `checkin-success.tsx` rebuilt | March 15, 2026. SVG checkmark, particle burst animation with gravity, checkmark rotation entrance, expo-av sound (checkin-complete.mp3). isMilestone path: fireworks/hero only. burst/confetti route to particle path. |
---

## Files This Document Was Derived From

- `app/(app)/checkin/page.tsx` (web)
- `app/(app)/checkin/checkinModel.ts` (web)
- `app/(app)/dashboard/page.tsx` (web)
- `app/(app)/history/page.tsx` (web)
- `app/(app)/history/useMomentumHistory.ts` (web)
- `app/(app)/learn/page.tsx` (web)
- `app/services/writeDailyMomentum.ts` (web)
- `app/services/newtonianMomentum.ts` (web)
- `app/services/missedCheckIns.ts` (web)
- `app/services/rewardEngine.ts` (web)
- `app/services/learnService.ts` (web)
- `app/services/weightService.ts` (web)
- `app/components/CoachAccess.tsx` (web)
- `app/components/LearnBanner.tsx` (web)
- `app/components/WeightCard.tsx` (web)
- `app/utils/date.ts` (web)
- `app/api/submit-checkin/route.ts` (web)
- `app/api/learn-articles/route.ts` (web)