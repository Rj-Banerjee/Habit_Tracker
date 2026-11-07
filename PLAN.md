# Habit Tracker — Build Plan

Last updated: 7 Nov 2026

## Product summary

We ship a mobile-first habit tracker in about 24 weeks, in five phases: foundations, core tracker, AI coach, voice assistant, then beta and launch. Gamification, site blocking, wearables and pods come after launch.

**Positioning:** the habit tracker that adapts instead of punishes. It steps in before you fail, shrinks a habit when life gets hard, and keeps streaks meaningful without making them fragile.

**Design principles every screen follows:**

- **Calm by default, deep on demand.** Three surfaces for three time scales: Glance (Today, about 10 seconds), Reflect (evening, about 2 minutes), Review (Sunday, about 10 minutes).
- **Logging takes under 2 seconds**, from the app, a widget, a notification or your voice. Most days the user should not need to open the app at all.
- **Identity, shown by colour.** Each habit belongs to an identity ("The Athlete"), worked out from the habit itself, and each identity owns one accent colour. Today is grouped by time of day (Morning, Afternoon, Evening, Anytime); the accent keeps the identity visible, and Progress keeps the identity score.
- **No shame states.** Misses are hollow dots, never red. Coming back after a gap starts small.
- **No habit limit.** People add as many habits as they like. After the 6th active habit, one gentle tip, shown once: "Starting with a few makes them stick." Nothing is ever blocked.

## Scope by release

The launch release (v1) is the core tracker, the AI coach and voice logging. Everything else waits until real users tell us what matters.

| Area | v1 — launch | v2 — after launch | v3 — later |
| --- | --- | --- | --- |
| Tracking | Today screen grouped by time of day; identities; yes/no, count, duration and quit habits; specific days or times per week; ending a habit; tap / long-press / swipe logging; amounts that add up through the day; Shrink It ladder (full, minimum, setup-only); evening back-log; built-in habit library and a four-field habit form | Monthly goals; archetype routine templates; CSV import | — |
| Streaks | Fractured chain view; Grace Day bank; 24-hour back-log; 1.5x Streak Repair | — | — |
| Progress | Analytics: Overview with ranges and comparisons, habit detail, habit strength, timing and volume stats, weekly report, AI insights with one-tap actions (Pro); identity score; yearly heatmap; streak history; Compound Forecaster; desktop 31-day grid | Exportable reports | — |
| AI coach | Coach cards on Today; coach chat; miss review; preemptive nudges; peak hours from completion times; Sunday Review; Future-Self letter; "Why" card | Next-physical-action mode; worst-case prompts | — |
| Voice | Siri via App Intents; in-app voice (hold-to-talk + wake word while open); Android voice tile and widget | Gemini on Android via AppFunctions; Apple Watch | Opt-in always-listening wake word on Android |
| Reminders | A reminder per habit at its own time, plus at most one preemptive nudge a day, actionable from the lock screen; home and lock-screen widgets | — | — |
| Focus | Tunnel Vision mode with a focus timer | Focus and Screen Time (Pro, Android first, then iPhone and desktop); Chrome extension: time budgets and in-page blocking | Geofenced reminders; wearable sync |
| Social and game | — | Accountability pods | Gamification (RPG, rewards) |

## Plans

Pricing is still undecided, and these plans may change. Payments aren't built yet.

| Plan | What it includes |
| --- | --- |
| **Free** | Manual habit tracking: everything in the core tracker (habits, Shrink levels, streaks, Grace Days, repair, back-log, Progress, reminders, widgets). No AI features. Voice logging uses a simple on-device matcher only, for clear phrases like "done with Read" or "read 20 pages", with no model calls. Habit setup uses the built-in habit library and simple parsing, with no model calls. 10+ normal themes, each customizable (colours, fonts, accent per identity). |
| **Pro** | Everything in Free, plus the full AI layer: coach, preemptive nudges, miss review, Sunday letter, AI voice parsing with mishearing correction, coach actions, AI habit setup (targets, minimums, days, time of day and identity suggested for habits the library doesn't know), and suggestions to move a habit to the time of day it's actually done. Gamified themes: a complete game version of the app. Game progress is computed continuously from the activity log, even when no game theme is selected, so switching to a game theme always shows up-to-date progress and never starts from zero. Game themes are downloaded when picked, not bundled. After v1 launch: Focus and Screen Time, which connects phone app usage to habits (see "Focus and Screen Time" below). Social accountability, inspired by Habitica's parties and challenges: friends or people with the same goals form groups, see each other's progress and compete on streaks. Opt-in, and users choose which habits are shared. Any group penalty (like Habitica's party damage) is an optional challenge mode, never the default. |
| **Ultra** | Everything in Pro, plus the AI-powered workspace (design not decided yet). Habits sync with the workspace: for example a "Work" habit updates automatically from work done in the workspace, via the activity log. |
| **Enterprise** | Team workspaces and the features teams need: roles, a manager view of company work, audit history. Personal habits stay private from managers, always. |

**Foundations built now** (the plan features themselves aren't):

- **Entitlements:** `packages/core/src/entitlements.ts` maps each plan to its features (`tracker`, `voice.simple`, `themes.standard`, `ai.coach`, `ai.nudges`, `ai.voice`, `ai.setup`, `themes.game`, `social`, `workspace`, `team`). `users.plan` defaults to `free`, and only the server can change it. The AI service refuses AI calls without the entitlement, and its copy of the map is checked against the app's by a test. Screens ask one hook for a feature, never a plan name, and show locked features with a calm "Available on Pro." Test accounts get Pro.
- **Themes as data:** a theme is a data file (light and dark colours, typography, radii, optional images and sounds), checked by `validateTheme` on load, including that text stays readable. The current look is the default theme, `packages/core/src/themes/default.ts`. Eleven standard themes are bundled (`themes/standard.ts`), and people can swap the typeface and each identity's colour.
- **Game progress:** `activity_events` has what XP and levels need: every log change with its Shrink level, status, amount, identity, source, actor and time; repairs; when each habit began, moved, was archived or restored; and focus sessions. Grace Days are worked out from the logs, as the streak rules already do.

## Tech stack and architecture

One React Native codebase for iPhone and Android, a Next.js web app for desktop, and a backend on Supabase plus FastAPI — a stack you already work in.

```
Clients                     Backend                         External
Mobile app (RN + Expo)  ->  Supabase (Postgres, Auth,
Phone extensions        ->    Realtime; streak rules in SQL)
  (Siri, widgets, tile)         ^  reads logs / writes nudges
Web app (Next.js)       ->  AI service (FastAPI)        ->  LLM provider
                              coach, voice parser,      ->  Push (APNs, FCM)
                              nightly pattern jobs
```

The apps never call the LLM directly. Every AI request goes through the FastAPI service, which holds the keys, enforces rate limits and picks the right model.

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile | React Native + Expo (TypeScript), with native Swift and Kotlin modules | One codebase; native code only where Siri, widgets and the Android tile need it |
| Web | Next.js | Desktop grid and weekly review; shares types with mobile |
| Data and auth | Supabase: Postgres, Auth, Realtime, Storage | Realtime keeps phone, widget and web in sync after a voice log |
| AI service | FastAPI (Python) | Coach, voice intent parsing, nightly pattern jobs |
| LLM | Provider-agnostic, chosen by config (`AI_PROVIDER`, `AI_MODEL_FAST`, `AI_MODEL_STRONG`): Gemini free tier in development, Ollama for offline tests, Anthropic adapter later | Fast model for voice parsing and nudges; stronger model for chat and letters |
| Speech | On-device speech-to-text; Picovoice Porcupine for the custom wake word | Fast, works offline, no audio sent to servers |
| Notifications | Expo Notifications (APNs and FCM) | Actionable notifications on both platforms |
| Scheduled jobs | Supabase cron + FastAPI workers | Nightly patterns, Sunday letters, preemptive nudges |
| Analytics | PostHog | Funnels, retention and log-source tracking |

## Data model

Nine core tables in Postgres cover v1. Streaks are computed from `habit_logs`, never stored as a counter, so back-logging and repairs can't drift out of sync.

| Table | Key fields | Notes |
| --- | --- | --- |
| `users` | id, timezone, wake\_time, tone (gentle / direct / drill), mode (strict / grace, default grace), assistant\_name | Timezone decides where "today" ends |
| `identities` | id, user\_id, name, colour\_token, why\_text, why\_image\_url | "The Athlete"; the Why card lives here |
| `habits` | id, identity\_id, title, type (boolean / count / duration / quit), target, unit, frequency (specific days / times per week), schedule (days, time window), per\_week, time\_of\_day (morning / afternoon / evening / anytime), reminder\_time, ends\_on, previous\_run\_id, voice\_aliases\[\], milestone (optional) | `voice_aliases` lets "work" match "Deep work". `previous_run_id` links a restarted habit to its earlier run |
| `habit_levels` | habit\_id, level (full / minimum / setup), description, target | The Shrink It ladder, defined at creation |
| `habit_logs` | id, habit\_id, date, level\_done, amount, status (partial / done / skipped / repaired), skip\_reason, source (tap / widget / notification / siri / voice / coach), logged\_at | One row per habit per day, holding the day's total; `partial` means progress below the minimum, which doesn't count. `source` tells us which surfaces get used. "Missed" is never stored (see Streak rules) |
| `grace_days` | user\_id, earned\_at, spent\_on\_habit, spent\_for\_date | Earned bank; spending one marks the day protected |
| `reflections` | user\_id, week\_start, wins\[3\], month\_note, mood\_line | Sunday Review and evening line |
| `coach_events` | id, user\_id, kind (nudge / miss\_review / letter / chat), payload, sent\_at, outcome | Every coach action and whether it helped; feeds the patterns |
| `activity_events` | id, user\_id, occurred\_at, kind, subject\_id, payload (jsonb), source, actor (user / ai\_assisted / ai) | Append-only; written in the same transaction as every `habit_logs` change |

Schedules, times per week, targets, Shrink level definitions, time of day and end dates are dated, so a change never rewrites the past. See Streak rules. `users.seen_tips` records one-time tips and celebrations, so they show once on every device.

**Built-in habit library:** about 150 common habits in `packages/core` as data, each with a name, English and Hinglish synonyms, type, default target and unit, minimum and setup versions, days (specific days or times per week, with a one-line reason), time of day, identity and voice aliases. Free uses it with simple parsing; Pro uses it first and asks the fast model only for habits it doesn't know.

A derived `user_patterns` view (best hours, weak weekdays, common skip reasons) is rebuilt nightly and given to the coach as context.

## Streak rules

These are the final rules for streaks. Streaks are computed from `habit_logs` using these rules.

### What counts

- All three Shrink levels (full, minimum, setup) count toward the streak, when chosen as a level (a tap, a long-press or "just the setup").
- The level is stored, so Progress can show them differently.
- Unscheduled days are ignored.

### Amounts

- Amounts add up across logs on the same day: "read 3 pages", then later "read 8 more", is 11 pages.
- The day's status comes from its total, from any source (tap, voice, coach, widget), against that day's dated minimum and target:
  - below the minimum: progress noted but not counted ("1 of 10 pages, 1 more for your minimum");
  - at or above the minimum but below the target: done at the minimum level;
  - at or above the target: done.
- A habit without a minimum amount counts any amount above zero as the minimum.
- A range uses the lower number: "2-3 pages" is 2.
- Standard units convert (m and km, minutes and hours, ml and litres). A unit that can't be converted ("2-3 lines" for a pages habit) doesn't count toward the target, and nothing is logged as done; the reply says calmly that it's below the minimum.
- Choosing a level by tap raises the day's total to that level's target; it never lowers it.
- Every reply says where the person stands and what's left.
- Undo takes back the last amount added. Undoing a tap removes the day's log.
- Streaks, Grace Days, repair, the identity score and the Compound Forecaster all use the day's total and the dated target. The Forecaster also counts amounts below the minimum, because that is real work done.

### Day boundary

- A day ends at the user's local midnight, using the timezone on the user profile.
- Back-log is allowed until 24 hours after that midnight.
- "Missed" is never stored. It is computed from `habit_logs` once the back-log window closes.

### Skips

- A skip needs a reason, and it pauses the streak rather than breaking it.
- Each habit gets a maximum of 2 skips in any rolling 7 days.
- A 3rd skip within 7 days is treated exactly like a miss: a Grace Day can cover it, and Repair can fix it.

### Grace Days

- Earn 1 for every 7 consecutive scheduled days where every due habit was completed, at any Shrink level. Times-per-week habits are judged by the week instead (see Times per week).
- A skip pauses the 7-day count: it doesn't reset it and doesn't add to it.
- A repaired day counts toward the 7 days, because it was earned.
- A Grace-protected day resets the 7-day count.
- The bank holds a maximum of 3. When it's full, a new Grace Day is discarded.
- A Grace Day is spent automatically on the first miss that would break a streak.
- A spent Grace Day shows as "protected", not "done".
- A protected day keeps the streak alive but does not add to the count.

### Streak Repair

- After a miss, do 1.5x the target (rounded up) on the habit's next scheduled day after the missed day, with the normal 24-hour back-log for that day. Amounts added through that day count toward it, and the repair happens when the day's total reaches it.
- A sparse schedule never makes a miss unrepairable: on a Mon/Thu habit, a miss on Monday is repaired on Thursday.
- For yes/no habits, do the full version plus the minimum version again.
- One repair fixes one miss only, and only the most recent miss.
- Two misses in a row can't be repaired.
- A repaired day counts toward the streak, because it was earned by extra work.
- A repair made before the missed day's back-log window closes saves the Grace Day that would otherwise be spent.

### Modes

| Mode | Grace Days | Streak Repair | 24-hour back-log |
| --- | --- | --- | --- |
| Grace (default) | On | On | Allowed |
| Strict | Off | Off | Allowed |

Changing mode only affects days from then on.

### Times per week

A habit is set to specific days (the default: all seven, untick days to skip) or to a number of times per week, from 1 to 6. Choosing 7 means every day, so it becomes specific days with all seven ticked.

- Weeks run Monday to Sunday in the user's timezone.
- The habit shows on Today every day as "This week: 2 of 4" until the quota is met, then as done for the week. Extra sessions are allowed and counted.
- At most one session a day counts toward the quota. A session is a day done at any Shrink level; a day below the minimum isn't a session.
- No single day is ever a miss. When the quota is still reachable but tight, a calm hint: "2 more this week, 3 days left".
- A week that starts or ends part-way (the habit's first week, or its last before it ends) has a quota of the smaller of the quota and the days the habit is active that week.
- A week that ends below the quota is a missed week. A Grace Day covers it automatically, if one is available and the mode is Grace. Otherwise it can be repaired by doing one extra session the next week on top of the quota. One repair fixes one missed week only.
- The streak is counted in weeks ("6-week streak").
- For the Grace Day run, its days are neutral and its week is judged on its last day. A met week counts as 7 consistent days, so someone with only times-per-week habits still earns Grace Days. A repaired week keeps the run going. A missed week breaks it, and a Grace-covered week resets the count, as a protected day does.
- Identity score: a day with a session counts as done and other days are neutral. In a week that ended missed, the days after the last chance to meet the quota count as not done.
- The 30-day views and the heatmap show session days as done and other days as neutral. The Compound Forecaster uses sessions per week.
- Times per week is a dated setting, like the schedule, so changing it, or switching between specific days and times per week, never rewrites past weeks.

### Ending a habit

- "End this habit" is off by default. When on: after N calendar days from the start date, or on a date.
- The AI may suggest an end for clearly time-limited goals ("30-day challenge" means after 30 days), but never turns it on by itself.
- After the end, the habit isn't due, is never counted as missed, and its reminders stop. It moves to "Completed habits" with a short summary: days done, best streak, total amount.
- One calm celebration shows the next time the app opens.
- Restarting creates a new run, linked to the old one, whose history is kept. The new run's streak starts fresh.
- The end date can be edited, and is a dated setting.

### Changing a habit

- A change to a schedule, times per week, target, Shrink level, time of day or end date takes effect from the day it's made. Earlier days keep the settings they had.
- Streak Repair uses the target that applied on the missed day.
- The Compound Forecaster uses the target that applied on each day it reads.

### What a miss shows

| Stage | Label | Action |
| --- | --- | --- |
| Back-log window open | "Not logged yet" | Tap to log it |
| Window closed, can still be repaired | "Repair on Thu" (the repair day) | Repair on that day |
| Window closed, can't be repaired | "Not done" | None |

A Grace-covered miss shows as "Protected". That is a card state of its own.

### Streak moments

The streak chain draws each scheduled day as a node, joined by links, using the same marks as the habit card. It's on each Today card (the last 7 scheduled days), the habit detail (the last 30) and Progress (the last 14, still).

- **Fracture:** plays once, the next time the habit is on screen after a miss becomes final and can still be repaired. A miss whose repair day has already passed settles into a quiet gap with no animation.
- **Weld:** plays once after the log that completes a Streak Repair, from any source.
- **Protected:** a one-time shimmer on the shield when a Grace Day is spent.
- **Welcome back:** when 2 or more misses are waiting, or a miss and a weld, nothing animates. One card on Today says "Welcome back. Here's where things stand.", with each affected habit's chain in its end state and a repair line where one is still possible. No haptic. Got it marks them all as seen.
- A fresh install never plays history: everything already there is marked as seen.

### How results are computed

Streaks and Grace Days are computed purely from `habit_logs` and settings, so the result is identical whenever it's read. They can update lazily on read rather than in a nightly job. `pg_cron` is enabled when reminders are built.

### Time of day

- Each habit has a time of day: Morning, Afternoon, Evening or Anytime. It's asked in the form, with the AI (Pro) or the library (Free) pre-selecting one.
- Today shows a section for each, in that order. An empty one shows a quiet line, so a habit can be dragged into it.
- Within a section, habits keep the order they were dragged into, then go by reminder time.
- The user can change it any time: hold a card and drag it up or down (the other cards make room with a soft bounce, and it lands where it's dropped), or edit the habit.
- Pro: when peak hours show a habit is usually done in another part of the day, a coach card suggests moving it. It moves only if the user accepts, and a "Keep" is remembered.

### Progress definitions

**Identity score:** out of the last 30 days, the number of days where every due habit in that identity was done at any Shrink level. Repaired counts; protected doesn't. A skip with a reason, within the allowance of 2 a week, makes that habit not due that day; a 3rd skip counts as a miss. It's shown as "23 of 30 days". Days with no due habits in that identity are left out of the total.

**Compound Forecaster:**

- Count and duration habits use the average amount per scheduled day over the last 30 scheduled days, multiplied by the scheduled days in the next 365.
- Yes/no habits project the number of completions.
- An optional milestone on a habit (for example, 300 pages = 1 book) lets the forecast say "about 24 books".
- A slider lets the user try other consistency rates, from 50% to 100%.

**Peak hours:** the hour a habit is most often logged, from 5 or more same-day logs. Back-logs are left out, because they say when someone caught up, not when they did it.

**Reminders:** each habit sends its own reminder at its reminder time, on the days it's due, unless it's already logged. A times-per-week habit stops reminding once the week's quota is met, and an ended habit stops altogether. The default time follows the time of day (Morning 08:00, Afternoon 13:00, Evening 19:00, Anytime none), and the user can change or turn it off.

**Preemptive nudges:** at most one a day, on top of the habits' own reminders. It goes to the habit most at risk (under 90% over the last 14 days), 30 minutes before its usual time, and never to a habit whose own reminder is within an hour. It's cancelled if the habit is logged first. Each nudge is recorded as helped or ignored, and a habit stops getting them after 3 ignored in a row. For now they're local notifications with text written on the phone, so they only plan ahead when the app is opened. Server-sent nudges need remote push, which needs a development build.

### Scope decisions

- Expo gets the new UI first. Next.js is limited to the desktop 31-day grid and the weekly review.
- The demo data is deleted.
- The old weekly and monthly habits are removed. Times-per-week habits are part of v1 (see Streak rules); monthly goals are rebuilt in v2.

## Creating a habit

The form asks only for what can't be guessed well, and suggests even that:

1. **Name**, with live suggestions while typing. Targets in the name are parsed out: "Run 20 km" is Run with a target of 20 km; "Read 10 pages daily" is Read, 10 pages.
2. **Target** (amount and unit), from the name or suggested ("Run" 5 km, "Read" 10 pages, "Meditate" 10 min). Yes/no habits show no amount.
3. **Days:** "Specific days" (all seven ticked) or "Times per week" (1 to 6), with the suggested option pre-selected and a one-line reason ("rest days help you recover").
4. **Time of day:** Morning, Afternoon, Evening or Anytime, pre-selected.
5. **Minimum version:** free text, pre-filled with a suggestion ("Read at least 2 pages"), decoded into a structured minimum (2 pages) shown as a chip to confirm. For yes/no habits it stays a description.
6. **End this habit:** off by default; after N days or on a date.

Every suggestion follows the name as it changes, until the user edits that field. Everything else is inferred and shown in one compact card, "We set these up for you", with "Accept all" or tap a line to change it: habit type and unit, identity (an existing one or a new one, such as Run → The Athlete), reminder time, the setup-only level and voice aliases. The identity is never asked for at creation. Advanced settings (milestone and the rest) are in the habit's edit screen under "More".

- **Where suggestions come from:** the built-in library first. Pro asks the fast model only for habits the library doesn't know, after 3 or more characters and a pause of about 600 ms, with results cached. Suggestions appear in under 1.5 seconds. Free never calls a model.
- **Saving always works**, even when the AI is slow, down or unavailable: it falls back to the library and simple parsing, and the user can fill in the target.
- **Safe suggestions:** no extreme targets or frequencies; intense exercise keeps rest days. For clearly risky goals (very long fasts, extreme daily distances), it suggests a gentler start and says so calmly.

## Analytics

A detailed view of how each habit is going, in the spirit of YouTube Studio, kept calm: misses are hollow, never red, and every number explains itself.

### What is measured

Per habit and overall, for any date range, from `habit_logs`, `activity_events` and the dated settings (targets, schedules, times per week). Times-per-week habits are measured in weeks. A day below the minimum (`partial`) is shown but never counted as done. Repaired and protected days stay distinct everywhere.

- **Consistency:** completion rate (full and minimum separately), habit strength, current and best streak, repairs and Grace Days used, the full-vs-minimum ratio, recovery speed (average scheduled days from a miss to the next completion), skip count and the top skip reasons.
- **Volume** (count and duration habits): total amount, daily and weekly average, target hit rate (days at or above the full target), personal bests (best day, best week, longest run), milestones and the Compound Forecaster.
- **Timing:** completions by hour of day (same-day logs only, as for peak hours), completion rate by weekday, where logs came from (tap, voice, widget, notification, coach), and time from reminder to completion.
- **Comparisons:** this period against the one before it, habits ranked by strength and completion rate, identity scores, and habit pairs that tend to happen together. A pair is reported only with at least 20 days when both were due, and a phi correlation of 0.4 or more, so it never reports noise.

**Habit strength (0–100):** a forgiving exponential score, like Loop Habit Tracker's. It moves a little with every judged period and never resets to zero:

    strength = strength × k + value × (1 − k)        (starts at 0)

- Periods are scheduled days, or weeks for a times-per-week habit.
- value is 1 for full or repaired, 0.8 for minimum or setup, and 0 for a miss or a day below the minimum. Skipped, protected and pending periods leave it unchanged.
- k = 0.5^(1/13) for days, so a run of misses halves the score in 13 scheduled days; k = 0.5^(1/4) for weeks, so it halves in 4 weeks.
- It's shown as a whole number, multiplied by 100.

### Where it's computed

The heavy part runs in the database: each habit's status on every day and week of the range, worked out from logs, Grace Days, repairs and the dated settings, along with each day's amount, minimum, target, source, logged hour and skip reason. It's one SQL function, cached per person and range, and refreshed when anything changes (the cache key includes the latest `activity_events` time and the date, since days close as time passes). A year of data for 20 habits loads in under a second.

The metrics are sums and averages over those days, computed in `packages/core` (`metrics.ts`), so each one is unit-tested and the phone, the web and the AI service's insights all use the same numbers.

### Screens

Mobile first, with wide layouts for the future desktop app:

1. **Overview (the Progress tab):**
   - A range picker (7 days, 30 days, 90 days, 1 year, all time) with "Compare to previous period".
   - Four headline cards, each with a trend arrow against the previous period: completion rate, average habit strength, total done, best active streak.
   - Daily bars grouped by week: each bar is stacked full and minimum and coloured by identity, with a donut under each week showing that week's completion.
   - A habit ranking, then the insight cards.
2. **Habit detail** (tap a habit anywhere):
   - All the metrics above for that habit.
   - A habit strength line, the daily-by-week bars, a year heatmap (repaired, minimum, protected and hollow days distinct), and a weekday × hour heatmap.
   - The streak timeline with the chain marks, volume and personal bests, and skip reasons.
   - That habit's insights.
3. **Weekly report:** generated each Sunday and shown in the Sunday Review card: the week's completion, strongest and weakest habit, best day, and the change from last week.

Every chart can be tapped or hovered for the exact value and date, has a screen-reader label, and has an empty state that teaches ("Log a few days to see your best time"). Charts are drawn with react-native-svg, which already draws the chains and heatmap on the phone and the web. Colours come from theme tokens, so themes restyle them.

### Insights (Pro)

2–3 insights per view (overall and per habit), generated in the nightly job from the computed metrics and cached, so opening analytics never waits on the AI. Each states the number behind it ("You complete Read 40% of Thursdays vs 85% overall"). Free sees every chart and metric, with a calm "Insights are available on Pro" card in their place, and the server refuses insights without the entitlement.

- **Kinds:** weak weekday, wrong time of day, target too high (mostly minimum), getting stronger (a celebration), declining trend (a gentle check-in), helpful habit pairs, a reminder that isn't working.
- **One action each**, done in one tap after a confirmation: move the time of day, change the target, switch to times per week, add a reminder, or use the minimum on a given weekday.
  - Actions are recorded in `activity_events` with actor `ai_assisted`.
  - The insight then offers Undo.
  - A dismissed insight isn't shown again for 30 days.
- **Coach chat** can answer questions about the person's own analytics ("Why did my reading drop this month?") from the same metrics.
- **Tone:** calm, specific, never shaming.

## Voice assistant

Users will be able to log by voice without opening the app, but not with our own always-on "Hey \_\_\_" on every phone. iPhone reserves always-on listening for Siri. Android allows it, at a battery and privacy cost. So we go through the phone's assistant first and use our own wake word only where it works well.

### What phones allow (as of November 2026)

| Platform | Own always-on wake word? | How a third-party app gets voice |
| --- | --- | --- |
| iPhone | No — only "Hey Siri" listens in the background | App Intents and App Shortcuts: Apple says modern Siri support comes from App Intents, and SiriKit is legacy ([source](https://newly.app/how-to/add-siri-shortcuts)). Works from the lock screen, AirPods, Watch and CarPlay |
| Android | Yes, technically: a foreground service with a visible notification and an on-device wake-word engine | Google began removing Assistant from Android on 4 Sep 2026, with Gemini replacing it ([source](https://www.khaleejtimes.com/business/tech/google-assistant-is-being-discontinued-what-android-users-need-to-know)). Gemini's app control is still a beta for select food, grocery and rideshare apps ([source](https://www.neowin.net/news/googles-new-gemini-agent-on-android-can-now-use-3rd-party-apps-to-run-errands-for-you/)) |

### The four ways users will talk to it

1. **Through Siri (iPhone, v1):** "Hey Siri, log deep work in \[App\]" or "Hey Siri, I finished my run." Ships with App Shortcuts, so it works right after install with no setup.
2. **In-app assistant (both, v1):** while the app is open, say "Hey \[name\]" or hold the mic button. Full conversation: log, shrink, skip, ask the coach.
3. **One-tap voice (Android v1, iPhone v1):** a home-screen widget, lock-screen widget, Quick Settings tile (Android) and Action Button / Control Center control (iPhone). One tap, speak, done.
4. **Always listening (Android only, v3, opt-in):** "Hey \[name\]" with the app closed, off by default, with a clear battery warning. Gemini hand-off via Android AppFunctions comes in v2 once Google opens it beyond partner apps.

### How one voice log works

1. Speech becomes text on the device where the phone supports it (iOS Speech framework, Android SpeechRecognizer), in `en-IN` or `hi-IN`, with the command words and habit names as hints. Where a phone can't do that language on-device, its own recogniser may use its maker's servers. Our servers never receive audio.
2. The text goes to our intent parser: an LLM call with a small, fixed tool list — `log_habit`, `log_amount` (an amount, with its unit if one was said), `shrink_habit`, `skip_habit`, `undo_last`, `ask_coach` — and the user's habit list with its `voice_aliases`. Amounts follow the Amounts rules: "read 8 more" adds to the day, and a range uses the lower number.
3. Misheard words are found first, by sound and spelling against the command words and habit names, and offered to the parser as suggestions. Confidence then decides the reply, and the app always shows what it heard:
   - **Clear match:** log it and speak back. "Logged Deep Work. 12-day streak." With an undo for 10 seconds.
   - **A guess at a misheard word:** ask first. "Did you mean: Undo the last log?" with Yes and No.
   - **Can't tell:** say so, and show what it heard so it can be edited.
   - **Two possible habits:** ask once. "Deep work or workout?"
   - **No match:** offer to create the habit, never guess silently.
4. Offline: the log is queued on the device and synced later. Simple phrases ("done with X") are matched on-device without the LLM.

**iPhone, waiting for the paid Apple Developer account:** Siri via App Intents, the iPhone home and lock-screen widgets, and the Control Center control all need the paid account, to sign and test. They aren't written yet, because code that can't be compiled or tested could break the first iPhone build. When the account exists, the plan is:

- An App Intents extension with `LogHabitIntent` (habit, level), `UndoLastIntent` and `AskCoachIntent`, plus App Shortcuts phrases such as "Log \(habit) in Habit Tracker". It calls the same Supabase functions as the app, with the session shared through an App Group keychain.
- A WidgetKit extension for "Habits today" (home screen and lock screen), reading a snapshot the app writes to the App Group after each change, and logging through an App Intent on tap.
- Both added through config plugins, as the Android tile is, because `ios/` is generated.

**Tunnel Vision on iPhone** can't keep other apps closed the way Android does. That needs Apple's Screen Time API (`FamilyControls`), which needs an entitlement Apple grants on request. Until then iPhone gets the timer without the lock.

**Example phrases v1 must handle:** "I've completed my work" · "Read 15 pages" · "Did the minimum version of my run" · "Skip meditation today, I'm sick" · "Undo that."

**AI data:** while the AI service runs on a free tier, only test accounts and test data may reach the provider, because free-tier prompts and responses may be used by the provider and read by human reviewers. The service enforces this with `AI_PROVIDER_TIER=free` and the `AI_TEST_USER_IDS` allow-list. **Production must use a paid tier with no training on user data**, set explicitly with `AI_PROVIDER_TIER=paid`. Google allows only paid services for users in the EEA, Switzerland and the UK.

**Privacy rules:** wake-word detection runs on the device; no recordings are kept; transcripts are deleted after the log is written.

## Focus and Screen Time (Pro, after v1)

Planned for after the v1 launch, as part of Pro. **Nothing here is built yet.**

The goal is to connect phone app usage to habits, not to copy Digital Wellbeing. Usage matters here only where it helps or hurts a habit.

### Features

- **Per-app usage:** a view of time spent in each app, by day and week.
- **Quit habits tracked from usage:** a quit habit like "Less than 1 hour of Instagram" is logged automatically from that day's usage, with no tap needed.
- **App limits:** a daily limit per app or category.
- **Tunnel Vision blocks apps:** chosen apps are blocked while a focus session runs.
- **Earn your scroll** (optional): chosen apps unlock only after chosen habits are done for the day.
- **AI insights:** usage linked to habit performance, in the analytics style ("On days with over 2 hours of Instagram, you finish Read 30% less often").

### Android first

- **Usage:** `UsageStatsManager`, with the Usage Access permission the user grants in system settings.
- **Blocking:** an overlay activity, kept running by a foreground service of the special-use type.
- **Not AccessibilityService:** Play reviewers reject blockers that use it.

### iPhone later

- **API:** the Screen Time API (`FamilyControls`, `DeviceActivity`, `ManagedSettings`).
- **Needs:** Apple's Family Controls distribution entitlement, applied for early since it's a separate process from App Review, and the paid developer account.
- **Limits:** usage numbers can only be shown inside a `DeviceActivityReport` extension. They can't be read by the app or sent to our server, so AI usage insights are Android and desktop only. Limits, blocking and earn-your-scroll still work on iPhone.

### Desktop

The future desktop app can track app usage on Mac and Windows, with permission, linked to the workspace.

### Privacy

- Opt-in per person, and off by default.
- Processed on the device. Only daily totals per app or category are stored, never screen content.
- People can see everything stored, and delete it.

### Data

New `activity_events` kinds, so it plugs into analytics and game progress later:

- `screen.usage_daily`: one day's totals per app or category.
- `screen.limit_reached`: an app limit was hit.

## Long-term direction

A desktop app (Mac and Windows, likely wrapping the web app, for example with Tauri) comes later, followed by a Notion-like workspace whose design is not decided. Neither is being built now. Everything from now on must work for mobile and the future desktop app:

- **Shared core:** `packages/core` holds types, streak helpers, Supabase API functions, the AI client and design tokens. Mobile and web both import it, and screens stay thin.
- **Shared UI:** tokens and components work in React Native and on the web, with layouts that adapt to wide screens, mouse, hover and keyboard shortcuts.
- **Static web app:** the Next.js app builds as static files (`output: 'export'`), so it can be packaged as a desktop app.
- **Activity history:** `activity_events` is append-only and records every `habit_logs` change.
- **Privacy:** personal data (habits, logs, activity events, reflections, coach events) is readable only by its owner under RLS, with a test proving it.

## Roadmap

Launch lands at about week 24, assuming 2 developers and 1 designer. Each phase starts only when the gate before it is passed.

| Phase | Weeks | Deliverables | Gate to pass before next phase |
| --- | --- | --- | --- |
| 0 · Foundations | 1–2 | User interviews, design system, repo and Supabase setup, analytics events | — |
| 1 · Core tracker | 3–10 | Today screen, logging gestures, Shrink It ladder, identities, onboarding, the habit library and form, times-per-week habits, streaks (Grace Days, back-log, repair), reminders, widgets, Progress, desktop grid | 10 testers log daily for 2 weeks with no streak bugs |
| 2 · AI coach | 11–16 | Coach cards and chat, miss review, preemptive nudges, peak hours, Sunday Review, Future-Self letter, Why card, per-user AI cost limits | Coach nudges lead to a log more often than plain reminders |
| 3 · Voice assistant | 17–20 | Siri via App Intents, in-app voice with wake word, Android tile and voice widget, intent parser, 10-second undo, 200-phrase test set | 95% correct habit match on the voice test set |
| 4 · Beta and launch | 21–24 | Closed beta (50–100 users, 4 weeks), fixes, store listings, launch | Day-7 retention of 40% or more in the beta |
| v2 onward | after launch | Focus and Screen Time (Android first), Chrome blocker, pods, Gemini hand-off, Apple Watch; then gamification | — |

If the timeline slips, Phase 3 is the cut line: ship Siri and widgets, and move the in-app wake word to v2.

## Design workflow

Design runs one phase ahead of build: screens for phase N are tested before phase N starts coding.

**Design system (built in Phase 0):**

- Warm neutral base in light and dark mode, designed together; no pure white or black.
- One typeface with tabular numerals; three text sizes plus a display size for the Future-Self letter.
- 8 identity accent colours, each checked for contrast in both modes and for colour-blind users.
- Habit card states: due, done, done-minimum, skipped, not logged yet, missed (hollow), repaired (welded), protected.
- Motion: check-off under 400 ms with a haptic tick; fracture and weld animations for streaks.
- Touch targets: 48px minimum. The one exception is the desktop grid with a mouse, where cells are 36px so a month fits on screen. On touch screens they stay 48px.

**Screens in build order:**

1. Today (morning and evening states), habit card, long-press Shrink sheet, swipe-to-skip
2. Onboarding: create the first habits with the habit form (identity, time of day and reminders are suggested), then the streak rules card
3. Habit creation and editing
4. Progress: identity score, heatmap, streak history, forecaster
5. Coach card, coach chat, miss review, Sunday Review, Future-Self letter
6. Voice sheet, widgets, notification actions
7. Desktop: 31-day grid and weekly review

**Testing each batch:** a clickable prototype, 5 users per round, measured on time-to-log and whether they found the Shrink sheet without help.

## Testing, launch and metrics

We launch only after a closed beta proves people keep logging in week two. The targets below are our starting goals, to be adjusted after the first beta cohort.

**Testing**

- Unit tests on streak logic: back-log, Grace Days, repairs, timezone changes and daylight-saving shifts.
- A voice test set of 200+ real phrases, measured for correct habit match.
- Closed beta: TestFlight (iPhone) and Play closed testing (Android), 50–100 users for 4 weeks.

**Launch checklist**

- Store listing, screenshots and a 30-second video of voice logging
- Privacy policy covering voice, AI coach and data export
- Analytics events on every log, with its `source`
- Supabase Auth: turn Confirm email back on
- Supabase Auth: leaked password protection on
- Supabase Auth: custom email provider set up, so the built-in email limit can't block sign-ups
- Subscriptions through Apple and Google in-app purchase, as the stores require for digital features. RevenueCat is worth considering to handle both stores, receipts and the server's view of each plan. The server sets `users.plan` only from verified purchases.

| Metric | What it tells us | Starting target |
| --- | --- | --- |
| Time-to-log | Is logging effortless? | Under 2 seconds in the app |
| Day-7 retention | Did onboarding work? | 40% or more |
| Day-30 retention | Is the habit loop working? | 20% or more |
| Logs from outside the app | Are widgets, notifications and voice used? | 30% or more of all logs |
| Voice match accuracy | Does voice log the right habit? | 95% or more on the test set |
| Return after a miss | Does the no-shame design work? | 60% log again within 3 days |

## Risks and open decisions

The biggest risk is scope: v1 is already a tracker, a coach and a voice product. Cut voice to Siri-only before cutting the core tracker's polish.

| Risk | What we do |
| --- | --- |
| Timeline slips | Voice (Phase 3) is the cut line: ship Siri and widgets, move in-app wake word to v2 |
| AI coach costs grow with users | Cheap model for nudges and voice parsing; stronger model only for chat and letters; nightly batch jobs |
| Coach nudges feel spammy | Hard cap of 2 notifications a day; track which nudges lead to a log and drop the rest |
| Voice logs the wrong habit | `voice_aliases`, confirmation on low confidence, 10-second undo |
| Android always-on listening drains battery or fails store review | Kept to v3, opt-in only, tested on low-end devices first |
| Streak rules confuse users | One explainer card the first time each rule triggers |

**Open decisions**

- [ ] App name and the assistant's name (the wake word needs 2–3 distinct syllables). Not decided: the wake word waits, and "Coach" is the placeholder everywhere.
- [ ] Team size: the timeline assumes 2 developers plus 1 designer
- [ ] Pricing: free tier vs paid features (coach and voice are the natural paid tier)
- [ ] Launch markets and languages (Hindi voice support in v1 or later?)
