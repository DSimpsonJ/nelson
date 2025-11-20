# Nelson – Dashboard, Momentum, and Check-in System

## 1. Product Idea in One Sentence

Nelson is a daily, low-friction training partner that rewards *showing up* while gently nudging users toward one focus habit at a time, using streaks, momentum, and clear visual feedback.

---

## 2. Current Dashboard Layout (v2)

Order of sections on `/dashboard`:

1. **Welcome Header**
   - Greets user: `Hey {firstName}.`
   - Subline:
     - If `checkinSubmitted` today → “You’ve already checked in today.”
     - Else → rotating micro-copy (`Ready to build?`, `Nothing dramatic. Just direction.`, etc.).
   - **Streak pill** underneath:
     - `checkinStreak` is based on **consecutive days with *any* check-in**, not behavior quality.
     - Shown only if `checkinStreak > 0`.
     - Copy varies by length (eg. “3 day streak”, “17 day streak. Stay the course.”).
   - Small tagline: `Patience • Perseverance • Progress`.
   - Nelson logo on the right.

2. **Weekly Focus Card (“Your Focus This Week”)**
   - This is the **single current focus habit**, not a grab bag of habits.
   - Shows:
     - Title: `Your Focus This Week`
     - Line for habit name, eg: `Walk 10 minutes daily`
     - One short supporting line, eg:  
       `One brick at a time. Show up for this, and momentum builds itself.`
   - Old list of 4 habits removed from the primary UI. Those habits still live in the plan object but we treat **one** as the current focus.

3. **Yesterday’s Accountability / Daily Check-In Card**
   - We now treat this as “Yesterday’s behaviors, reported today”.
   - UI:
     - Top explanatory line: “Before we move forward, let’s look back at how you showed up yesterday.”
     - **Daily Check-In fields:**
       - Headspace (mood): tracked but **not scored** for momentum.
       - Protein target hit? (yes / almost / no)
       - Hydration hit? (yes / no)
       - Intentional movement? (yes / no)
       - Nutrition alignment slider (0–100)
         - Helper text: “Anything above 80 is a win — perfection is not the goal.”
       - Optional note.
   - Headspace is used only for **insights and copy tone**, not for any numeric score.

4. **Daily Results Card**
   - Mirrors the check-in but **read-only** after saving:
     - Nutrition alignment percentage.
     - Protein target status (Yes / Almost / No with color).
     - Workout status (from `status` doc in Firestore).
     - Movement yes/no.
   - If `!todayCheckin` → empty state:
     - “No check-in yet today. Tap your check-in to get started.”

5. **Momentum Card**
   - Small, compact card (currently inside Trends / Weekly area) that shows:
     - Momentum percentage (0–100).
     - Color-coded background:
       - 80–100 → strong (white / light greenish or positive state).
       - 60–79 → okay / building (neutral / amber).
       - 0–59 → struggling (light red / warning).
     - One line tying back to the **focus habit**, eg:
       - High: “You’re consistently hitting your 10-minute walks. Keep stacking reps.”
       - Medium: “You’re showing up, but walks are hit-or-miss. Pick one specific time today.”
       - Low: “Momentum dipped this week. Start with just 5 minutes today and rebuild.”
   - This card reflects **behavior quality**, not just showing up.

6. **Coaching Reflection & Focus Card (Weekly Summary)**
   - Uses `weeklyStats` + recent check-ins + any saved insights:
     - Check-ins this week.
     - Workouts this week.
     - Momentum score.
   - Primary coach note plus “next focus” line based on weakest area:
     - Protein / Hydration / Movement / Nutrition.

7. **Today’s Training**
   - Uses `profile.plan.schedule` and real-time status.
   - If session completed → “Training Complete” with button to summary.
   - Otherwise shows “Scheduled Training: {today name}” and button to `/program`.

8. **Consistency Tracker (Last 14 Days)**
   - Dot grid for each of last 14 days:
     - Green dot = movement yes.
     - Blue dot = hydration yes.
     - Amber dot = protein yes.
   - Uses `recentCheckins` array.

9. **Workout Summary**
   - Sessions this week, total sets, average duration.

10. **Today’s Workout Card**
    - CTA card tied to `todayCheckin` and `hasSessionToday`:
      - If no check-in → button disabled, “Check in first.”
      - If check-in and no session → “Start Workout.”
      - If session exists → “View Summary.”

11. **Dev Tools (development only)**
    - Seed fake check-ins.
    - Clear all check-ins.
    - Recalculate weekly stats.
    - Reset today’s check-in.

---

## 3. Data Model (Firestore)

All paths are under `users/{email}`.

### Profile and Plan

- `users/{email}/profile/intake`
  - `firstName`, `lastName`, `email`, etc.
  - `plan`: nested object, **preferred current structure**
    - `planType`, `goal`, `trainingDays`, `experience`, `equipment`
    - `hydrationTarget`, `sleepTarget`, `coachingStyle`
    - `startDate`
    - `weekOneFocus`
    - `dailyHabits[]`
    - `schedule[]` (array of day objects with `.name`)

We also support the **legacy structure** where `weekOneFocus`, `dailyHabits`, `schedule` live at the top level. `loadDashboardData` normalizes this so `profile.plan` always exists.

### Check-ins

- `users/{email}/checkins/{date}`
  - `date`: string `YYYY-MM-DD`
  - `mood`: string (headspace, eg. “Clear”, “Steady”, “Off”, “tired”, etc.)
  - `proteinHit`: `"yes" | "almost" | "no"`
  - `hydrationHit`: `"yes" | "no"`
  - `movedToday`: `"yes" | "no"`
  - `nutritionAlignment`: number 0–100
  - `note`: optional text
  - `createdAt`, `updatedAt`

### Momentum

- `users/{email}/momentum/{date}`
  - `date`
  - `moved`: boolean
  - `hydrated`: boolean
  - `slept`: boolean (currently placeholder; wired later)
  - `nutritionScore`: 0–100
  - `momentumScore`: 0–100 (***3-day weighted average***)
  - `passed`: boolean (if all 4 behaviors were “wins” that day)
  - `currentStreak`: integer (behavior streak)
  - `lifetimeStreak`: integer (total days with check-in / attempt)
  - `streakSavers`: integer
  - `createdAt`

### Weekly Stats / Reflection

- `users/{email}/weeklyStats/{weekId}`
  - `weekId`: ISO week id: e.g. `2025-W46`
  - `proteinConsistency`, `hydrationConsistency`, `movementConsistency`
  - `moodTrend`
  - `checkinsCompleted`
  - `workoutsThisWeek`
  - `totalSets`
  - `avgDuration`
  - `momentumScore`
  - `coachNote`
  - `updatedAt`

- `users/{email}/weeklySummaries/{weekId}`
  - `summary`: generated text recap.
  - `weekId`
  - `createdAt`

### Sessions / Status

- `users/{email}/sessions/{id}`
  - Workout session records.
- `users/{email}/metadata/status`
  - `lastCompleted`
  - `nextWorkoutIndex`
  - `lastDayType`

---

## 4. Logic: Streaks vs Momentum

### Streaks

- **Definition:** consecutive days where the user has *any* check-in saved.
- Source of truth:
  - Calculated from `users/{email}/checkins/*`.
- Use cases:
  - Shown in welcome header as the “streak pill.”
  - Encourages daily *presence* even if behaviors are not perfect.

### Momentum

- **Definition:** a short-term quality score that reflects how consistently the user is hitting key behaviors, especially the **current focus habit**.
- Backed by Firestore `momentum/{date}` docs.
- Behaviors we currently factor in:
  - `moved` (from `checkin.movedToday === "yes"`)
  - `hydrated` (from `checkin.hydrationHit === "yes"`)
  - `ateWell` (from `nutritionAlignment >= 80`)
  - `slept` (future field, placeholder for now)

#### Daily “pass” logic

- Each day, we compute:

  ```ts
  const moved = ...
  const hydrated = ...
  const ateWell = nutritionAlignment >= 80;
  const slept = (checkin as any).sleepHit === "yes"; // future

  const behaviors = [moved, hydrated, slept, ateWell];
  const wins = behaviors.filter(Boolean).length;
  const passed = wins === 4;
  const dailyScore = Math.round((wins / 4) * 100);