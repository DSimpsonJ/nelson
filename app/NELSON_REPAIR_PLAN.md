Created: January 20, 2026
Timeline: TODAY (8 hours max)
Goal: Delete all dead code, ship cleaner codebase by EOD

PHASE 1: DELETIONS (NO BEHAVIOR CHANGE)
Rules:

Delete only (no refactoring)
Test after each section
Commit after each section
Ship at end of day


SECTION 1: Delete Legacy Routes (30 min)
Files to delete entirely:
✅ /app/plan/page.tsx
✅ /app/plan-overview/page.tsx
✅ /app/program/page.tsx
✅ /app/walk/page.tsx
✅ /app/workout/[day]/page.tsx
✅ /app/summary/page.tsx
✅ /app/intake/page.tsx (NOT /onboarding/intake - different path)
Verification:

Run npm run dev
Navigate to /dashboard
Navigate to /checkin
Navigate to /learn
Navigate to /history
All work? ✅ Commit.

Commit message: chore: delete 7 legacy routes (plan, program, walk, workout, summary, intake)

SECTION 2: Delete Dead Onboarding Page (10 min)
File to delete:
✅ /app/onboarding/setup/rewards/page.tsx
Verification:

Sign up new test account
Complete onboarding flow
Confirm you see /the-lab page, NOT /rewards
✅ Commit.

Commit message: chore: delete deprecated rewards onboarding page

SECTION 3: Remove Dead Field Writes (45 min)
3A: Remove firstCheckInAt writes
File: /app/signup/page.tsx
Line 50: Delete this line
typescriptfirstCheckInAt: null,  // ❌ DELETE THIS
File: /app/onboarding/activate/checkin/page.tsx
Lines 235-239: Delete conditional write block
typescript// ❌ DELETE THIS ENTIRE BLOCK
if (!userSnap.data()?.firstCheckInAt) {
  await setDoc(userRef, {
    firstCheckInAt: new Date().toISOString()
  }, { merge: true });
}
3B: Remove isActivated writes
File: /app/signup/page.tsx
Line 52: Delete this line
typescriptisActivated: false, // 🆕 New users start inactive  // ❌ DELETE THIS
File: `/app/onboarding/activate/checkin/page.tsx**
Find and delete (likely around line 234):
typescriptisActivated: true,  // ❌ DELETE THIS
Verification:

Sign up new test account
Complete onboarding
Check Firestore: User doc should NOT have firstCheckInAt or isActivated
Existing users: Fields still exist (we're not deleting, just stopping writes)
✅ Commit.

Commit message: chore: stop writing dead fields (firstCheckInAt, isActivated)

SECTION 4: Remove Dashboard Bloat (2 hours)
4A: Remove Dead Imports
File: /app/(app)/dashboard/page.tsx
Delete these import lines:
typescriptimport WalkTimer from "../../components/WalkTimer";  // Line 52
import { saveSession } from "../../utils/session";  // Line 35
import { seedFakeCheckins } from "../../utils/seedFakeCheckins";  // Line 42
import { refreshCoachNote, saveCoachNoteToWeeklyStats } from "../../utils/refreshCoachNote";  // Line 40
import { generateCoachInsight } from "../../utils/generateCoachInsight";  // Line 44
import { logInsight } from "../../utils/logInsight";  // Line 45
import { generateWeeklySummary } from "../../utils/generateWeeklySummary";  // Line 46
import { getStreakMessage } from "../../utils/getStreakMessage";  // Line 47
Verification after each deletion:

Check for TypeScript errors
If import is actually used, SKIP deletion and note it
If no errors, delete is safe

4B: Remove Dead Code Blocks
Search for these patterns and delete:

Habit stacking reads (around line 447-448):

typescriptconst stackRef = doc(db, "users", email, "momentum", "habitStack");
const stackSnap = await getDoc(stackRef);
// DELETE entire block if not used

Weekly stats reads (around line 230-231):

typescriptconst ref = doc(db, "users", email, "weeklyStats", weekId);
const snap = await getDoc(ref);
// DELETE if not displayed anywhere

Level-up functions (lines 1186-1242):

typescriptconst getNextLevel = (current: number) => { ... }
const handleLevelUp = async () => { ... }
const handleAdjustLevel = async (minutes: number) => { ... }
const handleKeepCurrent = async () => { ... }
// DELETE all 4 functions if not called

Workout details (lines 275-283):

typescriptfunction getTodaysTrainingName(intake: any): string { ... }
function getTodaysWorkout(plan: any): WorkoutDetails | null { ... }
function getWorkoutDetails(plan: any) { ... }
// DELETE all 3 if not used
Strategy:

Search for each function name in file
If only defined (not called), delete it
If called, check if caller is also dead code
Delete in bottom-up order (deepest dependencies first)

Verification:

npm run build - should compile with no errors
Test dashboard loads
Test check-in button works
✅ Commit.

Commit message: chore: remove dashboard bloat (dead imports, unused functions)
4C: Remove Dev Tools from Production
File: /app/(app)/dashboard/page.tsx
Find dev tools section (bottom of file) and DELETE:
typescriptimport { devClearCheckins, devSeedCheckins, devRecalculateWeeklyStats } from "../../utils/devTools";
// ... all dev tool UI components and handlers
If dev tools are clearly marked, delete entire section.
If you want to keep dev tools:

Feature flag them: if (process.env.NODE_ENV === 'development')
Or move to separate /dev route

Verification:

Dashboard loads
No dev buttons visible
✅ Commit.

Commit message: chore: remove dev tools from production dashboard

SECTION 5: Remove Momentum Dead Fields (1 hour)
File: /app/services/writeDailyMomentum.ts
5A: Remove from TypeScript interface (lines 83-99)
DELETE these fields from DailyMomentumDoc interface:
typescriptprimaryHabitHit: boolean;        // ❌ DELETE
stackedHabitsCompleted: number;  // ❌ DELETE
totalStackedHabits: number;      // ❌ DELETE
moved: boolean;                  // ❌ DELETE
hydrated: boolean;               // ❌ DELETE
slept: boolean;                  // ❌ DELETE
nutritionScore: number;          // ❌ DELETE
5B: Remove from defaults (lines 133-140)
DELETE these lines:
typescriptprimaryHabitHit: false,
stackedHabitsCompleted: 0,
totalStackedHabits: 0,
moved: false,
hydrated: false,
slept: false,
nutritionScore: 0,
5C: Remove foundations object (already deleted, verify gone)
Verify these are NOT in the file:
typescriptfoundations: { protein: false, ... }  // Should be gone
stack: {},  // Should be gone
Verification:

TypeScript compiles (npm run build)
Do a test check-in
Check Firestore: New momentum doc should NOT have deleted fields
✅ Commit.

Commit message: chore: remove dead fields from momentum schema (habit stacking remnants)

SECTION 6: Remove Celebration Terminology Bloat (30 min)
SKIP THIS - TOO RISKY FOR TODAY
Reason: Global find/replace "reward" → "celebration" touches too many files. Save for Phase 2.

SECTION 7: Final Verification (30 min)
Full app test:

Sign up new account
Complete onboarding
Do first check-in
Navigate to dashboard
Navigate to Learn
Navigate to Lab
Do second check-in
Check Firestore for all changes

Expected results:

No firstCheckInAt or isActivated in new user docs
No dead momentum fields in new momentum docs
Dashboard loads fast (less code)
No TypeScript errors
No console errors

If all pass: ✅ Ship to production

DEPLOYMENT CHECKLIST
bash# Build production
npm run build

# If build succeeds
git add .
git commit -m "chore: Phase 1 cleanup - delete dead code (routes, fields, imports)"
git push

# Deploy to Vercel
# (automatic on push to main, or manual deploy)

RECOVERY PLAN (IF SOMETHING BREAKS)
If app breaks after deletion:

git log - find last commit
git revert <commit-hash> - undo specific deletion
Investigate what actually used the "dead" code
Document in triage as "NOT DEAD"
Try again with corrected list


END OF DAY REPORT
What got deleted:

 7 legacy routes
 1 deprecated onboarding page
 2 dead field writes (firstCheckInAt, isActivated)
 X dead imports from dashboard
 X dead functions from dashboard
 Dev tools from dashboard
 7 dead momentum fields

Line count reduction: ~____ lines (estimate after completion)
Status: ✅ SHIPPED / ⚠️ PARTIAL / ❌ BLOCKED