# Nelson Feature Backlog
**Purpose:** Capture post-Phase 3 product ideas before they evaporate. Not scoped. Not scheduled. These inform Phase 5+ and post-launch work. Nothing here ships until the App Store launch is done.

*Last updated: March 19, 2026*

---

## 1. Coaching Memory (Week-Over-Week Continuity)

**The problem:** The coach generates fresh output every Monday based solely on the current week's data. It has no memory of what it said last week, what it suggested, or how the user responded. A good coach remembers.

**What good looks like:** If the coach suggested "try smaller plates for portion control" in Week 4, the Week 5 output might open with a brief callback — "Last week flagged portion control as the constraint. Worth noting whether that shifted." Not every week needs a callback. Only when there's a relevant prior suggestion and the behavior data confirms or contradicts it.

**What's already there:** Every week's coaching output is written to `users/{email}/weeklySummaries/{YYYY-Www}`. The data exists. The coach just never reads it before generating the current week.

**What's needed:**
- Read last week's `weeklySummaries` doc before generating current week prompt
- Pass previous `coaching` object (pattern, tension, progression) into `PromptContext`
- Prompt instructions that tell the coach when to reference prior output vs. when to ignore it (e.g., skip callback if user had insufficient data last week)
- Output constraints: callback must be factual and brief — one sentence max, not a therapy session
- Validation: callback cannot be fabricated — it must reference only what was actually written last week

**Open questions before speccing:**
- What's the lookback window? Just last week, or rolling 2-3 weeks?
- Does the callback go in `pattern` or `tension` or its own field?
- What happens when last week was `skipped` or `rejected`?

**Risk:** Done sloppily, callbacks feel weird and robotic. Needs tight prompt constraints before any code is written.

---

## 2. Calibration Overhaul (This has been reworked in the app - mark as complete)

**The problem:** The current 4 calibration questions (`force`, `drag`, `structure`, `goal`) are buried at the bottom of the coaching screen. Completion rate is likely near zero. More importantly, the answers are written to Firestore but never read by the coaching prompt — they have no effect on anything. It's dead data collection.

**Current questions (for reference):**
- Exercise was mostly... (just enough / steady push / deliberate shove)
- What made this week harder? (time / energy / stress / nothing)
- How did your body feel? (good / worn down / warning signs / something wrong)
- About your current goal... (still right / less urgent / not sure / need a change)

**What's wrong with them:**
- Questions are atmospheric, not diagnostic. "How did your body feel?" doesn't generate actionable coaching context.
- The goal question is the only one with real teeth — and it's last, after most users have already abandoned.
- None of these questions loop back into coaching generation.

**Direction:**
- Rethink all 4 questions from scratch. The only bar: does the answer change what the coach should say next week?
- Make them required — not optional, not skippable (except the safety escape on "something is wrong")
- Promote them — not buried below the coaching card. Placement TBD, but they need to be part of the weekly flow, not an afterthought
- Wire answers into `PromptContext` so the coach actually uses them
- Goal question answer should trigger a goal reset flow inline if user signals they want a change (see Feature 3)

**Open questions before speccing:**
- What are the new questions? Needs a dedicated design session — don't guess
- Where exactly do they live in the UI flow? Before or after reading coaching? On a separate screen?
- What fields get added to `WeeklySummaryRecord` and `PromptContext`?

---

## 3. Goal Drift Detection and Reset Flow

**The problem:** A user who signed up wanting to lose fat may now be in maintenance mode. The coach has no way to know this, and the user has no easy path to update their goal. The current system treats the initial goal as permanent.

**Two scenarios to handle:**

**Scenario A — User-initiated:** User answers the calibration goal question with "I need a change." App walks them through a goal reset right then and there. New goal is written to Firestore. Coach uses updated goal starting next week.

**Scenario B — Coach-detected (future, lower priority):** Behavior data over 3-4 weeks looks inconsistent with stated goal. Coach flags it: "Your patterns over the past month look more like maintenance than fat loss. Is that intentional?" User can confirm the drift or reaffirm the original goal.

**What's needed for Scenario A:**
- Goal reset flow: simple screen sequence, same onboarding feel, triggered from calibration answer
- Writes updated `goal` (and related fields) to `users/{email}/profile/plan`
- Confirmation screen: "Your coaching will reflect your updated goal starting next week"
- No retroactive coaching changes — new goal takes effect on next generation run

**What's needed for Scenario B:**
- Pattern detection logic that cross-references stated goal against behavior data
- New pattern type or a flag on existing patterns
- Prompt instruction: coach can surface the question, but cannot prescribe — user decides
- This is post-launch. Do not touch until Scenario A is solid.

**Locked:** Coach does not reassign causality. If the user's stated goal is fat loss and their nutrition is the limiter, the coach names nutrition — it does not redirect to "maybe your goal has changed."

---

## 4. Solid Zone Indicator

**The problem:** The current momentum bar treats higher as always better. There's no signal to the user that 70-90 is the target range — the zone where the system is working as designed. Users may feel like 75 is underperforming when it's actually right where they should be.

**The philosophy (Canon):** Solid (roughly 70-90) is success. Elite (90+) is rare by design and not the goal. The app should communicate this, not undermine it.

**What good looks like:**
- When a user's momentum has held in the 70-90 range for a meaningful consecutive period, something in the UI acknowledges it — not as praise, but as a factual status read: "Momentum has held in the solid zone for 3 consecutive weeks. This is the target range."
- This same signal could appear in the coaching output (pattern or whyThisMatters section) — coach reflects what the data shows without adding motivational theater

**Open questions — do not design this without answering them:**
- What is the exact solid zone floor and ceiling? 70? 72? Needs a decision.
- What is "consecutive weeks" threshold? 2? 3? Needs a decision.
- Where does the indicator live? On the momentum bar itself (zone marker)? A label below the score? In coaching only? The momentum card is the primary feature — any visual change must be deliberate and earn its place.
- Does this require a new field written to Firestore, or is it derived client-side from the last N weeks of momentum docs?
- Does the coach get a new input flag, or does the prompt just instruct it to look at the pattern and mention it when appropriate?

**Constraint:** The momentum bar is the primary feature of the app. No change to it without a full design decision. Do not add a zone marker, color band, or label without explicitly deciding it belongs there.

---

## 5. Exercise Goal Auto-Adjustment (Remove Manual Prompt)

**The problem:** The web app currently has a manual prompt that asks users if they want to adjust their exercise goal when they hit it consistently (e.g., 5 out of 7 days). This is a reactive, mechanical trigger doing work the coach should own.

**Direction:** Remove the manual prompt. The coach already has the exercise completion data. If a user is consistently hitting or missing their exercise commitment, the coach should surface it in the progression directive — either affirming the current commitment is calibrated correctly, or suggesting the user consider adjusting it.

**What's needed:**
- Remove the manual exercise goal prompt from the web app (identify exact file and component)
- Add exercise commitment data to coaching context if not already there (verify what `PromptContext` receives today)
- Add prompt instruction: when exercise completion rate is consistently high (5+/7 for 2+ weeks), coach may suggest the user consider raising their commitment. When consistently low (2-/7 for 2+ weeks), coach should flag commitment misalignment and may suggest lowering.
- This connects to the `commitment_misaligned` pattern type that already exists

**What's already there:** `commitment_misaligned` is a named `PatternType` in `weeklyCoaching.ts`. The detection logic likely already flags this scenario. Verify before building anything.

**Scope note:** This is partly a prompt change and partly a UI removal. The UI removal is the quickest win — locate the component and pull it.

---

## Notes on Prioritization

None of these are scoped or scheduled. When it's time to build, the rough order for Features 1-5:

1. **Exercise goal auto-adjustment** — smallest lift, one web UI removal + prompt tweak
2. **Calibration overhaul** — requires a design session first (new questions), then data wiring
3. **Goal drift reset flow (Scenario A)** — requires calibration overhaul to be done first
4. **Solid zone indicator** — requires design decision on the momentum bar before any code
5. **Coaching memory** — most complex, needs tightest spec, highest reward if done right

Features 6-8 (Ask Nelson, Momentum Builders, Accountability Partner) are explicitly post-launch and require dedicated design sessions before any scoping. Ask Nelson needs a Canon debate first. Accountability Partner needs an SMS infrastructure decision. Momentum Builders is evaluate-Skool-first before building anything.

---

## 6. Ask Nelson (In-App Chat)

**The problem:** A real health coach is reachable between sessions. Right now Nelson generates weekly output and goes silent. Users who have a question — about their momentum score, about a behavior, about what to do when life derails — have nowhere to go inside the app.

**The idea:** Some kind of chat interface where a user can ask a quick question and get a response grounded in Nelson's coaching philosophy and their own data. Think less "AI therapist" and more "quick question for your coach between sessions."

**Why this needs debate before building:**
- There's a real risk this becomes a crutch or a novelty that undermines the weekly coaching model. Nelson's philosophy is that the user is the scientist — the coach observes and reflects, it doesn't answer on demand.
- Rate limiting and cost are real concerns. Unlimited chat on the Vercel hobby plan with Claude API calls is a fast way to burn money.
- What questions is it actually equipped to answer? "Why is my momentum score 64?" is answerable with data. "Should I try intermittent fasting?" is not Nelson's lane.
- Needs Canon audit before any prompt is written. The chatbot cannot become motivational, prescriptive, or shame-adjacent just because it's conversational.

**What good looks like (tentative):** User taps "Ask Nelson" from the dashboard. Types a question. Gets a response that sounds like the weekly coach — grounded in their data, adult-to-adult, no theater. Hard limits on what it will and won't engage with. Not a general health chatbot.

**Status:** Needs a dedicated design session. Do not spec or build until the core product loop is proven post-launch.

---

## 7. Momentum Builders Community (Skool)

**The idea:** A community — potentially hosted on Skool — called "Momentum Builders." Not Nelson support. Not a help forum. A place where people share how they're building momentum in their lives. Broader than just the app. Aligned with the philosophy.

**Why Skool specifically:** Skool is purpose-built for communities attached to a product or creator. It handles membership, discussion, courses, and events in one place. Worth evaluating seriously before building anything custom.

**What this is not:** A feature inside the app. This lives outside Nelson and links to it. The app might surface a link to the community, but the community is its own thing.

**Open questions:**
- Is this a free community or paid (separate from app subscription)?
- Does it require active moderation? DJ is one person.
- How does it connect to the app identity without becoming a support channel?
- Does "Momentum Builders" work as a standalone brand or does it need Nelson branding attached?

**Status:** Early idea. Evaluate Skool's product and pricing. No build decision until post-launch.

---

## 8. Accountability Partner

**The idea:** A user designates one person — a friend, spouse, training partner — to receive a weekly summary of their progress. Not a leaderboard. Not a social feed. A private report sent to one person the user trusts.

**How it works (rough):**
- User enters their accountability partner's phone number in Settings
- Partner receives a text: "DJ wants you to hold him accountable. Reply YES to receive his weekly progress summary, or NO to opt out."
- On YES: partner receives a simple weekly text summary — something like "DJ checked in 5 out of 7 days this week. Momentum: 74. Focus area: sleep."
- Partner does nothing else. No app required. No account. Just a text.
- User can remove or change their partner at any time.

**Why this is good:** Accountability is one of the most proven behavior change levers. This adds it without requiring the partner to download anything or engage with the product. Low friction for everyone.

**What's needed:**
- SMS sending infrastructure (Twilio or similar)
- Opt-in/opt-out flow for the partner (reply-based or web link)
- Weekly summary generation — plain language, data-grounded, Canon-compliant (no "DJ crushed it this week")
- Consent and privacy handling — partner's phone number is sensitive data
- Unsubscribe path that actually works (required by SMS regulations)

**Complexity note:** SMS infrastructure is a real lift — Twilio setup, number provisioning, compliance with carrier regulations (A2P 10DLC registration in the US). Not a weekend project. Budget accordingly.

**Status:** Strong idea. Post-launch. Needs SMS infrastructure decision before scoping.

## 9. Notification Suppression (Post Check-In)
If a user checks in before their scheduled reminder fires, the reminder should not send. Current local notification implementation has no awareness of check-in state — it fires regardless.
The fix requires APNs (server-side push). Server checks Firestore at the user's preferred time, confirms no check-in for today, and only then sends the push. This is how every serious health app handles it and is the correct long-term architecture anyway.
Current state: Local notifications scheduled via expo-notifications. Works for TestFlight. Replace with APNs server-side push post-enrollment.
What's needed when APNs is configured:

Store Expo push token in Firestore at users/{email}.expoPushToken
Server-side job that runs per-user at their preferred notification time
Check checkinCompleted on today's momentum doc before sending
Only send if checkinCompleted !== true
Retire local notification scheduling in NotificationPrompt.tsx

Status: Deferred. Revisit when Apple Developer enrollment is complete and APNs credentials are configured.