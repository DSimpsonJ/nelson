**NELSON**

App Store Launch Plan

*Owner: DJ Simpson  |  Target: Late May 2026  |  Last Updated: March 20, 2026*

# **The Finish Line**

App Store approved. Founding Members can purchase via IAP. Revenue flows cleanly through a real business entity. No compliance landmines.

*Not **'**something is in the store.**'** Not **'**technically works in TestFlight.**'** Approved, live, chargeable, clean.*

# **V1 Scope (Locked)**

**Ships with App Store Submission**

- Auth + commitment gate

- Full onboarding flow

- Daily check-in (native feel, fast)

- Dashboard (momentum, coaching card, Learn entry)

- Weekly coaching view

- The Lab — full history, all months back to signup, forward/back month navigation

- Weight integration into coaching prompts

- Founding Members IAP ($60/year, available for 90 days post-launch — price lock for life as long as subscription active) ⚠️ Revisit exact end date before launch

- Standard pricing: $99/year or $9/month

- Push notifications — daily check-in reminder only

- Privacy policy + Terms of Service (linked in-app)

- Account deletion (required by Apple)

- Support contact

- Welcome video (ships if ready; deferred to V1.1 if not)

**Explicitly Deferred — Not in V1**

- Advanced Lab analytics (trend overlays, multi-month visualizations)

- Ask Nelson (daily Q&A)

- Accountability partner feature

- Community features

- Android

- Stripe web purchase channel (add post-launch)

- Legal entity trademark filing

**This list is locked. When you get the urge to add something to V1, read this list first.**

# **Phases**

## **Phase 0: Set Foundations**

*Feb 24 – Mar 2, 2026 (1 week)*

**Status: ✅ Complete**

Lock the scope. Make the business decisions that unblock everything else.

- ✅ Lock App Store V1 scope contract

- ✅ Confirm NativeWind as styling approach

- ✅ Confirm Expo Router as navigation approach

- ✅ Decide entity: Simpson Holdings LLC, Maryland

- ✅ Confirm domain and business email

- ✅ Apple Developer Program: wait for LLC, enroll under entity

## **Phase 1: Entity + Compliance Draft + Web Cleanups**

*Mar 3 – Mar 22, 2026*

**Status: ✅ Complete**

Get the business real. Get compliance documents drafted. Close web app gaps.

**Business**

- ✅ File LLC — Simpson Holdings LLC via Northwest Registered Agent, Maryland

- ✅ Get EIN

- ✅ Open Mercury business bank account

- ✅ Set up business email — privacy@, support@, dj@thenelson.app

- ✅ Separate all Nelson expenses from personal

- [ ] Set up Wave bookkeeping (free, connect Mercury — 10 minutes)

- [ ] Enroll in Apple Developer Program under entity ($99) — pending DUNS approval ~March 23

**Compliance**

- ✅ Privacy policy — live at thenelson.app/privacy

- ✅ Terms of Use — live at thenelson.app/terms

- ✅ Support email active — support@thenelson.app

- ✅ Support page live — thenelson.app/support

- ✅ Section 15 (dispute resolution) — filled March 20, 2026. Simple arbitration clause, Maryland governing law, AAA, small claims carveout, class action waiver.

**Web App Cleanup**

- ✅ Dead code removal — Pass 1 complete (1,851 → 1,235 lines)

- ✅ Admin SDK audit complete

- ✅ Learn gate closed

- ✅ All dead event types, dead state, dead imports removed

**Exit Criteria: All met except Apple Developer enrollment (unblocks March 23).**

## **Phase 2: Backend Hardening**

*Mar 3 – Mar 18, 2026*

**Status: ✅ Complete**

Make the backend safe for real users and real money.

**Security**

- ✅ save-weekly-calibration auth fix — ID token verification, email ownership check

- ✅ Admin SDK migration — all routes, all collections

- ✅ Firestore security rules — request.auth == null clauses removed

**Account Deletion Pipeline**

- ✅ Server-side deletion endpoint (authenticated, user-triggered)

- ✅ Deletes Firebase Auth account + all Firestore subcollections

- ✅ Switched to adminDb.recursiveDelete() — handles 500+ doc subcollections

- ✅ In-app deletion trigger with two-step confirmation

- ✅ Tested end-to-end — 2 accounts fully deleted and confirmed

**Coaching Pipeline**

- ✅ Weight integration — reads users/{email}.weight, passes to buildScopedSystemPrompt

- ✅ Weight language validator — banned phrases enforced

- ✅ momentum_plateau coaching fix — celebration word list expanded

- ✅ Cron sequential execution — 1,500ms delay between users (concurrent caused rate limit errors at 18+ users)

**Momentum Unification — Completed March 18**

- ✅ Web check-in now routes through /api/submit-checkin (same as mobile)

- ✅ Onboarding check-in routes through /api/submit-checkin — behavior name IDs fixed

- ✅ writeDailyMomentum.ts removed from all active call paths (dead code, not deleted yet)

- ✅ momentumTrend and visualState now written correctly on all check-in docs

- ✅ previousMomentum baseline fixed after gap days

- ✅ not-great rating string standardized (hyphen) across web and mobile

**Marketing**

- ✅ @TheNelsonApp on Instagram and TikTok

- ✅ Content strategy and pre-launch cadence defined

- ✅ Launch week plan documented (NELSON_LAUNCH_WEEK_PLAN.md)

- [ ] Identify distribution channels beyond social (newsletters, communities, podcasts)

**Exit Criteria: All met.**

## **Phase 3: Native App Build**

*Mar 3 – Mar 18, 2026*

**Status: ✅ Complete**

Build the iOS app in Expo. Every screen. Real data. Feels like a native app.

**Auth + Onboarding**

- ✅ Login, signup screens

- ✅ Full onboarding flow (10+ screens)

- ✅ hasCommitment gate — redirect to not-started if false

- ✅ Auth persistence (AsyncStorage)

**Check-In**

- ✅ 8-question check-in flow (exercise + 7 behavior ratings)

- ✅ Optional note field

- ✅ Gap detection before submission — architectural contract met

- ✅ Gap reconciliation — built March 18, confirmed working March 19, 2026

- ✅ Routes through /api/submit-checkin (server-side momentum, unified with web)

- ✅ Success/celebration screen with reward-aware animations

**Dashboard**

- ✅ Momentum score + animated card

- ✅ Trend indicator

- ✅ Coaching card (CoachAccess equivalent)

- ✅ Learn entry point with blue dot for unread

- ✅ Check-in CTA if not yet checked in

- ✅ Weight card with update modal

**Weekly Coaching View**

- ✅ Current week coaching output (pattern, tension, why it matters, progression)

- ✅ Historical weeks — up to 4 previous, collapsible cards

- ✅ Calibration flow with safety modal

- ✅ Correct handling of insufficient_data and stabilize progression states

**The Lab**

- ✅ 30-day momentum trend SVG chart

- ✅ Stats (days observed, check-ins, missed, streaks)

- ✅ Behavior distribution table (3+ check-in guard)

- ✅ Calendar with month navigation and day detail modal

**Learn**

- ✅ Article list with drip eligibility

- ✅ Article detail with read state tracking

- ✅ Blue dot clears when all eligible articles are read

**Settings**

- ✅ Sign out

- ✅ Account deletion (two-step confirm)

- ✅ Privacy policy + ToS links

- ✅ Support contact

- ✅ Daily check-in reminder toggle (writes notificationsEnabled — scheduling deferred to Phase 4)

**Canon Audit**

- ✅ All user-facing copy reviewed — no motivational language, no streak identity

- ✅ Runs without crashes on physical device (iPhone 11, iOS 18.5)

**Exit Criteria: All met. Phase 3 complete approximately 6 weeks ahead of original schedule.**

## **Phase 4: IAP + Notifications + TestFlight**

*Mar 23 – Apr 18, 2026 (4 weeks)*

**Status: 🔄 In Progress**

Gated on Apple Developer enrollment under Simpson Holdings LLC. DUNS expected early week of March 23.

**Week 1 (Mar 23–29): Apple Developer + IAP Setup**

First task on March 23: enroll in Apple Developer Program ($99). Do not wait.

- [ ] Enroll in Apple Developer Program under Simpson Holdings LLC

- [ ] Update Xcode code signing from personal Apple ID to entity

- [ ] Create Founding Members product in App Store Connect ($60/year auto-renewing)

- [ ] Implement StoreKit purchase flow (react-native-purchases recommended over expo-in-app-purchases)

- [ ] Build server-side receipt validation endpoint

- [ ] Write entitlement to Firestore on validated receipt (users/{email}.isSubscriber or similar)

- [ ] Handle renewal events from Apple

- [ ] Handle cancellation/expiry

- ✅ Build paywall screen — built March 20, 2026. Hard gate, no dismiss. Founding Members pricing displayed. Subscribe and Restore buttons placeholder until StoreKit wired.

- [ ] Restore purchases flow (required by Apple — reviewers check for this) — placeholder exists, wire to StoreKit

- [ ] Test full purchase flow in sandbox (IAP sandbox is always flaky — budget extra time)

- [ ] Backfill trialStartDate for existing alpha users in Firestore before TestFlight invites go out — accounts with no trialStartDate hit the paywall immediately on first launch

**Week 2 (Mar 30 – Apr 5): Notifications**

- ✅ Install and configure expo-notifications — done March 20, 2026

- [ ] Configure APNs in Apple Developer account — blocked until enrollment

- ✅ Notification permission prompt on first dashboard load (hasSeenNotificationPrompt guard) — built March 20, 2026

- ✅ Wire notificationsEnabled Firestore field to actual local notification scheduling — done March 20, 2026

- ✅ Daily check-in reminder — user picks preferred time, 7 rotating messages scheduled weekly — done March 20, 2026

- [ ] Test APNs remote push delivery on real device — blocked until Apple Developer enrollment

- [ ] Replace local notification scheduling with server-side APNs push (enables notification suppression post-check-in)

- ✅ Copy: 7 Canon-compliant rotating messages locked — no motivational language

**Week 3 (Apr 6–12): TestFlight**

- [ ] Build and upload to TestFlight

- [ ] Invite current shadow alpha users

- [ ] Fix real-device bugs — there will be some

- [ ] Performance: check-in submission < 2 seconds, dashboard load < 1 second

- [ ] Offline behavior: what happens when network fails mid-check-in? (at minimum: don't lose data)

- [ ] Fix anything that blocks the core loop

**Week 4 (Apr 13–18): Buffer + Phase 4 Cleanup**

- [ ] Gap reconciliation end-to-end QA (test March 19, fix any issues found)

- [ ] Monday cron QA — verify March 23 run succeeds for all users

- [ ] writeDailyMomentum.ts — retained as reference (not called anywhere). Do not delete.

- ✅ Section 15 (dispute resolution) filled — done March 20, 2026

- [ ] Bookkeeping setup — Wave free tier no longer supports bank sync. Use spreadsheet until first revenue, then engage CPA for system recommendation.

**Exit Criteria:**

- Sandbox IAP purchase works end-to-end

- Entitlement persists after app restart

- Notifications deliver on real device

- Shadow alpha users have completed the core loop on TestFlight

- No Sev 1 bugs in check-in, dashboard, or coaching

## **Phase 5: Release Candidate + Submission**

*Apr 21 – May 9, 2026 (3 weeks)*

**Status: ⬜ Not Started**

**Week 1 (Apr 21–27): Release Candidate**

- [ ] Feature freeze — bug fixes only from this point

- [ ] Final Canon audit: every piece of user-facing copy. Kill anything motivational, judgmental, or streak-worshippy.

- [ ] App Store assets: screenshots (required iPhone sizes), app icon finalized

- [ ] App Store listing copy: name, subtitle, description, keywords, support URL, privacy URL

- [ ] App Privacy disclosures in App Store Connect (data types, usage, tracking — be accurate)

- [ ] Crash reporting configured (Sentry or similar, privacy-aligned)

- [ ] Final deletion flow test

- [ ] Final IAP sandbox test

**Week 2 (Apr 28 – May 4): Submission**

- [ ] Submit to App Review

- [ ] Monitor review status daily

**Common first-time rejections to watch for:**

- Missing account deletion (make it obvious in Settings)

- Privacy policy URL not accessible (test the link from App Store Connect)

- IAP restore purchases not implemented

- Metadata mismatch (screenshots don't match the app)

- [ ] If rejected: fix, rebuild, resubmit — budget 3–5 days per cycle

**Week 3 (May 5–9): Buffer / Resubmit if Needed**

- [ ] Respond to any App Review rejection within 24 hours

- [ ] Fix, rebuild, resubmit

- [ ] Target App Store approval by May 9, 2026

**Exit Criteria:**

- App Store approved

- Founding Members can purchase

- Revenue flows to Mercury business bank account

*When App Store approval lands, execute NELSON_LAUNCH_WEEK_PLAN.md. Target launch day: Tuesday.*

# **Risks and Mitigations**

| **Risk** | **Likelihood / Impact** | **Mitigation** |
| --- | --- | --- |
| IAP sandbox testing is flaky | High / Low | Always is. Build extra time into Week 1 of Phase 4. |
| App Review rejection (round 1) | Medium / Medium | Buffer in Phase 5. Fix fast, resubmit. Common rejections documented above. |
| Scope creep | Very High / Very High | Re-read the V1 list every week. |
| DUNS delayed past March 23 | Low / High | Check status daily at developer.apple.com/enroll/duns-lookup. Enroll same day it arrives. |
| Cron times out at scale (50+ users) | Medium / Medium | Currently sequential with 1,500ms delay. At 50+ users, revisit batched parallelization. |
| Gap reconciliation bug surfaces post-TestFlight | Medium / Medium | End-to-end test March 19. Fix before TestFlight invite goes out. |
| Monday cron fails first full run (March 23) | Low / Medium | Run python3 scripts/run-coaching.sh manually. Script has retry logic. |
| Section 15 blank flagged by App Review | RESOLVED | Filled March 20, 2026. |
| Existing alpha users hit paywall on first TestFlight launch | High / High | Backfill trialStartDate in Firestore for all alpha users before TestFlight invites go out. One-time manual fix per user. |

# **Decisions Locked**

These are made. Not up for re-discussion unless something fundamental changes.

| **Decision** | **Choice** |
| --- | --- |
| Distribution | Expo / React Native |
| Styling | NativeWind |
| Navigation | Expo Router |
| iOS monetization | IAP (StoreKit) from day one |
| Founding Members pricing | $60/year, available 90 days post-launch, price lock for life. ⚠️ Revisit exact end date before launch. |
| Web monetization | Stripe post-launch |
| Notifications V1 | Daily check-in reminder only |
| Lab/history | Full history in V1, advanced analytics deferred |
| Ask Nelson | Deferred post-launch |
| Entity | Simpson Holdings LLC, Maryland |
| Momentum implementation | Single API path (/api/submit-checkin) — web, mobile, future Android |
| IAP library | react-native-purchases (preferred over expo-in-app-purchases) |
| Trial period | 14 days from first check-in. trialStartDate written by /api/submit-checkin on isFirstCheckin. Hard gate after expiry — no dismiss. |

# **What Good Looks Like at Each Milestone**

**End of Phase 1 (Mar 22): **An LLC exists. It has a bank account. Apple Developer enrollment pending DUNS. The web app has no dead code.

**End of Phase 2 (Mar 18): **You could show this app to a security-conscious investor and not be embarrassed. Coaching works. Deletion works. Momentum is unified across web and mobile.

**End of Phase 3 (Mar 18): **You can hand your phone to a stranger, they sign up, commit, check in, and see their momentum. It feels like an app, not a website.

**End of Phase 4 (Apr 18): **Shadow alpha users are on TestFlight. One has completed a sandbox purchase. Notifications are landing.

**End of Phase 5 (May 9): **App Store approved. You can charge real money. Nelson is a real product.

# **Weekly Review Protocol**

Every Monday, before starting work:

- Open this document

- Check last week's exit criteria — did you hit them?

- If behind: what specifically is blocking you? Name it.

- Update status indicators (✅ done, ⚠️ at risk, 🔄 in progress, ⬜ not started)

- Note anything that needs to go into the System Brief or Mobile Build Reference

**Questions to ask every week:**

- Am I adding scope to V1? (Stop. Re-read the Explicitly Deferred list.)

- Is any phase running more than 1 week behind? (Flag it here, not later.)

- Has anything changed that needs to go into the System Brief?

**Next review: Monday, March 23, 2026 — first day DUNS expected. Enroll in Apple Developer same day.**