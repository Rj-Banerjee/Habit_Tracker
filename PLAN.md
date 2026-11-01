# Habit Tracker — Build Plan

Last updated: 1 Nov 2026

## Product summary

We ship a mobile-first habit tracker in about 24 weeks, in five phases: foundations, core tracker, AI coach, voice assistant, then beta and launch. Gamification, site blocking, wearables and pods come after launch.

**Positioning:** the habit tracker that adapts instead of punishes. It steps in before you fail, shrinks a habit when life gets hard, and keeps streaks meaningful without making them fragile.

**Design principles every screen follows:**

- **Calm by default, deep on demand.** Three surfaces for three time scales: Glance (Today, about 10 seconds), Reflect (evening, about 2 minutes), Review (Sunday, about 10 minutes).
- **Logging takes under 2 seconds**, from the app, a widget, a notification or your voice. Most days the user should not need to open the app at all.
- **Identity first.** Habits are grouped under identities ("The Athlete"), and each identity owns one accent colour.
- **No shame states.** Misses are hollow dots, never red. Coming back after a gap starts small.
- **Start with 3 habits.** More unlock after 2 consistent weeks.

## Scope by release

The launch release (v1) is the core tracker, the AI coach and voice logging. Everything else waits until real users tell us what matters.

| Area | v1 — launch | v2 — after launch | v3 — later |
| --- | --- | --- | --- |
| Tracking | Today screen; identities; yes/no, count, duration and quit habits; tap / long-press / swipe logging; Shrink It ladder (full, minimum, setup-only); evening back-log; 3-habit onboarding cap | Weekly routines and monthly goals; archetype routine templates; CSV import | — |
| Streaks | Fractured chain view; Grace Day bank; 24-hour back-log; 1.5x Streak Repair | — | — |
| Progress | Identity score; yearly heatmap; streak history; Compound Forecaster; top habits; desktop 31-day grid | Exportable reports | — |
| AI coach | Coach cards on Today; coach chat; miss review; preemptive nudges; peak hours from completion times; Sunday Review; Future-Self letter; "Why" card | Next-physical-action mode; worst-case prompts | — |
| Voice | Siri via App Intents; in-app voice (hold-to-talk + wake word while open); Android voice tile and widget | Gemini on Android via AppFunctions; Apple Watch | Opt-in always-listening wake word on Android |
| Reminders | Smart reminders, max 2 per day, actionable from the lock screen; home and lock-screen widgets | — | — |
| Focus | Tunnel Vision mode with a focus timer | Chrome extension: time budgets and in-page blocking | Geofenced reminders; wearable sync |
| Social and game | — | Accountability pods | Gamification (RPG, rewards) |

## Tech stack and architecture

One React Native codebase for iPhone and Android, a Next.js web app for desktop, and a backend on Supabase plus FastAPI — a stack you already work in.

```
Clients                     Backend                         External
Mobile app (RN + Expo)  ->  Supabase (Postgres, Auth,
Phone extensions        ->    Realtime; streak rules in SQL)
  (Siri, widgets, tile)         ^  reads logs / writes nudges
Web app (Next.js)       ->  AI service (FastAPI)        ->  Claude API
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
| LLM | Claude API | Small model for voice parsing and nudges; larger model for chat and letters |
| Speech | On-device speech-to-text; Picovoice Porcupine for the custom wake word | Fast, works offline, no audio sent to servers |
| Notifications | Expo Notifications (APNs and FCM) | Actionable notifications on both platforms |
| Scheduled jobs | Supabase cron + FastAPI workers | Nightly patterns, Sunday letters, preemptive nudges |
| Analytics | PostHog | Funnels, retention and log-source tracking |

## Data model

Eight core tables in Postgres cover v1. Streaks are computed from `habit_logs`, never stored as a counter, so back-logging and repairs can't drift out of sync.

| Table | Key fields | Notes |
| --- | --- | --- |
| `users` | id, timezone, wake\_time, tone (gentle / direct / drill), mode (strict / grace, default grace), assistant\_name | Timezone decides where "today" ends |
| `identities` | id, user\_id, name, colour\_token, why\_text, why\_image\_url | "The Athlete"; the Why card lives here |
| `habits` | id, identity\_id, title, type (boolean / count / duration / quit), target, unit, schedule (days, time window), voice\_aliases\[\] | `voice_aliases` lets "work" match "Deep work" |
| `habit_levels` | habit\_id, level (full / minimum / setup), description, target | The Shrink It ladder, defined at creation |
| `habit_logs` | id, habit\_id, date, level\_done, amount, status (done / skipped / repaired), skip\_reason, source (tap / widget / notification / siri / voice / coach), logged\_at | One row per habit per day; `source` tells us which surfaces get used. "Missed" is never stored (see Streak rules) |
| `grace_days` | user\_id, earned\_at, spent\_on\_habit, spent\_for\_date | Earned bank; spending one marks the day protected |
| `reflections` | user\_id, week\_start, wins\[3\], month\_note, mood\_line | Sunday Review and evening line |
| `coach_events` | id, user\_id, kind (nudge / miss\_review / letter / chat), payload, sent\_at, outcome | Every coach action and whether it helped; feeds the patterns |

A derived `user_patterns` view (best hours, weak weekdays, common skip reasons) is rebuilt nightly and given to the coach as context.

## Streak rules

These are the final rules for streaks. Streaks are computed from `habit_logs` using these rules.

### What counts

- All three Shrink levels (full, minimum, setup) count toward the streak.
- The level is stored, so Progress can show them differently.
- Unscheduled days are ignored.

### Day boundary

- A day ends at the user's local midnight, using the timezone on the user profile.
- Back-log is allowed until 24 hours after that midnight.
- "Missed" is never stored. It is computed from `habit_logs` once the back-log window closes.

### Skips

- A skip needs a reason, and it pauses the streak rather than breaking it.
- Each habit gets a maximum of 2 skips in any rolling 7 days.
- A 3rd skip within 7 days is treated exactly like a miss: a Grace Day can cover it, and Repair can fix it.

### Grace Days

- Earn 1 for every 7 consecutive scheduled days where every due habit was completed, at any Shrink level.
- A skip pauses the 7-day count: it doesn't reset it and doesn't add to it.
- The bank holds a maximum of 3.
- A Grace Day is spent automatically on the first miss that would break a streak.
- A spent Grace Day shows as "protected", not "done".
- A protected day keeps the streak alive but does not add to the count.

### Streak Repair

- After a miss, do 1.5x the target (rounded up) on the habit's next scheduled day after the missed day, with the normal 24-hour back-log for that day.
- A sparse schedule never makes a miss unrepairable: on a Mon/Thu habit, a miss on Monday is repaired on Thursday.
- For yes/no habits, do the full version plus the minimum version again.
- One repair fixes one miss only, and only the most recent miss.
- Two misses in a row can't be repaired.
- A repaired day counts toward the streak, because it was earned by extra work.

### Modes

| Mode | Grace Days | Streak Repair | 24-hour back-log |
| --- | --- | --- | --- |
| Grace (default) | On | On | Allowed |
| Strict | Off | Off | Allowed |

### Scope decisions

- Expo gets the new UI first. Next.js is limited to the desktop 31-day grid and the weekly review.
- The demo data is deleted.
- Weekly and monthly habits are removed, and rebuilt in v2.

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

1. Speech becomes text on the device (iOS Speech framework, Android SpeechRecognizer). No audio leaves the phone.
2. The text goes to our intent parser: an LLM call with a small, fixed tool list — `log_habit`, `log_amount`, `shrink_habit`, `skip_habit`, `undo_last`, `ask_coach` — and the user's habit list with its `voice_aliases`.
3. Confidence decides the reply:
   - **Clear match:** log it and speak back. "Logged Deep Work. 12-day streak." With an undo for 10 seconds.
   - **Two possible habits:** ask once. "Deep work or workout?"
   - **No match:** offer to create the habit, never guess silently.
4. Offline: the log is queued on the device and synced later. Simple phrases ("done with X") are matched on-device without the LLM.

**Example phrases v1 must handle:** "I've completed my work" · "Read 15 pages" · "Did the minimum version of my run" · "Skip meditation today, I'm sick" · "Undo that."

**Privacy rules:** wake-word detection runs on the device; no recordings are kept; transcripts are deleted after the log is written.

## Roadmap

Launch lands at about week 24, assuming 2 developers and 1 designer. Each phase starts only when the gate before it is passed.

| Phase | Weeks | Deliverables | Gate to pass before next phase |
| --- | --- | --- | --- |
| 0 · Foundations | 1–2 | User interviews, design system, repo and Supabase setup, analytics events | — |
| 1 · Core tracker | 3–10 | Today screen, logging gestures, Shrink It ladder, identities, 3-habit onboarding, streaks (Grace Days, back-log, repair), reminders, widgets, Progress, desktop grid | 10 testers log daily for 2 weeks with no streak bugs |
| 2 · AI coach | 11–16 | Coach cards and chat, miss review, preemptive nudges, peak hours, Sunday Review, Future-Self letter, Why card, per-user AI cost limits | Coach nudges lead to a log more often than plain reminders |
| 3 · Voice assistant | 17–20 | Siri via App Intents, in-app voice with wake word, Android tile and voice widget, intent parser, 10-second undo, 200-phrase test set | 95% correct habit match on the voice test set |
| 4 · Beta and launch | 21–24 | Closed beta (50–100 users, 4 weeks), fixes, store listings, launch | Day-7 retention of 40% or more in the beta |
| v2 onward | after launch | Chrome blocker, pods, Gemini hand-off, Apple Watch; then gamification | — |

If the timeline slips, Phase 3 is the cut line: ship Siri and widgets, and move the in-app wake word to v2.

## Design workflow

Design runs one phase ahead of build: screens for phase N are tested before phase N starts coding.

**Design system (built in Phase 0):**

- Warm neutral base in light and dark mode, designed together; no pure white or black.
- One typeface with tabular numerals; three text sizes plus a display size for the Future-Self letter.
- 8 identity accent colours, each checked for contrast in both modes and for colour-blind users.
- Habit card states: due, done, done-minimum, skipped, missed (hollow), repaired (welded).
- Motion: check-off under 400 ms with a haptic tick; fracture and weld animations for streaks.

**Screens in build order:**

1. Today (morning and evening states), habit card, long-press Shrink sheet, swipe-to-skip
2. Onboarding: pick an identity, create up to 3 habits with their minimum version, set reminders
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

- [ ] App name and the assistant's name (the wake word needs 2–3 distinct syllables)
- [ ] Team size: the timeline assumes 2 developers plus 1 designer
- [ ] Pricing: free tier vs paid features (coach and voice are the natural paid tier)
- [ ] Launch markets and languages (Hindi voice support in v1 or later?)
