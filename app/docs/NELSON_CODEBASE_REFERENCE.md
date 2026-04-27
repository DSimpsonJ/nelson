# NELSON CODEBASE REFERENCE
**Generated:** February 23, 2026  
**Source:** Actual `find` output from project root — not inferred  
**Update this file any time you add, move, or delete a file**

---

## ROOT CONFIG FILES
```
vercel.json                         # Cron config — schedule only, no headers block
next.config.ts                      # Next.js config
tailwind.config.js                  # Tailwind (core utilities only, no compiler)
tsconfig.json
tsconfig.build.json
postcss.config.mjs
eslint.config.mjs
.eslintrc.json
package.json
package-lock.json
.env.local                          # ANTHROPIC_API_KEY only (CRON_SECRET lives in Vercel only)
.gitignore
serviceAccountKey.json              # Firebase service account (DO NOT COMMIT)
README.md
nelson@0.1.0                        # Unknown — verify what this is
```

## .VERCEL
```
.vercel/project.json                # Vercel project config
.vercel/README.txt
.vercel/README 2.txt
```

## APP ROOT
```
app/layout.tsx                      # Root layout (unauthenticated)
app/page.tsx                        # Root page (likely redirect/landing)
app/loading.tsx                     # Root loading state
app/globals.css
app/favicon.svg
app/icon.svg
app/firebase/config.ts              # Firebase init, exports db
app/NELSON_REPAIR_PLAN.md           # Internal doc — legacy or active?
app/NELSON_SYSTEM_TRIAGE.md         # Internal doc — legacy or active?
app/README_Nelson_App.md            # Internal doc
app/docs/nelson-dashboard.md        # Dashboard documentation
```

## AUTHENTICATED ROUTES — app/(app)/
```
app/(app)/layout.tsx                # Auth gate, nav, blue dot logic, pathname-triggered re-check

app/(app)/dashboard/page.tsx        # Main dashboard — 1,800+ lines, request specific sections only
app/(app)/dashboard/DashboardDevTools.tsx     # Dev tools panel (includes coaching generator)
app/(app)/dashboard/dashboardSelectors.ts     # Dashboard data selectors
app/(app)/dashboard/loadDashboardData.ts      # Dashboard data fetching

app/(app)/checkin/page.tsx          # Daily check-in flow
app/(app)/checkin/checkinModel.ts   # Check-in business logic
app/(app)/checkin/types.ts          # Check-in types
app/(app)/checkin/components/CheckinQuestion.tsx
app/(app)/checkin/components/CheckinShell.tsx
app/(app)/checkin/components/CheckinSuccess.tsx
app/(app)/checkin/components/InfoTooltip.tsx
app/(app)/checkin/components/ProgressIndicator.tsx
app/(app)/checkin/components/RatingButtons.tsx
app/(app)/checkin/components/index.ts

app/(app)/history/page.tsx          # Month-by-month check-in history
app/(app)/history/dateHelpers.ts    # Date utility functions for history
app/(app)/history/useMomentumHistory.ts  # History data hook

app/(app)/learn/page.tsx            # Learn section index
app/(app)/learn/[slug]/page.tsx     # Individual article view (supports imageUrl field)

app/(app)/coach/page.tsx            # Coach page — verify if active or legacy
```

## PUBLIC ROUTES
```
app/login/page.tsx
app/signup/page.tsx
app/page.tsx                        # Root (likely redirects to login or dashboard)
app/not-started/page.tsx            # Exit/not-started flow
```

## SIGNUP (ROOT LEVEL — SEPARATE FROM app/signup)
```
signup/page.tsx                     # NOTE: This is at ROOT level, not inside app/
                                    # Verify if this is duplicate, legacy, or intentional
```

## ONBOARDING ROUTES
```
app/onboarding/name/page.tsx
app/onboarding/promise/page.tsx
app/onboarding/intake/age/page.tsx
app/onboarding/intake/complete/page.tsx
app/onboarding/intake/focus/page.tsx
app/onboarding/intake/movement-education/page.tsx
app/onboarding/intake/sex/page.tsx
app/onboarding/intake/weight/page.tsx
app/onboarding/activate/celebration/page.tsx
app/onboarding/activate/checkin/page.tsx
app/onboarding/activate/commitment/page.tsx
app/onboarding/activate/ready/page.tsx
app/onboarding/setup/checkin-time/page.tsx
app/onboarding/setup/connect/page.tsx
app/onboarding/setup/how-it-works/page.tsx
app/onboarding/setup/identity/page.tsx
app/onboarding/setup/movement-commitment/page.tsx
app/onboarding/setup/notifications/page.tsx
app/onboarding/setup/plan/page.tsx
app/onboarding/setup/the-lab/page.tsx
```

## ADMIN ROUTES
```
app/admin/articles/page.tsx         # Article management — verify access controls
```

## API ROUTES
```
app/api/cron/generate-weekly-coaching/route.ts    # Cron orchestrator — loops all users, called by Vercel cron
app/api/generate-weekly-coaching/route.ts         # Per-user coaching generation — called by orchestrator + dev tool
app/api/save-weekly-calibration/route.ts          # Weekly calibration save endpoint
```

## COMPONENTS
```
app/components/CoachAccess.tsx              # Coaching card — reads weeklySummaries, shows coaching or empty state
app/components/HistoryAccess.tsx            # History access component
app/components/LearnBanner.tsx              # Learn banner (sits above coaching card on dashboard)
app/components/LevelUpSlider.tsx            # Level-up UI component
app/components/NotificationPrompt.tsx       # Notification permission prompt
app/components/PlanDetails.tsx              # Plan details display
app/components/SafetyModal.tsx              # Safety modal
app/components/TrainingPlan.tsx             # Training plan display
app/components/WalkTimer.tsx                # Walk timer
app/components/WeeklyCalibration.tsx        # Weekly calibration component
app/components/WeeklyCoachingDevTool.tsx    # NOTE: Also exists at app/(app)/dashboard/DashboardDevTools.tsx
                                            # Verify which is active — possible duplicate
app/components/WeightCard.tsx               # Weight display card

app/components/logos/index.ts
app/components/logos/LoadingScreen.tsx
app/components/logos/NelsonIcon.tsx
app/components/logos/NelsonLogo.tsx
app/components/logos/NelsonLogoAnimated.tsx
app/components/logos/NelsonLogoHeader.tsx

app/components/onboarding/IntakeProgress.tsx

app/components/rewards/Burst.tsx
app/components/rewards/CheckinSuccessAnimation.tsx
app/components/rewards/Confetti.tsx
app/components/rewards/Fireworks.tsx
app/components/rewards/HeroCard.tsx
app/components/rewards/RewardRenderer.tsx
app/components/rewards/RingPulse.tsx
```

## SERVICES (Core Logic)
```
# LOCKED — DO NOT MODIFY WITHOUT DJ APPROVAL
app/services/newtonianMomentum.ts           # Momentum calculation engine (weights, dampening, daily score)
app/services/writeDailyMomentum.ts          # ALL momentum writes — do not bypass
app/services/celebrationTriggers.ts         # Celebration/reward triggers (rewardEngine)
app/services/rewardEngine.ts               # Reward engine — DO NOT TOUCH

# COACHING SYSTEM
app/services/buildEarlyUserPrompt.ts        # Early user coaching prompt (canCoach: false path)
app/services/buildScopedSystemPrompt.ts     # Full coaching prompt builder (10+ check-ins)
app/services/detectWeeklyPattern.ts         # Pattern detection, canCoach thresholds
app/services/validateWeeklyCoaching.ts      # Coaching output validation
app/services/validateConstraintAlignment.ts # Constraint alignment validation
app/services/languageEnforcement.ts         # Banned phrase enforcement
app/services/deriveWeeklyConstraints.ts     # Weekly constraint derivation
app/services/deriveProgressionType.ts       # Progression type derivation
app/services/deriveUserConstraints.ts       # User constraint derivation
app/services/weeklyCalibration.ts           # Weekly calibration logic
app/services/detectDayOfWeekPatterns.ts     # Day-of-week pattern detection
app/services/scopeBehavioralData.ts         # Behavioral data scoping
app/services/vulnerabilityMap.ts            # Vulnerability mapping
app/services/messagingGuide.ts              # Messaging guidelines
app/services/fixtures/weeklyPatterns.ts     # Pattern fixtures for dev tool testing

# OTHER SERVICES
app/services/learnService.ts                # Article eligibility, getFirstUnreadArticle, blue dot logic
app/services/weightService.ts               # Weight tracking
app/services/gapReconciliation.ts           # Gap detection and fill logic
app/services/checkMilestones.ts             # Milestone checking
app/services/milestoneState.ts              # Milestone state management
app/services/missedCheckIns.ts              # Missed check-in handling
app/services/currentFocus.ts               # Current focus logic
app/services/testPatternDetection.ts        # Pattern detection testing utility
```

## TYPES
```
app/types/weeklyCoaching.ts         # All coaching types, PatternType, MODEL_CONFIG, WeeklySummaryRecord
app/types/trends.ts                 # Trend types
app/types/weight.ts                 # Weight types
types/react-typing-effect.d.ts      # Type declaration for react-typing-effect (root level)
```

## UTILS
```
app/utils/date.ts                           # Date utilities
app/utils/checkin.ts                        # Check-in utilities
app/utils/getEmail.ts                       # Email retrieval utility
app/utils/session.ts                        # Session utilities
app/utils/devTools.ts                       # Dev tool utilities
app/utils/habitConfig.ts                    # Habit configuration
app/utils/habitEvents.ts                    # Habit event handling
app/utils/history/getDayVisualState.ts      # Day visual state for history view
app/utils/momentumCalculation.ts            # NOTE: Verify if this is dead code — writeDailyMomentum.ts and newtonianMomentum.ts are the authority
app/utils/findLastRealCheckin.ts            # Finds last real (non-gap) check-in
app/utils/getStreakMessage.ts               # Streak message generation
app/utils/checkLevelUpEligibility.ts        # Level-up eligibility check
app/utils/generateCoachInsight.ts           # Coach insight generation — verify if active or superseded by coaching system
app/utils/generateWeeklySummary.ts          # Weekly summary generation — verify if active or superseded
app/utils/generatePlan.ts                   # Plan generation
app/utils/buildInitialPlanFromIntake.ts     # Initial plan builder from onboarding intake
app/utils/getTodaysWorkout.ts               # Today's workout retrieval
app/utils/programMeta.ts                    # Program metadata
app/utils/logInsight.ts                     # Insight logging
app/utils/moodUtils.ts                      # Mood utilities
app/utils/refreshCoachNote.ts               # Coach note refresh — verify if active or legacy
app/utils/seedFakeCheckins.ts               # Seed fake check-ins for testing
app/utils/updateWeeklyStats.ts              # Weekly stats update
app/utils/withFirestoreError.ts             # Firestore error wrapper
app/utils/backfillMomentumStructure.ts      # Momentum backfill utility — likely one-time migration
app/utils/migrations/backfillLastProvenTarget.ts  # Migration utility — likely one-time

app/context/ToastContext.tsx                # Toast notification context
```
app/api/delete-account/route.ts     # Account deletion endpoint (authenticated, user-triggered)
app/(app)/settings/page.tsx         # Settings page (sign out, legal links, account deletion)
---

## FLAGS — THINGS TO VERIFY

These were noted during generation and should be confirmed:

1. **`signup/page.tsx` at root level** — there is also `app/signup/page.tsx`. Two signup pages. One is likely legacy or a routing artifact. Verify which is active.

2. **`app/components/WeeklyCoachingDevTool.tsx`** — there is also `app/(app)/dashboard/DashboardDevTools.tsx`. Verify which one is actually rendered. Possible duplicate or one imports the other.

3. **`app/utils/momentumCalculation.ts`** — with `newtonianMomentum.ts` and `writeDailyMomentum.ts` as the locked authority files, this utility may be dead code. Verify before touching.

4. **`app/utils/generateCoachInsight.ts` and `app/utils/generateWeeklySummary.ts`** — these predate the full coaching system. Verify if they are still called anywhere or are superseded.

5. **`app/utils/refreshCoachNote.ts`** — verify if active or legacy.

6. **`app/(app)/coach/page.tsx`** — separate coach page exists alongside `CoachAccess.tsx` component. Verify what this route does and whether it's in the nav.

7. **`app/admin/articles/page.tsx`** — admin route. Verify whether it has any access controls or is open to any authenticated user.

8. **`app/NELSON_REPAIR_PLAN.md` and `app/NELSON_SYSTEM_TRIAGE.md`** — internal docs inside the app directory. Likely legacy planning docs. Verify if still relevant or safe to remove.

9. **`app/utils/backfillMomentumStructure.ts` and `app/utils/migrations/backfillLastProvenTarget.ts`** — migration utilities. If these were one-time runs, they're dead code and could be removed.

10. **`nelson@0.1.0`** at project root — unclear what this file is. Verify.

---

## FIRESTORE COLLECTIONS (For Reference)
```
users/{email}                               # User document (email = document ID)
users/{email}/momentum/{YYYY-MM-DD}         # Daily momentum documents
users/{email}/weightHistory/{YYYY-MM-DD}    # Weight history
users/{email}/weeklySummaries/{YYYY-Www}    # Weekly coaching (ISO 8601 week ID)
users/{email}/metadata/accountInfo          # Account metadata (firstCheckinDate)
articles/{slug}                             # Learn articles (public read)
```