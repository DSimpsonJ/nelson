# NELSON SYSTEM TRIAGE
Frozen At: January 20, 2026
Purpose: System-wide health assessment before repair work

## Classification Legend
- WORKING: Functions correctly, no Canon violations, minor polish only
- REPAIR: Functions but has truth/integrity issues requiring fixes
- BROKEN: Does not function as designed, blocks users or violates Canon
- DEPRECATED: Legacy feature, marked for removal

## Dependency Notation
- → (uses): This system calls/reads from another
- ← (used by): This system is called/read by another
- ⚠️ (tight coupling): Change one, must change the other

---

## 1. MOMENTUM
**Status:** REPAIR — Truth risk identified

**What it does:**
- Calculates daily momentum score (0-100%)
- Applies physics-based dampening
- Gates momentum with exercise completion
- Applies ramp caps for first 10 check-ins

**Files:**
- `/app/services/writeDailyMomentum.ts` (450+ lines)
- `/app/services/newtonianMomentum.ts`
- `/app/services/currentFocus.ts`
- `/app/services/milestoneState.ts`

**Dependencies:**
- → Check-In (consumes behavior grades)
- ← Dashboard (displays momentum score)
- ← Rewards (uses momentum for triggers)
- ⚠️ Tight coupling with Check-In flow

**Known Issues:**
- Double ramp cap application (CRITICAL)
- Exercise gate after trend calculation (HIGH)
- Motivational messages in code (HIGH)
- Streak language instead of consecutive days (MEDIUM)

**Dead Code Suspected:**
- `primaryHabitHit`, `stackedHabitsCompleted`, `moved`, `hydrated`, `slept`, `nutritionScore` fields
- `foundations` object (always false)
- `stack` object (always empty)

---

## 2. CHECK-IN
**Status:** REPAIR — duplication, dead inputs, calibration wording

**What it does:**
Daily behavior rating flow (7 behaviors + exercise commitment). Loads dynamic behaviors based on user weight, collects ratings via swipe UI, detects/fills gaps before submission, calls writeDailyMomentum service, displays success animation.

**Files:**
/app/(app)/checkin/page.tsx (main flow, 320 lines)
/app/(app)/checkin/checkinModel.ts (behavior definitions, grade conversion)
/app/(app)/checkin/components/CheckinShell.tsx (shell component)
/app/(app)/checkin/components/CheckinQuestion.tsx (rating UI)
/app/(app)/checkin/components/ProgressIndicator.tsx (progress bar)
/app/(app)/checkin/types.ts (TypeScript types)
/app/components/rewards/CheckinSuccessAnimation.tsx (success screen)

**Dependencies:**
→ Auth (getEmail via Firebase Auth)
→ Firestore (reads user weight, currentFocus)
→ Momentum (calls writeDailyMomentum service)
→ Gap Detection (calls detectAndHandleMissedCheckIns)
→ Metadata (reads firstCheckinDate for accountAgeDays calculation)

Dependents (used by):

← Dashboard (redirects here for check-in)
← Onboarding (first check-in is separate but similar)
← Layout (navigation link)

**Known Issues:**
Date calculation duplicated (Lines 233-237): accountAgeDays calculated in check-in page AND in writeDailyMomentum service (should be single source)
Gap detection console logs (Lines 218-223): Debug logging left in production code
Exercise question asks about "yesterday" (Line 146): Confusing - check-in is for yesterday but asks "Did you complete... yesterday?" (should be clearer)
Note handling (Line 256): Note conditionally added to writeDailyMomentum call but logic for empty string vs undefined is unclear
Success animation timing (Line 277): Hard-coded 600ms delay, not configurable

**Dead Code Suspected:**
habitStack parameter (Line 249): Always empty array, passed to writeDailyMomentum but never populated
goal parameter: Not passed to writeDailyMomentum but exists in service interface
Swipe velocity thresholds (Lines 165, 311): Two different threshold values (300 vs 500) - inconsistent
direction state (Lines 33, 118, 125, 158, 165): Used for animation but may be over-engineered

Additional observations:

Behavior order is hard-coded in getBehaviors() - exercise is NOT in the 7 behaviors list
Exercise commitment question is separate flow (Step 0), then 7 behaviors (Steps 1-7), then note (Step 8)
Total steps = 9 (exercise + 7 behaviors + note)

---

## 3. DASHBOARD
**Status:** REPAIR - Works but severely bloated with dead code (70%+ cleanup potential)

**What it does:**
Landing page after check-in. Displays welcome message, consecutive days count, momentum status, check-in button, and brief history (current run, lifetime check-ins, 30-day completion %).

**Files:**
/app/(app)/dashboard/page.tsx (3,112 lines - bloated with dead code and dev tools)
Recharts library components (BarChart, LineChart - imported but usage unknown)
/app/components/WalkTimer.tsx (imported but dead)

**Dependencies:**
→ Auth (getEmail)
→ Firestore (reads: user doc, momentum docs, check-ins, sessions, weeklyStats, habitStack, currentFocus, profile/intake, profile/plan)
→ Momentum (displays momentum score and trend)
→ Check-in (button routes to /checkin)
→ Toast notifications (useToast context)
→ Dev tools (devClearCheckins, devSeedCheckins, devRecalculateWeeklyStats)

Dependents (used by):

← Check-in (redirects here after completion with ?checkin=done)
← Layout (default authenticated route)
← Onboarding (final destination after first check-in)

**Known Issues:**
BLOAT: 3,112 lines for a simple dashboard (likely 70%+ dead code)
Dead imports: WalkTimer (line 52), Recharts charts may be unused, seedFakeCheckins, refreshCoachNote, generateCoachInsight, logInsight, generateWeeklySummary, getStreakMessage (all legacy from old features)
Habit stacking reads (line 447-448): Reads habitStack but feature is deprecated
weeklyStats reads (line 230-231): Reads weekly stats but unclear if displayed
Multiple trend calculations: calculateTrends(), TrendStats, CheckinTrend types imported but may not be used
Streak messaging (imported): Uses getStreakMessage which likely violates Canon's "no streak language" rule
Dev tools in production (bottom of file): Should be feature-flagged or removed entirely

**Dead Code Suspected:**
Dead code suspected:

Walk timer (imported line 52, never used)
Habit stacking reads (line 447-448, feature cut)
Weekly stats system (lines 230-231, unclear if used)
Coach insights/notes (refreshCoachNote, generateCoachInsight, logInsight - all imported)
Fake checkin seeding (seedFakeCheckins - should be dev-only)
Trend calculations (calculateTrends function - may not be displayed)
Level-up system (handleLevelUp, getNextLevel functions - lines 1186-1242)
Workout details (getTodaysWorkout, getWorkoutDetails - lines 275-283)
Empty state component (line 114-158, may not render)
Session recording (saveSession imported, may be unused)
Date-fns formatting (format, subDays, formatDistanceToNow - may be over-imported)

Additional observations:

Line 363 comment: "This state can be removed entirely or kept as unused for now" - explicit acknowledgment of dead code
Multiple Firestore collections read but unclear which are actually displayed
Dev tools clearly marked at bottom but should not be in production build
File needs aggressive pruning - likely 1,000 lines of actual working code

---

## 4. LEARN
**Status:** BROKEN — Gate not enforced

**What it does:**
- Drip-releases articles based on firstCheckinDate
- Tracks read status via readLearnSlugs
- Shows blue dot for unread eligible articles

**Files:**
- `/app/services/learnService.ts`
- `/app/(app)/learn/page.tsx`
- `/app/(app)/learn/[slug]/page.tsx`
- `/app/(app)/layout.tsx` (blue dot logic)

**Dependencies:**
- → Auth (should require hasCommitment, currently excluded)
- → Metadata (reads firstCheckinDate)
- ← Layout (blue dot display)

**Known Issues:**
- /learn excluded from commitment gate (layout.tsx line 30)
- Users without commitment can access Learn

**Dead Code Suspected:**
- None identified yet

---

## 5. LAB (HISTORY)
**Status:** REPAIR - Works correctly but violates Canon's brand voice (streak language)

**What it does:**
Read-only historical pattern display. Shows momentum trend chart (rolling window), stats summary, behavior distribution table, and monthly calendar with day-level detail popups. Displays exercise gate status (enabled/disabled for momentum increases).

**Files:**
/app/(app)/history/page.tsx (488 lines)
/app/(app)/history/useMomentumHistory.ts (custom hook - not provided)
Recharts library (LineChart component)

**Dependencies:**
→ Auth (user email via router/context)
→ Firestore (reads all momentum docs via useMomentumHistory hook)
→ Momentum (displays momentum scores, trends, exercise completion)
Router (back button to dashboard)

Dependents (used by):

← Dashboard (navigation link)
← Layout ("The Lab" in nav)

**Known Issues:**
CANON VIOLATION - Streak language (lines 175, 181): Displays "Current Run" and "Longest Run" using currentStreak and lifetimeStreak fields

Canon Section 2: ❌ "X days in a row" / ✅ "Pattern: X consecutive days"
Should say "Consecutive days" not "Current Run"


Unclear copy (line 81): "Increases: ENABLED/DISABLED" label is unclear to users (means exercise gate status)
Fixed window (line 146): "Last {currentWindow.length} days (rolling)" - window size not user-configurable
Behavior distribution hidden (line 216): If fewer than 3 check-ins, shows "More Data Needed" - arbitrary threshold
Calendar month fixed (line 231): Shows only most recent month, no navigation to previous months
Gap day labeling (line 322, 438): Shows "Gap" label but doesn't explain what it means
Exercise commitment wording (line 354): "Exercise commitment: Met/Not met" - passive voice, unclear

**Dead Code Suspected:**
expandedNote state (lines 14, 23, 362, 373): Note expansion logic exists but notes rarely used
accountAgeDays (line 13): Imported from hook but never used in component
Overflow handling complexity (lines 283-296, 404): Popup positioning logic may be over-engineered

Additional observations:

Good: Purely read-only (no writes, no data manipulation)
Good: Factual display with minimal interpretation
Risk: Streak language violates Canon but is in user-facing UI
Risk: "Run" terminology implies streak worship (Canon violation)
Navigation label is "The Lab" but route is /history (inconsistent but documented in System Brief)

Canon Risk Assessment

TRUST RISK - Not Truth Risk
Why:

Data displayed is accurate (reads from Firestore correctly)
No calculation errors or data manipulation
Momentum scores shown are what was written
No hidden state changes or black-box behavior

Trust violations:

Streak language ("Current Run", "Longest Run") breaks Canon's anti-streak philosophy
Could encourage streak worship despite physics-based momentum model
"Run" terminology implies all-or-nothing thinking (Canon: patterns over perfection)

---

## 6. REWARDS (Phase 2 Fix Priority: MEDIUM)
**Status:** WORKING — Canon-compliant but needs renaming to CelebrationEngine.ts

**What it does:**
Triggers factual milestone celebrations (first Solid momentum, consecutive day milestones, bounce-back after gaps). Stores celebration in sessionStorage for one-time display after check-in.

**Files:**
- `/app/services/rewardEngine.ts` (rename to celebrationEngine.ts)
- `/app/services/milestoneState.ts`
- `/app/components/rewards/CheckinSuccessAnimation.tsx` (displays celebration)

**Dependencies:**
- → Momentum (reads score for trigger logic)
- ← Check-In (calls resolveReward after writeDailyMomentum)
- ← Dashboard (displays celebration from sessionStorage)

**Known Issues:**
- **TERMINOLOGY VIOLATION:** System uses "rewards" terminology (implies gamification)
  - Should be "celebrations" or "milestones" throughout
  - Violates Canon's anti-gamification stance in naming only
- Implementation is Canon-compliant (factual, earned, proportional)

**Dead Code Suspected:**
- None - system is actively used

**Canon Risk:**
- **TRUST RISK (minor):** "Rewards" terminology could be misinterpreted as gamification
- Implementation itself is Canon-compliant
- Fix: Global find/replace "reward" → "celebration"

**Additional observations:**
- Messages are factual ("80% momentum achieved. This pattern is real.")
- No motivational language found
- Celebrations stored in sessionStorage (ephemeral, one-time display)
- Milestone state persists to prevent duplicate celebrations

---

## 7. AUTH & GATES
**Status:** REPAIR - Works correctly but contains dead field writes and needs Learn gate fix

**What it does:**
Controls access to authenticated app. Enforces commitment gate (hasCommitment), manages Firebase Auth state, handles login/signup/logout, redirects based on auth state.

**Files:**
/app/(app)/layout.tsx (gate enforcement, 235 lines)
/app/login/page.tsx (login flow)
/app/signup/page.tsx (account creation)
/app/firebase/config.ts (Firebase auth setup)
/app/utils/getEmail.ts (auth helper)

**Dependencies:**
→ Firebase Auth (authentication)
→ Firestore (reads user doc, hasCommitment field)
→ localStorage (auth persistence via nelsonUser)

Dependents (used by):

← ALL authenticated routes (everything under /app/(app)/)
← Check-in (requires auth)
← Dashboard (requires auth + commitment)
← Learn (requires auth, commitment gate PENDING)
← Lab/History (requires auth)

**Known Issues:**
DEAD FIELD WRITES (signup.tsx line 50-52, first check-in): Writes firstCheckInAt and isActivated but NEVER reads them

firstCheckInAt (top-level, ISO) written, firstCheckinDate (metadata, YYYY-MM-DD) is authoritative
isActivated written but gate uses hasCommitment instead


Learn gate exclusion (layout.tsx line 32): /learn excluded from commitment gate, should be gated (PENDING fix per System Brief)
Auth state race condition (layout.tsx lines 42-78): Complex two-state check (authReady + commitmentChecked) to prevent flicker
Debug console logs (layout.tsx lines 28-29, 50): Production code has debug logging
Redirect in render (layout.tsx lines 171-182): Redirects happen during render, not in useEffect (intentional but unusual pattern)
localStorage dependency (login, signup, getEmail): Auth persistence relies on localStorage, breaks in incognito/privacy mode

**Dead Code Suspected:**
Dead Code Suspected:

firstCheckInAt field (top-level) - written at signup + first check-in, NEVER read anywhere
isActivated field - written at signup + first check-in, NOT used in gate logic (hasCommitment is actual gate)
ensureAuthPersistence() call (layout.tsx line 48) - may be redundant if already set in config.ts
Blue dot tooltip logic (layout.tsx lines 14, 138-161) - overly complex for simple feature
dashboardWelcomeSeenAt, hasSeenDashboardWelcome, hasSeenLearnDotTooltip, hasSeenMomentumTooltip fields - tooltip tracking bloat

Additional observations:

Good: Single source of truth for gate (hasCommitment)
Good: Explicit pathname exclusions documented
Risk: Three different auth checks scattered (layout gate, login redirect, signup redirect) - could desync
Risk: localStorage auth can fail silently in private browsing
Gate logic is in layout (correct) but also duplicated in individual pages (login/signup check for existing auth)

Canon Risk:

TRUST RISK (minor): Dead fields in Firestore confuse debugging
TRUTH RISK (low): Gate logic is sound, but dead fields create false appearance of complexity

---

## 8. ONBOARDING
**Status:** WORKING — Functions as designed, minor cleanup needed

**What it does:**
Guides new users from signup through first check-in. Flow: signup → welcome → name → promise → intake → movement commitment → the-lab → first check-in → dashboard.

**Files:**
/app/welcome/page.tsx (post-signup welcome)
/app/onboarding/name/page.tsx (ACTIVE - collect name)
/app/onboarding/promise/page.tsx (ACTIVE - commitment prompt)
/app/onboarding/intake/page.tsx (ACTIVE - user info collection)
/app/onboarding/setup/movement-commitment/page.tsx (ACTIVE - sets hasCommitment)
/app/onboarding/setup/the-lab/page.tsx (ACTIVE - education about Lab)
/app/onboarding/setup/rewards/page.tsx (DEPRECATED - replaced by the-lab)
/app/onboarding/activate/checkin/page.tsx (ACTIVE - first check-in)

**Dependencies:**
→ Auth (requires authenticated user)
→ Firestore (writes user data, hasCommitment, firstCheckinDate, commitment object)
→ Momentum (first check-in calls writeDailyMomentum)

Dependents (used by):

← Signup (redirects to /welcome)
← Layout (gate redirects to /not-started if hasCommitment false)
← Dashboard (first visit after onboarding completion)

**Known Issues:**
Dead field writes (activate/checkin page): Writes firstCheckInAt and isActivated during first check-in (never read)
Deprecated page exists (setup/rewards): File exists but flow uses setup/the-lab instead
Three-location commitment write (movement-commitment page): Writes to commitment object, profile/plan, and currentFocus (technical debt, documented)

**Dead Code Suspected:**
/app/onboarding/setup/rewards/page.tsx (replaced by the-lab)
Writes to firstCheckInAt and isActivated in first check-in
Any references to "rewards" terminology in onboarding copy

Additional observations:

Flow is linear (no branching/skipping)
Each step writes specific data to Firestore
Movement commitment is the critical gate (sets hasCommitment: true)
First check-in is separate from daily check-in (different page, hardcoded accountAgeDays: 1)

Canon Risk:

TRUST RISK (minor): Dead field writes confuse data model
No truth or brand voice violations in flow

---

## CROSS-SYSTEM CONCERNS

### Data Fields (Multi-System)
**Suspected dead/deprecated:**
- `firstCheckInAt` (top-level) - written, never read
- `isActivated` - written, not used in gates
- `streakSavers` - feature cut, field remains
- Habit stacking fields (multiple systems)

### Naming Inconsistencies
- `currentStreak` should be `consecutiveDays`
- `lifetimeStreak` should be `maxConsecutiveDays`

### Authority Conflicts
- Momentum ramp caps defined in 2 places
- Date calculations scattered across files

Legacy Routes (Confirmed Dead)
Outside main app, marked for deletion:

/app/plan/page.tsx
/app/plan-overview/page.tsx
/app/program/page.tsx
/app/walk/page.tsx (imported in dashboard but unused)
/app/workout/[day]/page.tsx
/app/summary/page.tsx
/app/intake/page.tsx (NOT the onboarding one - different path)

Action: Delete in cleanup phase

---

## FIX PRIORITY (PRELIMINARY)
1. **CRITICAL:** Momentum truth issues
2. **HIGH:** Learn gate enforcement
3. **MEDIUM:** Dead code removal
4. **LOW:** Naming consistency

---

## NEXT STEPS
After triage complete:
1. Deep audit systems marked REPAIR or BROKEN
2. Plan fixes in dependency order
3. Delete DEPRECATED systems first (no dependencies)
```