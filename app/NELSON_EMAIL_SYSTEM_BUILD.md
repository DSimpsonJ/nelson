# Nelson Email Migration — Resend → Loops.so

## The Decision
Switch from Resend to Loops.so for all email. Resend is infrastructure — it sends bytes. Loops is a platform — it manages sequences, audiences, broadcasts, and analytics.

## Architecture
```
Mobile app → Your API → Loops event → Loops sends email
```
Adding a new drip email = build a new sequence in Loops UI. Zero code changes. Zero deploys.

### Events to trigger
| Event | Sequence |
|-------|----------|
| `signup` | Welcome |
| `first_checkin` | Day 1 confirmation |
| `day_13` | Pre-paywall warmup |
| `day_14` | Conversion / Founding Members |
| `inactive_3_days` | Re-engagement |
| `password_reset_requested` | Password reset (transactional) |

---

## Phase 1: Setup (30 minutes)
- [ ] Create Loops.so account at loops.so
- [ ] Add `thenelson.app` as sending domain
- [ ] Set sending address to `hello@thenelson.app`
- [ ] Create API key in Loops
- [ ] Add `LOOPS_API_KEY` to `.env.local`
- [ ] Add `LOOPS_API_KEY` to Vercel environment variables
- [ ] Install Loops SDK: `npm install loops`

---

## Phase 2: Audience & Contact Properties (20 minutes)
- [ ] Define contact properties in Loops:
  - `firstName` (string)
  - `accountAgeDays` (number)
  - `isSubscriber` (boolean)
  - `lastCheckinDate` (string, YYYY-MM-DD)
- [ ] Confirm sending domain is verified in Loops dashboard

---

## Phase 3: Replace Resend with Loops in Code (1-2 hours)
- [ ] Delete `app/services/emailService.ts`
- [ ] Create `app/services/loopsService.ts` — Loops API wrapper
- [ ] Update `app/api/send-welcome-email/route.ts` — create contact in Loops + trigger `signup` event
- [ ] Update `app/api/send-password-reset/route.ts` — keep Firebase link generation, trigger `password_reset_requested` event via Loops
- [ ] Update `app/api/cron/send-drip-emails/route.ts` — replace Resend calls with Loops events
- [ ] Remove Resend package: `npm uninstall resend`
- [ ] Remove `RESEND_API_KEY` from `.env.local` and Vercel

---

## Phase 4: Build Email Sequences in Loops UI (1 hour)
- [ ] Welcome sequence — triggered on `signup` event
  - Delay: immediate
  - Content: what Nelson is, what to expect, first check-in CTA
- [ ] Day 1 confirmation — triggered on `first_checkin` event
  - Delay: immediate
  - Content: momentum has started, here's what to expect
- [ ] Pre-paywall sequence — triggered on `day_13` event
  - Delay: immediate
  - Content: "You're almost through the first two weeks"
- [ ] Conversion sequence — triggered on `day_14` event
  - Delay: immediate
  - Content: Founding Members pricing, lock it in
- [ ] Re-engagement sequence — triggered on `inactive_3_days` event
  - Delay: immediate
  - Content: "Nelson is still here. No guilt."
- [ ] Password reset — transactional, triggered on `password_reset_requested` event
  - Delay: immediate
  - Content: branded reset link, expires in 1 hour

---

## Phase 5: Test (30 minutes)
- [ ] Create test account → verify contact appears in Loops audience
- [ ] Trigger `signup` event manually → verify welcome email arrives in inbox (not spam)
- [ ] Trigger `password_reset_requested` event → verify branded email arrives in inbox
- [ ] Trigger `day_13` event manually → verify pre-paywall email arrives
- [ ] Verify Loops shows open/click analytics per email
- [ ] Verify unsubscribe link works

---

## Phase 6: Mobile Build 1.0.2
- [ ] `login.tsx` — trigger Loops `signup` event via API after account creation
- [ ] `login.tsx` — password reset calls `/api/send-password-reset` instead of Firebase directly
- [ ] `checkin.tsx` — offline protection (AsyncStorage + retry button)
- [ ] `settings.tsx` — notification toggle fix (denied state opens iOS Settings)
- [ ] `settings.tsx` — support label updated to "Contact support or report a bug"
- [ ] Verify no TypeScript errors in Cursor before building
- [ ] `eas build --profile production --platform ios`
- [ ] Install via TestFlight — run through core loop
- [ ] `eas submit --platform ios`
- [ ] Create version 1.0.2 in App Store Connect
- [ ] Submit for review

---

## Post-Migration Cleanup
- [ ] Cancel or downgrade Resend account
- [ ] Keep DNS records for `send.thenelson.app` in place (no conflict with Loops)
- [ ] Document Loops API key location in project notes

---

## Notes
- Loops contact = one record per user email. Properties update on each event.
- All email content lives in Loops UI — no code changes needed to edit copy or design.
- Broadcasts (manual sends to full list or segments) are done entirely in Loops UI.
- Re-engagement cron still runs daily but triggers a Loops event instead of calling Resend directly.
- `lastReengagementEmail` field on user doc still needed to prevent duplicate re-engagement sends.