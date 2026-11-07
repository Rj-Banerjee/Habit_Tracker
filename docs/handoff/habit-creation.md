# Hand-off: habit creation and editing

The screens that let someone add and edit a habit in the Expo app. Rewritten on 7 Nov 2026 for the habit form changes in PLAN.md ("Creating a habit", "Amounts", "Times per week", "Ending a habit", "Time of day"). The first version, with its 3-habit cap, is kept in `habit-creation-notes.md` for the record.

This is a UI task. Rules, validation, parsing, suggestions and data access live in shared code, so **don't write any of your own**. If something seems missing, stop and ask instead of working around it.

## Read first

- `PLAN.md`: Product summary, Creating a habit, and Streak rules (Amounts, Times per week, Ending a habit, Time of day)
- `packages/ui/src/index.ts`: the shared components
- `packages/core/src/habitForm.ts`, `habitSetup.ts`, `habitLibrary.ts` and `api.ts`
- `mobile/src/screens/TodayScreen.tsx`: the pattern to follow

## Rules

1. Keep screens thin. No streak rules, date logic, parsing or validation in a screen.
2. Use `tracker` from `mobile/src/services/tracker.ts` for all data, and `ai` from `mobile/src/services/ai.ts` for AI suggestions. Never import `supabase` in a screen.
3. Use tokens from `@habit-tracker/core` for every colour, size and space. No hex values or magic numbers.
4. Use shared components from `@habit-tracker/ui` before writing a new one.
5. No red, no pure white or black, no glassmorphism, no gradients.
6. Every interactive element is at least 48px tall and has an accessibility label.
7. No wording that blames the user, and no wording that pushes: suggestions are offers.
8. Don't add a dependency without asking.

## The create form

Only these fields, in this order. Everything else is in the review card.

| Field | Notes |
| --- | --- |
| Name | Required. Live suggestion chips under it from `suggestNames(text)`. Typing "Run 20 km" fills Name "Run" and Target 20 km, through `parseHabitName` |
| Target | Amount and unit. Hidden for yes/no habits. Pre-filled from the name, or from the suggestion |
| Days | `SegmentedControl`: "Specific days" (the `WeekdayPicker`, all seven ticked) or "Times per week" (a stepper, 1 to 6). The suggested option is pre-selected, with its one-line reason under it in small muted text. Choosing 7 on the stepper switches to Specific days with all seven ticked |
| Time of day | Four `Chip`s: Morning, Afternoon, Evening, Anytime. One is pre-selected |
| Minimum version | Free text, pre-filled with the suggestion. Under it, the decoded minimum from `decodeMinimum` as a chip to confirm ("Minimum: 2 pages"). For yes/no habits there's no chip; the text is the minimum |
| End this habit | A toggle, off by default. On: "After [N] days" or "On [date]". A suggested end ("30-day challenge") shows as a hint beside the toggle, and never turns it on |

Then the **"We set these up for you"** card, one line each: habit type and unit, identity, reminder time, the setup-only level, voice names. "Accept all" accepts them. Tapping a line opens a `BottomSheet` to change just that one. An identity line can pick an existing identity or name a new one (with its colour defaulting to the first unused of `IDENTITY_TOKENS`).

**Suggestions follow the name.** Each field shows the suggestion for the current name until the user edits that field; from then on, that field is theirs. Changing the name never overwrites a field they edited.

## Where suggestions come from

`useHabitSetup(name, minimumText)` in `mobile/src/hooks/` does all of this. The screen only renders what it returns.

1. The library, `matchLibrary(name)`. Instant. This is all Free ever uses.
2. On Pro, for a name the library doesn't know: `ai.suggestSetup` after 3+ characters and a 600 ms pause, cached per name. A reply for an older name is dropped.
3. Simple parsing (`parseHabitName`, `decodeMinimum`) fills anything still missing.

## Every screen state

| State | When | What the user sees |
| --- | --- | --- |
| Loading | Fetching identities or a habit | A small `ActivityIndicator`, with the label "Loading". No form yet |
| Load failed | Any fetch fails | "This couldn't load." with a "Try again" button. Never an empty form |
| Empty create | Opening the form | Blank name, all seven days, Anytime. Title: "New habit" |
| Suggesting | Waiting on the AI for an unknown habit | Fields keep what the library and parsing gave. A quiet "Finding suggestions…" line in the review card. Saving still works |
| Suggestion failed | The AI is slow, down, refused, or it's Free | Nothing on screen says it failed. The library and parsing values stay; for an unknown count habit the Target field is empty for the user to fill |
| Safety note | The suggestion was made gentler | One calm line under the target, from the suggestion's `note` ("Starting at 5 km a day is easier on your body. You can raise it any time.") |
| Field errors | Save pressed with problems | `validateHabitForm` errors under each field. Scroll to the first. Nothing is sent |
| Saving | Save pressed, form valid | Save button disabled. All fields stay visible |
| Save failed | The server refuses, or the network fails | `error.message` in a `FormMessage` above the button. Keep everything typed |
| Saved | Save succeeded | Return to Today, which refreshes and shows the habit in its time-of-day section if it's due |
| Habit tip | The save made the 7th active habit, and `shouldShowHabitTip` is true | Once only, on Today: "Starting with a few makes them stick." with "Got it". Never blocks anything |
| Unsaved changes | Back pressed after typing | "Discard your changes?" with "Keep editing" and "Discard" in a `BottomSheet` |

There is no habit limit and no "At the limit" state.

## The edit form

Title: "Edit habit". Name, Target, Days, Time of day, Minimum version and End this habit, as on create, filled from `habitFormFromDetail`. No live suggestions. Then a collapsed **"More"** with: identity, the full version's description, the minimum target, the setup-only level, reminder time, voice names and milestone. Type can't change.

An edit note sits above the save button: "Changes apply from today. Past days stay as they were." Archive stays as before: "Archive Read? Its history is kept." with "Archive" and "Keep".

## Wide screens

- At `useLayoutSize()` of `wide` or `desktop`, keep the form within `layout.readingWidth`, centred.
- The Tab key reaches every field in order, and focus stays visible.
- Enter in the last text field saves. Escape acts like Back.

## What "done" looks like

- [ ] `npm run typecheck` and `npm test` pass, with a test for every row of the state table.
- [ ] "Run 20 km" fills Run, 20 km, a running minimum, Morning and The Athlete.
- [ ] "Read" fills 10 pages, "Read at least 2 pages", every day.
- [ ] "Workout" suggests 4 times a week with its reason.
- [ ] A habit the library doesn't know still saves on Free and with the AI service stopped.
- [ ] A habit can be ended after N days or on a date, and switched between specific days and times per week.
- [ ] A server error keeps everything the user typed.
- [ ] Light and dark themes both checked, at 390px and 1200px wide.

## Out of scope

Bringing back archived habits, reordering within a section, and habit templates beyond the library.
