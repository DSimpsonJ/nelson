# NELSON — APP STORE LAUNCH PLAN
**Created:** February 24, 2026
**Target:** App Store approval + Founding Members live via IAP
**Deadline:** Late June 2026
**Owner:** DJ Simpson

---

> This is a living document. Review it every Monday.
> Mark items complete with ✅. Mark items at risk with ⚠️.
> If a phase is running behind, flag it here — don't pretend it isn't.

---

## THE FINISH LINE

**App Store approved. Founding Members can purchase via IAP. Revenue flows cleanly through a real business entity. No compliance landmines.**

Not "something is in the store." Not "technically works in TestFlight." Approved, live, chargeable, clean.

---

## WHAT IS AND IS NOT IN V1

### In V1 (ships with App Store submission)
- Auth + commitment gate
- Full onboarding flow
- Daily check-in (native feel, fast)
- Dashboard (momentum, coaching card, Learn entry)
- Weekly coaching view
- The Lab — full history, all months back to signup, forward/back month navigation
- Weight integration into coaching prompts
- Welcome video (conditional — ships if ready before Phase 3 ends; deferred to V1.1 if not)
- Founding Members IAP ($60/year)
- Push notifications — daily check-in reminder only
- Privacy policy + Terms of Service (linked in-app)
- Account deletion (required by Apple)
- Support contact

### Explicitly Deferred (not in V1)
- Advanced Lab analytics (trend overlays, multi-month pattern visualizations)
- Ask Nelson (daily Q&A)
- Accountability partner feature
- Community features
- Android
- Stripe web purchase channel (add post-launch)
- Legal entity trademark filing

**This list is locked. When you get the urge to add something to V1, read this list first.**

---

## WORKSTREAMS

Five parallel tracks. Not all are active at the same time.

1. **Native App** — Expo / React Native build
2. **Backend + Security** — Admin SDK, rules, deletion pipeline
3. **Monetization** — IAP, receipts, entitlements
4. **Compliance** — Privacy policy, ToS, disclosures, support
5. **Business** — Entity, banking, accounting, Apple Developer enrollment

---

## PHASE 0: SET FOUNDATIONS
**Feb 24 – Mar 2 (1 week)**
**Status:** ✅ Complete

### Goals
Lock the scope. Make the business decisions that unblock everything else. Don't start building yet.

### Product
- ✅ Lock App Store V1 scope contract (this document — done when you sign off on the "In V1" list above)
- ✅ Confirm NativeWind as styling approach (Tailwind syntax for React Native)
- ✅ Confirm Expo Router as navigation approach
- ✅ Identify which services in `/app/services/` are pure logic (portable) vs UI-dependent (rebuild)

### Business
- ✅ Decide entity name — **Simpson Holdings LLC**
- ✅ Decide state of formation — **Maryland**
- ✅ Confirm domain and business email — **thenelson.app + startnelson.com purchased, thenelson.app pointed to Vercel. Business email pending LLC approval.**
- ✅ Apple Developer Program — **wait for LLC approval, enroll under Simpson Holdings LLC directly**

### Exit Criteria
- ✅ V1 scope is locked and this document exists in the project folder
- ✅ Entity name decided, formation path chosen
- ✅ No native code written yet

---

## PHASE 1: ENTITY + COMPLIANCE DRAFT + WEB CLEANUPS
**Mar 3 – Mar 14 (2 weeks)**
**Status:** 🔄 In progress — blocking on EIN

### Goals
Get the business real. Get compliance documents drafted. Close the web app gaps that will cause parity problems in Expo.

### Business Build
- ✅ File LLC — Simpson Holdings LLC filed Feb 26 via Northwest Registered Agent, Maryland
- ✅ Get EIN (free, online, 10 minutes at IRS.gov — do immediately when LLC approval arrives)
- ✅ Open business bank account (Mercury)
- [ ] Set up bookkeeping (Wave is free and sufficient for now)
- [ ] Enroll in Apple Developer Program under entity ($99/year) — do this as soon as EIN exists
- ✅ Separate all Nelson expenses from personal immediately
- ✅ Set up business email — privacy@, support@, dj@thenelson.app (Google Workspace, $6/month)

### Compliance
- ✅ Draft privacy policy — Termly draft complete, live at thenelson.app/privacy
- ✅ Draft Terms of Use — complete Feb 28, placeholders filled.

### Product (Web)
- ✅ Close Learn gate
- ✅ Remove `streak_saver` from type unions (habitEvents.ts, checkLevelUpEligibility.ts, writeDailyMomentum.ts)
- ✅ Remove dead event types from habitEvents.ts (streak_saver_earned, streak_saver_used)
- ✅ Remove dead code: `firstCheckInAt` comment corrected, `isActivated` removed from dashboard (all 6 references)
- ✅ Delete deprecated files — legacy routes and rewards onboarding page already gone
- ✅ Clean up messagingGuide.ts — orphaned constants and dead comment blocks removed
- ✅ Admin SDK audit complete — surface area documented (3 routes, 4 collections, 1 service file)
- ✅ Weekly alpha newsletter sent (Feb 27)
- ✅ Dashboard dead code cleanup — Pass 1 complete Feb 28 (1,851 → 1,235 lines, zero errors)

### Exit Criteria
- ✅ Privacy policy live at thenelson.app/privacy
- ✅ Terms of Use draft complete
- ✅ Web app dead code cleaned up (Pass 1)
- ✅ Learn gate closed
- ✅ LLC approved, EIN in hand
- ✅ Business bank account open
- [ ] Apple Developer Program enrolled under entity

---

## PHASE 2: BACKEND HARDENING
**Mar 17 – Apr 10 (4 weeks)**
**Status:** ✅ Complete — Admin SDK migration complete, weight integration + deletion pipeline remaining

### Goals
Make the backend safe for real users and real money. Lock monetization model. Lay marketing foundation. This is non-negotiable before public launch.

### ⚠️ FIRST TASK — `save-weekly-calibration` Auth Fix
**Do this before anything else in Phase 2. It's a 20-minute fix.**

At 13+ active users, `POST /api/save-weekly-calibration` accepts any email with no ownership check. Anyone who knows another user's email can overwrite their calibration data. This is the highest-priority security gap in the current system.

- ✅ Add Firebase ID token verification to `/app/api/save-weekly-calibration/route.ts`
- ✅ Verify token's `email` claim matches the `email` in the request body — reject if mismatch
- ✅ Test: valid user can save their own calibration, mismatched email returns 403
- ✅ Deploy

**Estimated effort:** ~20 minutes. No service layer changes needed.

### Admin SDK Migration
**Context from Feb 27 audit:** Three routes, four Firestore collections, one service file.

Collections touched:
- `users` (top-level) — read by cron orchestrator
- `users/{email}/momentum/{date}` — read by coaching generation (4 queries)
- `users/{email}/weeklySummaries/{weekId}` — write by coaching generation
- `users/{email}/weeklyCalibrations/{weekId}` — read/write by calibration service

Files that need migration:
- `/app/api/generate-weekly-coaching/route.ts`
- `/app/api/cron/generate-weekly-coaching/route.ts`
- `/app/api/save-weekly-calibration/route.ts`
- `/app/services/weeklyCalibration.ts` (owns the calibration read/write — migrates with the route)

Cron runs sequentially with 1500ms delay between users — intentional, rate limit mitigation.

Tasks:
- ✅ Create `/app/firebase/admin.ts` (server-only Admin SDK initialization)
- ✅ Migrate `/app/api/generate-weekly-coaching/route.ts` to Admin SDK
- ✅ Migrate `/app/api/cron/generate-weekly-coaching/route.ts` to Admin SDK
  (Note: loop changed to sequential with 1500ms delay March 16 -- concurrent execution caused Anthropic rate limit errors at 18+ users. Parallelization reversed.)
- ✅ Migrate `/app/api/save-weekly-calibration/route.ts` to Admin SDK
- ✅ Migrate `/app/services/weeklyCalibration.ts` reads/writes to Admin SDK
- ✅ Rewrite Firestore security rules — remove all `|| request.auth == null` clauses
- ✅ Test end-to-end: coaching generation still works, cron still fires correctly
- ✅ Verify dev tools still work after migration

### Dashboard Deep Cleanup
✅ Pass 1 complete Feb 28 — 616 lines removed, all imports clean, no errors.
Remaining items for Phase 2 alongside Admin SDK work:
- ✅  Remove remaining dead code blocks from `app/(app)/dashboard/page.tsx`:
- ✅ `unsubSessions` realtime listener (dead — does nothing with data)
- ✅ - [ ] Feature-flag dev tools already done — `process.env.NODE_ENV === 'development'` in place 
- ✅ Remove dead imports: onSnapshot, subDays, withFirestoreError, limit, writeDailyMomentum, resolveReward/RewardPayload
- ✅ primaryHabitHit, stackedHabitsCompleted, totalStackedHabits — already removed (prior session)
- ✅ moved, hydrated, slept, nutritionScore — already removed (prior session)
- ✅ Remove dead state: recentCheckins, commitmentStage, commitmentReason, saving, consistencyPercentage
- ✅ Remove dead calculateConsistency function
- ✅ Remove all console.logs and console.counts from dashboard
- ✅ Remove commented-out workout integration block

### Account Deletion Pipeline
- ✅ Build server-side deletion endpoint (authenticated, user-triggered)
- ✅ Delete Firebase Auth account
- ✅ Delete or anonymize all Firestore subcollections: `momentum`, `weeklySummaries`, 
      `metadata`, `weightHistory`, `sessions`, `coachingProfile`, `weeklyCalibrations`
      (note: `profile`, `checkins`, `weeklyStats`, `insights` not found in codebase — skipped)
- ⚠️ Handle partial failure gracefully — errors are logged, no retry logic. 
      Acceptable for alpha. Revisit before public launch.
- ✅ Build in-app deletion trigger (settings page, confirmation flow)
- ✅ Test full deletion flow end-to-end (2 accounts fully deleted, confirmed in Firebase console)
```

### Compliance (Finish)
- ✅ Terms of Use draft complete (Feb 28) — placeholders to fill: effective date, support email, business address, privacy policy URL, attorney review date, Section 15 dispute resolution
- ✅ Publish Terms of Use to live URL (same pattern as privacy policy — simple page at thenelson.app/terms)
- ✅ Set up support email — forward to personal is fine for now ✅ (support@thenelson.app created)
- ✅ Build minimal support page or FAQ — live at thenelson.app/support

- ✅ Momentum subcollection could exceed 500 docs at ~1.5 years of daily check-ins. Swap to adminDb.recursiveDelete() before public launch.

### Monetization Strategy (Dedicated Session)
Decide this before building IAP in Phase 4. The decision affects what gets built.

- ✅ Decide free vs. paid model — 14-day free trial → paid
- ✅ Confirm Founding Members pricing — $60/year, first 50, price lock lost on cancellation
- ✅ Standard pricing — $99/year or $9/month

### Marketing Strategy (Dedicated Session)
Build the audience before the app ships. You need people ready to download on launch day.

- ✅ Create @TheNelsonApp on Instagram (Mar 1)
- ✅ Create @TheNelsonApp on TikTok (Mar 1)
- ✅ Define content strategy
- ✅ Define pre-launch content cadence
- ✅ Define launch week plan — what happens the week the app goes live?
- [ ] Identify potential early distribution channels beyond social (newsletters, communities, podcasts)
- ✅ Decide whether to build a waitlist or landing page at thenelson.app before launch

### Start Expo Scaffolding (Week 3 of this phase — parallel track)
Don't wait for Phase 2 to finish. Start Expo setup while security work is happening.
- ✅ Initialize Expo project (`npx create-expo-app nelson-mobile`)
- ✅ Configure Expo Router (file-based routing)
- ✅ Install and configure NativeWind (Tailwind for React Native)
- ✅ Install Firebase SDK for React Native (different package than web — `@react-native-firebase` or `firebase` with React Native compatibility)
- ✅ Get a single screen rendering on a real device via Expo Go
- ✅ Configure environment variables for Expo (Firebase config, API keys)

### Exit Criteria
- ✅ save-weekly-calibration` auth fix deployed (first)
- ✅ Admin SDK migration complete, `request.auth == null` rules removed
- ✅ ashboard deep cleanup complete
- ✅  Account deletion works end-to-end
- ✅ Terms of Use live at public URL
- ✅ Support contact active 
- ✅ Monetization model decided and documented
- Marketing strategy defined, content cadence started
- ✅ Expo project initializes and renders on device

---

## PHASE 3: NATIVE APP BUILD
**Apr 14 – May 22 (6 weeks)**
**Status:** ✅  Complete

### Goals
Build the iOS app in Expo. Every screen. Real data. Feels like a native app.

### Week 1-2: Auth + Onboarding
- ✅  Login screen (email/password)
- ✅  Signup screen
- ✅ Onboarding flow (all 19 screens — mirror web app logic, rebuild UI natively)
- ✅ Movement commitment selection
- ✅ `hasCommitment` gate — redirect to not-started if false
- ✅ Auth persistence (AsyncStorage)

### Week 3: Check-In
- ✅ 8-question check-in flow
- ✅ 7 behavior ratings (Elite / Solid / Not Great / Off)
- ✅ Exercise completion (Yes / No)
- ✅  Optional note
- ✅ Gap detection before submission (calls `missedCheckIns` service)
- ✅ Calls `writeDailyMomentum` on submission - *via /api/submit-checkin (server-side equivalent)
- ✅  Success state (no motivational language — Canon)
- ✅ Already checked in today state

### Dashboard (Week 4-5)
- ✅ Momentum score display
- ✅ Trend indicator
- ✅ Coaching card (`CoachAccess` equivalent)
- ✅  Learn entry point (blue dot if unread)
- ✅ Check-in CTA if not yet checked in today
- ✅ Weight card

### Weekly Coaching View (Week 5-6)
- ✅  Display current week's coaching output
- ✅  Pattern, tension, why it matters, progression
- ✅  Correct handling of `insufficient_data` state (no coaching generated)
- ✅  Correct handling of `stabilize` progression

### Learn Section (Week 6-7)
- ✅  Article list with drip eligibility (calls `learnService`)
- ✅  Article detail view (marks as read via `arrayUnion`)
- ✅  Blue dot clears when all eligible articles are read

### Navigation
- ✅  Bottom tab navigation: Dashboard, The Lab, Learn, Settings
- ✅  Settings screen: account info, account deletion, support link, privacy policy link, ToS link

### Exit Criteria
- ✅  All V1 screens built and navigable
- ✅  Data round-trips correctly to Firestore
- ✅  Gap detection works on device
- ✅ Coaching displays correctly
- ✅  No motivational language anywhere (Canon audit)
- ✅  Runs without crashes on a real iPhone

---

## PHASE 4: IAP + NOTIFICATIONS + TESTFLIGHT
**May 26 – Jun 12 (3 weeks)**
**Status:** ⬜ Not started

### Weight Integration into Coaching Prompts (NOTE: This was originally phase 2, it was punted.)
- ✅ Read `weight` field from `users/{email}` in coaching prompt builder
- ✅ Pass weight as context to `buildScopedSystemPrompt.ts`
- ✅ Verify coaching output references weight appropriately (protein targets, etc.)
- ✅ Test with real user data

### Week 1: IAP
- [ ] Create Founding Members product in App Store Connect ($60/year auto-renewing subscription)
- [ ] Implement StoreKit purchase flow in Expo (`expo-in-app-purchases` or `react-native-purchases`)
- [ ] Build server-side receipt validation endpoint
- [ ] Write entitlement to Firestore on validated receipt
- [ ] Handle renewal events from Apple
- [ ] Handle cancellation/expiry
- [ ] Build paywall screen (shown to non-subscribers)
- [ ] Test full purchase flow in sandbox
- [ ] Restore purchases flow (required by Apple)

### Week 2: Notifications
- [ ] Install and configure `expo-notifications`
- [ ] Configure APNs in Apple Developer account
- [ ] Request notification permission at appropriate moment in onboarding (not on launch)
- [ ] Daily check-in reminder — user sets preferred time window, fires once daily
- [ ] Test delivery on real device (not simulator — push doesn't work in simulator)
- [ ] Respect Canon: reminder is factual ("Time to check in"), never motivational

### Items Deferred from previous phases requiring attention:
- [ ] Remove dead momentum fields from writeDailyMomentum.ts interface and defaults:
- [ ] streakSavers — confirmed dead (written but never read outside writeDailyMomentum.ts and missedCheckIns.ts). Defer to next writeDailyMomentum touch. Locked file — do not open without a reason.
- [ ] Engage startup attorney for document review — flat-fee review of Privacy Policy + Terms of Use before public launch. Budget $200-400. Priority: health behavior disclaimer, limitation of liability, dispute resolution clause (Section 15 intentionally left blank for attorney).

### Week 3: TestFlight
- [ ] Build and upload to TestFlight
- [ ] Invite current shadow alpha users
- [ ] Fix real-device bugs — there will be some
- [ ] Performance check: check-in submission < 2 seconds, dashboard load < 1 second
- [ ] Offline behavior: what happens when network fails mid-check-in? (at minimum: don't lose data)
- [ ] Fix anything that blocks the core loop

### Exit Criteria
- Sandbox IAP purchase works end-to-end
- Entitlement persists after app restart
- Notifications deliver on real device
- Shadow alpha users have successfully completed the core loop on TestFlight
- No Sev 1 bugs in check-in, dashboard, or coaching

---

## PHASE 5: RELEASE CANDIDATE + SUBMISSION
**Jun 15 – Jun 30 (2 weeks)**
**Status:** ⬜ Not started

### Week 1: Release Candidate
- [ ] Feature freeze — bug fixes only from this point
- [ ] Final Canon audit: read every piece of user-facing copy, kill anything motivational, judgmental, or streak-worshippy
- [ ] App Store assets: screenshots (required sizes for iPhone), app preview if desired, app icon finalized
- [ ] App Store listing copy: name, subtitle, description, keywords, support URL, privacy policy URL
- [ ] Complete App Privacy disclosures in App Store Connect (data types collected, usage, tracking — be accurate)
- [ ] Crash reporting configured (Sentry or similar, privacy-aligned)
- [ ] Final deletion flow test
- [ ] Final IAP sandbox test

### Week 2: Submission + Review
- [ ] Submit to App Review
- [ ] Monitor review status daily
- [ ] Respond to any rejection quickly — common first-time rejections:
  - Missing account deletion (make sure it's obvious)
  - Privacy policy URL not accessible (test the link from App Store Connect)
  - IAP restore purchases not implemented
  - Metadata mismatch (screenshots don't match the app)
- [ ] If rejected: fix, rebuild, resubmit — budget 3-5 days per cycle
- [ ] **Target: App Store approved by June 30, 2026**

### Exit Criteria
- App Store approved ✅
- Founding Members can purchase ✅
- Revenue flows to business bank account ✅

> **When App Store approval lands, execute NELSON_LAUNCH_WEEK_PLAN.md. That document is the operational playbook for the first 7 days. Target launch day: Tuesday.**

---

## WEEKLY REVIEW PROTOCOL

Every Monday, before starting work:

1. Open this document
2. Check last week's exit criteria — did you hit them?
3. If behind: what specifically is blocking you? Name it.
4. Update status indicators (✅ done, ⚠️ at risk, 🔄 in progress, ⬜ not started)
5. Note anything that needs to go into the System Brief

**Questions to ask every week:**
- Am I adding scope to V1? (Stop. Re-read the "Explicitly Deferred" list.)
- Is any phase running more than 1 week behind? (Flag it here, not later.)
- Has anything changed that needs to go into the System Brief?

---

## RISKS AND MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Expo build takes longer than 7 weeks | High | High | Scope is tight but defined. If slipping, cut welcome video first, then advanced Lab analytics. Core loop is non-negotiable. |
| App Review rejection (round 1) | Medium | Medium | Buffer built into Phase 5. Fix fast, resubmit. |
| Admin SDK migration hits unexpected complexity | Medium | High | Audit complete Feb 27. Surface area known: 3 routes, 4 collections, 1 service file. |
| `save-weekly-calibration` exploited before auth fix | Low | Medium | Known trust network at 13 users. Fix is first task in Phase 2. |
| Cron loop times out at scale | Medium | Medium | Sequential execution with 1500ms delay between users. Concurrent execution caused rate limit errors at 18+ users and was reversed March 16. At 50+ users, revisit batched parallelization (e.g. batches of 5 with delay between batches).
| IAP sandbox testing is flaky | High | Low | It's always flaky. Build extra time into Week 1 of Phase 4. |
| Scope creep | Very High | Very High | Re-read the V1 list. Every week. |
| Apple Developer enrollment delayed | Low | High | Do it the day the EIN arrives. Don't wait. |
| Entity formation takes longer than expected | Low | Medium | Filed Feb 26, Maryland processing up to 1 week. |

---

## DECISIONS LOCKED

These are made. They are not up for re-discussion unless something fundamental changes.

| Decision | Choice | Rationale |
|---|---|---|
| Distribution | Expo / React Native | Native feel required for core loop |
| Styling | NativeWind | Tailwind muscle memory, less relearning |
| Navigation | Expo Router | File-based, familiar from Next.js |
| iOS monetization | IAP (StoreKit) from day one | App Review safety, conversion |
| Web monetization | Stripe (post-launch) | Secondary channel, no Apple cut |
| Notifications V1 | Daily check-in reminder only | Simplest, most defensible |
| Lab/history | Full history in V1, advanced analytics deferred | Users need access to all their data from day one |
| Ask Nelson | Deferred post-launch | Too big, too risky for V1 |
| Entity | Simpson Holdings LLC, Maryland | Fundraising optionality, liability protection, home state simplicity |

---

## WHAT GOOD LOOKS LIKE AT EACH MILESTONE

**End of Phase 0 (Mar 2):** You can describe exactly what ships in V1 in two sentences. Entity name is decided.

**End of Phase 1 (Mar 14):** An LLC exists. It has a bank account. Apple Developer enrollment is submitted or complete. The web app has no dead code.

**End of Phase 2 (Apr 10):** You could show this app to a security-conscious investor and not be embarrassed. Coaching still works. Deletion works. Privacy policy is live.

**End of Phase 3 (May 22):** You can hand your phone to a stranger, they can sign up, commit, check in, and see their momentum. It feels like an app, not a website.

**End of Phase 4 (Jun 12):** Your shadow alpha users are using the native app on TestFlight. One of them has completed a sandbox purchase. Notifications are landing.

**End of Phase 5 (Jun 30):** App Store approved. You can charge real money. Nelson is a real product.

---

*Last updated: March 16, 2026*
*Next review: March 17, 2026*