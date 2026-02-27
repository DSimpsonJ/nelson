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
- ✅ Confirm domain and business email — **thenelson.app live and loading. startnelson.com redirects to thenelson.app (308). www.thenelson.app redirect in progress. Business email pending LLC approval.**
- ✅ Apple Developer Program — **wait for LLC approval, enroll under Simpson Holdings LLC directly**

### Exit Criteria
- ✅ V1 scope is locked and this document exists in the project folder
- ✅ Entity name decided, formation path chosen
- ✅ No native code written yet

---

## PHASE 1: ENTITY + COMPLIANCE DRAFT + WEB CLEANUPS
**Mar 3 – Mar 14 (2 weeks)**
**Status:** 🔄 In progress (started early)

### Goals
Get the business real. Get compliance documents drafted. Close the web app gaps that will cause parity problems in Expo.

### Business Build
- 🔄 File LLC — **Simpson Holdings LLC filed Feb 26 via Northwest Registered Agent, Maryland processing (up to 1 week)**
- [ ] Get EIN (free, online, takes 10 minutes at IRS.gov after entity is formed)
- [ ] Open business bank account (Mercury or Relay are solid for startups, no minimums)
- [ ] Set up bookkeeping (Wave is free and sufficient for now; QuickBooks if you want more)
- [ ] Enroll in Apple Developer Program under entity ($99/year) — do this as soon as EIN exists
- [ ] Separate all Nelson expenses from personal immediately

### Compliance
- ✅ Draft privacy policy — **completed in Termly (Feb 26). Covers Firebase, Anthropic API, no ads, push notifications, AI insights.**
- [ ] Draft Terms of Use (lightweight — what the app is, what it isn't, no medical advice disclaimer)
- 🔄 Identify hosting URL — **target: thenelson.app/privacy and thenelson.app/terms. Pages not yet built.**

### Product (Web)
- ✅ Close Learn gate — completed
- [ ] Remove `streak_saver` from any remaining code references (it's out of the data contract — clean it from code too)
- [ ] Remove dead code: `firstCheckInAt` writes, `isActivated` writes
- [ ] Delete deprecated files: `/app/onboarding/setup/rewards/page.tsx`, legacy routes (`/plan`, `/program`, `/walk`, `/workout`, `/summary`, `/plan-overview`, `/intake`)

### Exit Criteria
- Entity exists, EIN in hand
- Business bank account open
- Apple Developer Program enrolled under entity
- Privacy policy draft exists (doesn't need to be published yet)
- Web app dead code cleaned up
- Learn gate closed

---

## PHASE 2: BACKEND HARDENING
**Mar 17 – Apr 10 (4 weeks)**
**Status:** ⬜ Not started

### Goals
Make the backend safe for real users and real money. This is non-negotiable before public launch.

### Weight Integration into Coaching Prompts
- [ ] Read `weight` field from `users/{email}` in coaching prompt builder
- [ ] Pass weight as context to `buildScopedSystemPrompt.ts`
- [ ] Verify coaching output references weight appropriately (protein targets, etc.)
- [ ] Test with real user data

### Admin SDK Migration
- [ ] Audit every API route and document every Firestore collection it touches
- [ ] Create `/app/firebase/admin.ts` (server-only Firebase Admin SDK initialization)
- [ ] Migrate `/app/api/generate-weekly-coaching/route.ts` to Admin SDK
- [ ] Migrate `/app/api/cron/generate-weekly-coaching/route.ts` to Admin SDK
- [ ] Migrate `/app/api/save-weekly-calibration/route.ts` to Admin SDK
- [ ] Rewrite Firestore security rules — remove all `|| request.auth == null` clauses
- [ ] Test end-to-end: coaching generation still works, cron still fires correctly
- [ ] Verify dev tools still work after migration

### Account Deletion Pipeline
- [ ] Build server-side deletion endpoint (authenticated, user-triggered)
- [ ] Delete Firebase Auth account
- [ ] Delete or anonymize all Firestore subcollections: `momentum`, `weeklySummaries`, `metadata`, `profile`, `weightHistory`, `checkins`, `weeklyStats`, `insights`, `sessions`, `coachingProfile`, `weeklyCalibrations`
- [ ] Handle partial failure gracefully (log, retry, don't leave orphan data)
- [ ] Build in-app deletion trigger (settings screen or profile screen — simple button + confirmation)
- [ ] Test full deletion flow end-to-end

### Compliance (Finish)
- [ ] Publish privacy policy to live URL
- [ ] Publish Terms of Use to live URL
- [ ] Set up support email (e.g., support@[yourdomain].com) — forward to personal is fine for now
- [ ] Build minimal support page or FAQ (can be a single web page)

### Start Expo Scaffolding (Week 3 of this phase — parallel track)
Don't wait for Phase 2 to finish. Start Expo setup while security work is happening.
- [ ] Initialize Expo project (`npx create-expo-app nelson-mobile`)
- [ ] Configure Expo Router (file-based routing)
- [ ] Install and configure NativeWind (Tailwind for React Native)
- [ ] Install Firebase SDK for React Native (different package than web — `@react-native-firebase` or `firebase` with React Native compatibility)
- [ ] Get a single screen rendering on a real device via Expo Go
- [ ] Configure environment variables for Expo (Firebase config, API keys)

### Exit Criteria
- Admin SDK migration complete, `request.auth == null` rules removed
- Account deletion works end-to-end
- Privacy policy and ToS live at public URLs
- Support contact active
- Expo project initializes and renders on device

---

## PHASE 3: EXPO MVP BUILD
**Apr 7 – May 22 (7 weeks)**
**Status:** ⬜ Not started

### Goals
Build the core Nelson loop in native. It must feel fast and real — not like a website.

### Services Extraction (Week 1 — do this first)
Before building screens, extract shared logic so you're not duplicating business rules.
- [ ] Create `/packages/core` or `/shared` directory
- [ ] Move pure-logic services: `newtonianMomentum.ts`, key calculation utilities, date helpers
- [ ] Confirm `writeDailyMomentum.ts` can be called from React Native context (Firebase writes are the same)
- [ ] Document which services are portable as-is vs need React Native adaptation

### Auth + Gate (Week 1-2)
- [ ] Firebase Auth sign-in and sign-up screens
- [ ] Auth persistence via AsyncStorage (replaces localStorage)
- [ ] `hasCommitment` gate — same logic as web, different implementation
- [ ] Redirect to commitment flow if not committed
- [ ] Redirect to login if not authenticated

### Onboarding (Week 2-3)
- [ ] Name screen
- [ ] Movement commitment selection (the slider)
- [ ] First check-in
- [ ] Writes `firstCheckinDate` to metadata (same Firestore path as web)
- [ ] Calls `writeDailyMomentum` on first check-in
- [ ] Redirect to dashboard on completion

### Daily Check-In (Week 3-4) — most important screen in the app
- [ ] 7 behavior ratings (Elite / Solid / Not Great / Off)
- [ ] Exercise completion (Yes / No)
- [ ] Optional note
- [ ] Gap detection before submission (calls `missedCheckIns` service)
- [ ] Calls `writeDailyMomentum` on submission
- [ ] Success state (no motivational language — Canon)
- [ ] Already checked in today state

### Dashboard (Week 4-5)
- [ ] Momentum score display
- [ ] Trend indicator
- [ ] Coaching card (`CoachAccess` equivalent)
- [ ] Learn entry point (blue dot if unread)
- [ ] Check-in CTA if not yet checked in today
- [ ] Weight card

### Weekly Coaching View (Week 5-6)
- [ ] Display current week's coaching output
- [ ] Pattern, tension, why it matters, progression
- [ ] Correct handling of `insufficient_data` state (no coaching generated)
- [ ] Correct handling of `stabilize` progression ("you're in the zone" message)

### Learn Section (Week 6-7)
- [ ] Article list with drip eligibility (calls `learnService`)
- [ ] Article detail view (marks as read via `arrayUnion`)
- [ ] Blue dot clears when all eligible articles are read

### Navigation
- [ ] Bottom tab navigation: Dashboard, Check-In, Learn, Settings
- [ ] Settings screen: account info, notification preferences, account deletion, support link, privacy policy link, ToS link

### Exit Criteria
- All V1 screens built and navigable
- Data round-trips correctly to Firestore
- Gap detection works on device
- Coaching displays correctly
- No motivational language anywhere (Canon audit)
- Runs without crashes on a real iPhone

---

## PHASE 4: IAP + NOTIFICATIONS + TESTFLIGHT
**May 26 – Jun 12 (3 weeks)**
**Status:** ⬜ Not started

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

### Week 3: TestFlight
- [ ] Build and upload to TestFlight
- [ ] Invite current shadow alpha users (4-5 people)
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

---

## WEEKLY REVIEW PROTOCOL

Every Monday, before starting work:

1. Open this document
2. Check last week's exit criteria — did you hit them?
3. If behind: what specifically is blocking you? Name it.
4. Update status indicators (✅ done, ⚠️ at risk, 🔄 in progress, ⬜ not started)
5. Note anything that needs to be added to the System Brief

**Questions to ask every week:**
- Am I adding scope to V1? (Stop. Re-read the "Explicitly Deferred" list.)
- Is any phase running more than 1 week behind? (Flag it now, not later.)
- Has anything changed that needs to go into the System Brief?

---

## RISKS AND MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Expo build takes longer than 7 weeks | High | High | Scope is tight but defined. If slipping, cut welcome video first, then advanced Lab analytics. Core loop is non-negotiable. |
| App Review rejection (round 1) | Medium | Medium | Buffer built into Phase 5. Fix fast, resubmit. |
| Admin SDK migration hits unexpected complexity | Medium | High | Start audit in Phase 1, not Phase 2. Know the surface area before you commit to timing. |
| IAP sandbox testing is flaky | High | Low | It's always flaky. Build extra time into Week 1 of Phase 4. |
| Scope creep | Very High | Very High | Re-read the V1 list. Every week. |
| Apple Developer enrollment delayed | Low | High | Do it the day the EIN arrives. Don't wait. |
| Entity formation takes longer than expected | Low | Medium | File online, it's fast in most states. Delaware is 1-2 days. |

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

*Last updated: February 27, 2026*
*Next review: March 2, 2026*