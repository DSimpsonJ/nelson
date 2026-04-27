# Nelson Mobile Build Reference
**Version:** 1.6  
**Last Updated:** March 27, 2026  
**Supersedes:** NELSON_MOBILE_BUILD_REFERENCE_v1_5.docx

---

## Architecture Decisions (Locked)

- Gap detection runs before every real check-in submission. Architectural contract. Not optional.
- `checkinCompleted === true` on today's momentum doc is the canonical check-in guard. Not `lastCheckInDate`. Not `missed`. This field alone.
- `calculateDailyScore` filters mindset internally. Send all 7 behaviors — score is calculated from 6.
- All momentum writes go through `/api/submit-checkin` on the web server. Mobile calls this endpoint — it does not write momentum docs directly.
- Gap fill writes go directly to Firestore from the client. Gap fills are not routed through the API.
- `currentFocus` lives at `users/{email}/momentum/currentFocus` — not a date-keyed doc.
- ISO 8601 week calculation, Monday = week start. Do not change.
- `weightHistory` is the single source of truth for weight. `users/{email}.weight` is kept in sync for protein calculations only.
- `learnService` is exposed via API endpoint (`/api/learn-articles`) — not ported to mobile. Returns `{ articles, readSlugs }`.
- `totalRealCheckIns` is calculated via live Firestore doc count in `submit-checkin/route.ts` — not chained from previous doc. Do not revert to chained counter.
- `writeDailyMomentum.ts` is dead code. Retained as reference only. Never call it.
- Phase boundary logic lives in `app/utils/momentumPhases.ts` on the web. Mobile must replicate this logic — do not import from web. The source of truth for phase boundaries is that file; port the constants, not the import.

---

## Firestore Collections Mobile Touches

### `users/{email}`

| Field | Type | Notes |
|---|---|---|
| `firstName` | string | |
| `weight` | number | Sync only — read `weightHistory` for display |
| `primaryFocus` | string | |
| `readLearnSlugs` | string[] | `arrayUnion` on article read |
| `hasSeenNotificationPrompt` | boolean | |
| `notificationsEnabled` | boolean | |
| `notificationHour` | number | 0-23 |
| `notificationMinute` | number | 0-59 |
| `trialStartDate` | string | ISO, written on first check-in |
| `isSubscriber` | boolean | Written on validated IAP receipt — Phase 4 |
| `lastCheckInDate` | string | YYYY-MM-DD, written on every check-in |
| `focusBehavior` | string | Selected behavior key for current week (e.g. `sleep`, `hydration`). Written by weekly review flow. |
| `focusBehaviorSetWeek` | string | ISO week ID when focus was set (e.g. `2026-W13`). Used to validate focus is current week before displaying. |

### `users/{email}/momentum/{YYYY-MM-DD}`

| Field | Type | Notes |
|---|---|---|
| `checkinCompleted` | boolean | Canonical check-in guard |
| `checkinType` | string | `'real'` or `'gap_fill'` only |
| `missed` | boolean | |
| `momentumScore` | number | 0-100 |
| `rawMomentumScore` | number | Before ramp caps |
| `momentumDelta` | number | Change from previous day |
| `momentumTrend` | string | `'up'` / `'down'` / `'stable'` |
| `visualState` | string | `'solid'` / `'outline'` / `'empty'` |
| `dailyScore` | number | |
| `behaviorGrades` | `{ name: string; grade: number }[]` | |
| `behaviorRatings` | `Record<string, string>` | Written by API from March 14 forward |
| `exerciseCompleted` | boolean | |
| `totalRealCheckIns` | number | |
| `accountAgeDays` | number | |
| `currentStreak` | number | |
| `note?` | string | Optional |
| `createdAt` | string | ISO |

### Other Collections

| Collection / Document | Key Fields | Notes |
|---|---|---|
| `users/{email}/momentum/currentFocus` | `habit`, `habitKey`, `target`, `suggested?`, `lastLevelUpAt?` | Not a date-keyed doc |
| `users/{email}/metadata/accountInfo` | `firstCheckinDate: string (YYYY-MM-DD)` | |
| `users/{email}/profile/plan` | `movementCommitment: number`, `goal: string` | |
| `users/{email}/weeklySummaries/{YYYY-Www}` | `status`, `weekId`, `generatedAt`, `viewedAt?`, `coaching: { pattern, tension, whyThisMatters, progression: { type, text } }` | |
| `users/{email}/weightHistory/{auto-id}` | `date`, `weight`, `timestamp (ISO)`, `weekOf (YYYY-Www)` | |
| `users/{email}/weeklyCalibrations/{YYYY-Www}` | `source: 'weekly_review_v2'`, drag source, focus behavior, exercise target | Written by weekly review flow |
| `users/{email}/badges/{badgeId}` | `type`, `earnedAt (ISO)`, `phaseName?`, `fromPhase?` | Written by `/api/submit-checkin` server-side. Read-only on client. See Badge System section. |

---

## Behaviors and Grade Values

| Field Name (canonical) | UI Title | Counts toward score? |
|---|---|---|
| `nutrition_quality` | Nutrition Quality | Yes |
| `portion_control` | Portion Control | Yes |
| `protein` | Protein Intake | Yes |
| `hydration` | Hydration | Yes |
| `sleep` | Sleep | Yes |
| `mindset` | Mental State | No — stored for coaching context only |
| `movement` | Bonus Activity | Yes — NEAT/extra movement, not exercise commitment |

| Rating | Grade |
|---|---|
| `elite` | 100 |
| `solid` | 80 |
| `not-great` | 50 |
| `off` | 0 |

---

## API Contracts

### POST `/api/submit-checkin`

**URL:** `https://thenelson.app/api/submit-checkin`

**Request body:**

| Field | Type | Notes |
|---|---|---|
| `idToken` | string | Firebase ID token |
| `email` | string | |
| `date` | string | YYYY-MM-DD, today |
| `behaviorGrades` | array | All 7, canonical name keys |
| `currentFocus` | object | `{ habitKey, habit }` |
| `goal` | string | User's `primaryFocus` field |
| `accountAgeDays` | number | |
| `exerciseDeclared` | boolean | |
| `isFirstCheckin` | boolean | |
| `note?` | string | Optional, trimmed before send |

**Response:**

```json
{
  "success": true,
  "momentumScore": number,
  "momentumDelta": number,
  "reward": RewardResult,
  "phaseTransition": { "from": string, "to": string } | null
}
```

`phaseTransition` is non-null only when this check-in crossed a phase boundary. Mobile should show a phase transition acknowledgment screen after the celebration animation completes if `phaseTransition` is present.

**What the API does:**
- Verifies Firebase ID token
- Counts real check-ins via live Firestore query for `totalRealCheckIns`
- Runs `calculateNewtonianMomentum` + `calculateDailyScore`
- Applies ramp caps for first 9 check-ins
- Resolves reward via `rewardEngine`
- Writes momentum doc including `behaviorRatings` (derived from `behaviorGrades`)
- Updates `lastCheckInDate` on user doc
- Writes `firstCheckinDate` to `metadata/accountInfo` and `trialStartDate` on first check-in only
- Detects phase transition and awards badge if boundary crossed
- Awards `checkin_100` identity badge if `totalRealCheckIns === 100`

### GET `/api/learn-articles`

**Authorization:** `Bearer {idToken}`

**Response:** `{ articles: Article[], readSlugs: string[] }`

- Learn screen: render articles, mark unread where `!readSlugs.includes(slug)`
- Dashboard banner: `articles.find(a => !readSlugs.includes(a.slug))`
- Mark as read: `arrayUnion(slug)` to `users/{email}.readLearnSlugs` directly from mobile

---

## Key Calculations

### Protein Range

```typescript
const weight = userData.weight || 170;
const capped = Math.min(weight, 240);
// Display as: `${Math.round(capped * 0.6)}-${Math.round(capped * 1.0)}g`
```

### accountAgeDays

```typescript
const firstCheckinDate = metaSnap.data()?.firstCheckinDate ?? today;
const accountAgeDays = Math.floor(
  (new Date(today).getTime() - new Date(firstCheckinDate + 'T00:00:00').getTime())
  / (1000 * 60 * 60 * 24)) + 1;  // Minimum 1
```

### currentFocus Source (priority order)

1. `users/{email}/momentum/currentFocus` — read `habit` and `habitKey`
2. `users/{email}/profile/plan` — fallback: `habitKey: 'movement_${minutes}min'`, `habit: 'Move ${minutes} minutes daily'`

### Weight Write (both onboarding and update)

1. `addDoc` to `weightHistory` with `{ date, weight, timestamp, weekOf }`
2. `update users/{email}.weight` to keep protein range in sync
3. Read: query `weightHistory` ordered by `timestamp desc`, `limit 1`

---

## Phase System

### Phase Boundaries (Locked)

Port these constants directly. Source of truth on web: `app/utils/momentumPhases.ts`.

| Check-ins | Phase Name | Dashboard Copy |
|---|---|---|
| 1-2 | Initiation | This is fragile. Every check-in is building the signal. |
| 3-7 | Activation | Early patterns are forming. |
| 8-14 | Patterning | You're starting to repeat this. |
| 15-21 | Integration | This is getting easier to repeat. |
| 22-29 | Accumulation | This is getting harder to break. |
| 30-59 | Consolidation | You don't have to push as hard anymore. |
| 60-99 | Resilience | Off days won't knock you off track. |
| 100+ | Identity | This runs automatically now. |

### Phase Detection Logic

```typescript
function getPhaseIndex(totalCheckIns: number): number {
  const n = Math.max(totalCheckIns, 1);
  return MOMENTUM_PHASES.findIndex(p => n >= p.min && n <= p.max);
}
```

### Phase Display on Dashboard

- Phase name displayed as `"{PhaseName} Phase"` — include the word "Phase"
- Tappable — opens a bottom sheet showing all 8 phases in arc, current highlighted, past marked, future dimmed
- No countdown to next phase — do not show "X check-ins to [Next Phase]"
- If user is In The Zone, show `"· In The Zone"` inline after the phase name

### Phase Transition on Check-in Success Screen

When `phaseTransition` is non-null in the API response:
- Show celebration animation first (if any)
- After Continue: show a full-screen phase transition acknowledgment
  - Label: "PHASE REACHED"
  - Large heading: `phaseTransition.to`
  - Copy: the dashboard copy for that phase (from table above)
  - Continue button routes to dashboard
- If no celebration fired, show phase transition acknowledgment directly after check-in complete screen

### Phase Bottom Sheet Contents

- Current phase name (large)
- Current phase copy (one line)
- Horizontal arc showing all 8 phases: past marked, current highlighted in amber/orange, future dimmed
- Zone explanation at the bottom (always visible from day one):
  > "The Zone is 11 of the last 14 days at 75% momentum or better. No phase requirement — consistent execution gets you there."

---

## The Zone

### Definition
11 of the last 14 real check-in days at 75%+ momentum.

### Detection Logic

```typescript
// From all momentum docs, filter to real only, take last 14
const last14Real = allMomentumDocs
  .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.id))  // date-keyed docs only
  .filter(d => d.checkinType === 'real')
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 14);

const inTheZone = last14Real.length >= 14 &&
  last14Real.filter(d => d.momentumScore >= 75).length >= 11;
```

**Critical:** Filter to date-keyed docs first (regex `/^\d{4}-\d{2}-\d{2}$/`) before slicing. The momentum collection contains non-date docs (`currentFocus`, `commitment`, `levelUpPrompt`) that will consume slots in the 14-doc window if not excluded.

### Dashboard Display
`"{PhaseName} Phase · In The Zone"` — inline, amber/orange color, no changes to momentum bar color.

---

## Force / Drag Cause Layer

### Definition
Weekly pattern signal surfaced on the dashboard momentum card trend sentence.

### Detection Logic

```typescript
// From last 7 real check-in docs, read behaviorRatings
const realLast7 = last7MomentumDocs
  .filter(d => d.checkinType === 'real')
  .map(d => d.behaviorRatings);  // Record<string, string>

const BEHAVIORS = [
  'nutrition_quality', 'portion_control', 'protein',
  'hydration', 'sleep', 'mindset', 'movement'
];

const driverBehaviors = BEHAVIORS.filter(b =>
  realLast7.filter(r => r?.[b] === 'elite').length >= 3
);
const dragBehaviors = BEHAVIORS.filter(b =>
  realLast7.filter(r => r?.[b] === 'not-great' || r?.[b] === 'off').length >= 3
);

// Single standout only — driver OR drag, never both
if (driverBehaviors.length === 1)       → show driver sentence
else if (dragBehaviors.length === 1)    → show drag sentence
else                                     → silence (fallback to existing trend sentence)
```

Requires minimum 3 real check-ins in the last 7 days to compute.

### Copy

- Driver: `"{BehaviorLabel} is driving momentum this week."`
- Drag: `"{BehaviorLabel} is creating drag this week."`

### Label Override

The `movement` behavior should display as `"Bonus activity"` (not "Movement") in these sentences to avoid confusion with the exercise commitment. All other behaviors use their standard UI labels.

### Priority

Force/drag only surfaces when `momentumDelta` is between -5 and +5. When delta is >= 5 or <= -5, the delta-based sentence takes priority.

---

## Badge System

### Badge Collection
`users/{email}/badges/{badgeId}`

| Field | Type | Notes |
|---|---|---|
| `type` | string | See badge types below |
| `earnedAt` | string | ISO timestamp |
| `phaseName?` | string | Phase reached (phase transition badges only) |
| `fromPhase?` | string | Previous phase (phase transition badges only) |

### Badge Types

| Badge ID | Type | Trigger |
|---|---|---|
| `phase_activation` | `phase_transition` | Cross into Activation (check-in 3) |
| `phase_patterning` | `phase_transition` | Cross into Patterning (check-in 8) |
| `phase_integration` | `phase_transition` | Cross into Integration (check-in 15) |
| `phase_accumulation` | `phase_transition` | Cross into Accumulation (check-in 22) |
| `phase_consolidation` | `phase_transition` | Cross into Consolidation (check-in 30) |
| `phase_resilience` | `phase_transition` | Cross into Resilience (check-in 60) |
| `phase_identity` | `phase_transition` | Cross into Identity (check-in 100) |
| `checkin_100` | `identity` | `totalRealCheckIns === 100` |

### Rules
- Written server-side only by `/api/submit-checkin` via Admin SDK
- Guard: check if badge doc exists before writing — never overwrite
- Client reads badges collection to display Milestones section in The Lab
- Firestore rule: `read: isOwner(email)`, `write: false` (client cannot write)

### Milestones Display (The Lab)
- Dedicated "Milestones" section in The Lab
- Badges sorted chronologically by `earnedAt`
- Phase transition badge label: `"{phaseName} Phase reached"`
- Identity badge label: `"100 check-ins"`
- Empty state: `"No milestones yet. Phase transitions and check-in achievements appear here."`
- On badge unlock: existing celebration animation fires (burst or confetti tier per phase), then badge persists in The Lab permanently

---

## Gap Detection

Runs client-side before every `submitCheckIn` call. Never routed through API.

**Logic:** Look back up to 30 days for last real check-in (`missed !== true`). If gap > 1 day, fill each missing date with a gap-fill doc. Skip dates that already have a doc.

**Decay:** `Math.round(momentum * 0.92)` per missed day applied to `decayedMomentum`. `momentumScore` on gap doc holds last known value.

**On failure:** Log and continue. Do not block check-in submission.

---

## Routing and Auth

### `_layout.tsx` (Root)

- `app/index.tsx` returns null — required to prevent paywall flash on load
- Stack has `animation: 'none'` on `screenOptions` — eliminates slide transitions during initial routing
- `onAuthStateChanged` resolves auth, then Firestore check runs before anything renders
- Route logic: `isSubscriber: true` → `/(tabs)`. Valid trial (`trialStartDate` within 14 days) → `/(tabs)`. Otherwise → `/(paywall)`.
- `hasCommitment !== true` → `/(onboarding)/name`

### Trial and Subscription Gate

- `isSubscriber: boolean` on `users/{email}`. Checked first — bypasses trial gate entirely.
- `trialStartDate`: ISO string written by `/api/submit-checkin` on first check-in (`isFirstCheckin` guard).
- Trial is 14 days from `trialStartDate`. Hard gate — no dismiss, `gestureEnabled: false` on paywall.
- All 14 alpha users have `isSubscriber: true` set in Firebase console. Lifetime free access.
- Subscribe and Restore buttons on paywall are placeholders until StoreKit wired in Phase 4.

---

## Notifications

- `expo-notifications` installed (SDK 54). Local daily notifications scheduled on user-selected time.
- 7 rotating Canon-compliant messages, scheduled weekly.
- `NotificationPrompt` shows on first dashboard load (`hasSeenNotificationPrompt` guard).
- Settings toggle wires to schedule/cancel local notifications.
- APNs (remote push) deferred until Apple Developer enrollment — required for notification suppression post-check-in.

---

## Celebration System

### Architecture

Tiered. API returns `RewardResult` on every check-in. Mobile reads `result.reward?.payload?.animation` and routes in `checkin-success.tsx`. Each tier has its own return block — do not merge.

### Tier Map

| Animation | Component | Sound | Triggers |
|---|---|---|---|
| `ring` | RingCheck (Lottie) | checkin-complete.mp3 | Every check-in fallback |
| `burst` | SolidDayBurst (Lottie) | burst-hit.mp3 | `solid_day`, `milestone_burst` (3, 15, 20, 30, 35, 45...) |
| `confetti` | ConfettiBurst (Lottie) | confetti-fanfare.mp3 | `elite_day`, `first_80/90_momentum`, `milestone_confetti` (10, 20, 40...) |
| `fireworks` | FireworksBurst (Lottie) | fireworks-milestone.mp3 | `solid_week`, `first_100_momentum`, `milestone_fireworks` (25, 50, 75, 100...) |

### Phase Transition + Celebration Flow

When `phaseTransition` is non-null in the API response AND a celebration fires:
1. Celebration animation plays
2. User taps Continue
3. Phase transition acknowledgment screen shows (full screen, dark background)
4. User taps Continue
5. Routes to dashboard

When `phaseTransition` is non-null but no celebration fires (ring animation):
1. Check-in complete screen shows with phase transition card inline
2. User taps Continue
3. Routes to dashboard

### Components

**RingCheck.tsx**
- Lottie: `assets/animations/Ring_check.json`
- Blue circle intentional — signals 'showed up' vs amber which signals 'performed'
- Plays `checkin-complete.mp3` internally

**FirstCheckInBurst.tsx**
- Lottie: `Confetti.json` full screen + `Success_check_1.json` centered (320px)
- 30bpm pulse on checkmark via `withRepeat/withSequence`. Use `Easing.sin` — `Easing.sine` does not exist in this RN Reanimated version
- Plays `activate-celebration.mp3` internally — distinct sound
- Used by `activate-celebration.tsx` only (onboarding first check-in)

**FireworksBurst.tsx**
- Lottie: `Fireworks.json` (720x1280 portrait) full screen + `Success_check_1.json` on top
- `onAnimationFinish` unmounts checkmark after animation (fixes lingering last-frame)
- Plays `fireworks-milestone.mp3` internally

**SolidDayBurst.tsx**
- Lottie: `Success_check_1.json` — amber circle, white checkmark, radiating lines
- Plays `burst-hit.mp3` internally

**ConfettiBurst.tsx**
- Lottie: `Confetti.json` full screen + `Success_check_1.json` on top
- Plays `confetti-fanfare.mp3` internally
- Color palette (blue/orange) not fully on-brand — revisit before App Store submission

### Haptic Feedback

- `expo-haptics` — already in SDK 54, no install needed
- Light: all rating taps and Yes/No exercise taps
- `NotificationFeedbackType.Success`: celebration screen mount
- Light: Continue / Go to Dashboard button press (all four tiers, both screens)

### Lottie Notes

- Library: `lottie-react-native@6.7.2`
- Installation requires full native rebuild (`npx expo run:ios --device`) — not just Metro clear
- Colors baked into JSON — `colorFilters` prop is unreliable. Pick files with acceptable palettes at source.

### Canon Exception

The emoji on the Solid rating button in `activate-checkin.tsx` is the ONLY permitted emoji in functional UI across the entire app. Single reinforcement on first check-in that Solid is the target, not Elite. Do not remove.

---

## Weekly Coaching (Server-Side)

### Cron

- Runs every Monday 8am UTC via Vercel cron.
- Skips users where `lastCheckInDate` is older than 14 days — no API call made for inactive users.
- Calls `/api/generate-weekly-coaching` per eligible user, sequential with 1500ms delay.

### Lapsed User Handling

- If `totalLifetimeCheckIns >= 1` and `realCheckInsThisWeek === 0` — static hardcoded placeholder fires, zero API cost.
- Placeholder acknowledges the gap, explains momentum dampening, orients toward return.
- `detectWeeklyPattern.ts` fallback searches full account history (no date window) for `totalLifetimeCheckIns` — handles users gone 6+ months.

### Weekly Review Flow

After receiving weekly coaching, users complete a 3-step intercept:
1. Drag source (what got in the way this week — 4 options)
2. Weekly focus behavior (7 behaviors, AI suggestion highlighted)
3. Exercise commitment picker (5/10/15/20/30/45/60 min)

Saves to:
- `/api/save-weekly-calibration` (drag source, exercise target)
- `users/{email}.focusBehavior` (selected behavior key)
- `users/{email}.focusBehaviorSetWeek` (current ISO week ID)
- `users/{email}/momentum/currentFocus.target` (if exercise target changed)

Mobile port: this flow lives on the web at `app/(app)/weekly-review/page.tsx`. Port after web validation with alpha users.

---

## Open Items

| Item | Notes |
|---|---|
| Pre-March 14 mobile check-ins missing `behaviorRatings` | Lab day detail modal shows empty behaviors for these docs. Not fixable retroactively. Web app check-ins unaffected. |
| APNs remote push | Deferred until Apple Developer enrollment. Required for post-check-in notification suppression. |
| `Confetti.json` palette | Blue/orange not fully on-brand. Revisit before App Store submission. |
| Paywall IAP wiring | Subscribe and Restore buttons are placeholders. Phase 4 Week 1 after Apple Developer enrollment. |
| Weight in The Lab | No weight display in Lab yet. Scope TBD — Phase 4. |
| Inactive user paywall cutoff | Alpha users have `isSubscriber: true` (lifetime free). Future paywall cutoff date for other inactive users is TBD. |
| Mobile port — Phase system, badges, Zone, Force/Drag | All features built in web session March 27, 2026. Port after web validation with alpha users. Separate session. Read this document in full before starting. |
| Focus behavior momentum weighting | Idea: weekly focus behavior carries slightly more weight in momentum calculation. Deferred — post-launch, requires Canon review before implementing. |
| Zone badge (14-day sustained) | Deferred — needs retention data showing users are reaching The Zone consistently before worth building. |
| `recentMomentum` state | Declared in dashboard but `setRecentMomentum` never called. Dead state. Clean up in pre-launch pass. |
| `momentumDelta` prop in `CheckinSuccessAnimation` | Wired but no longer used (outcome text removed). Clean up in pre-launch pass. |
| Success screen outcome text | Removed — "Moving forward / Steady / Slowed" felt useless without more context. Revisit post-launch with retention data. |
| Delta number display | Delta shows under "Momentum" header on dashboard. Visual placement marked for potential refinement with alpha feedback. |