# Hand-off: habit creation and editing

Build the screens that let someone add and edit a habit in the Expo app.

This is a UI task. Rules, validation and data access already exist, so **don't write any of your own**. If something seems missing, stop and ask instead of working around it.

## Read first

- `PLAN.md`: Product summary, Design workflow and Streak rules
- `packages/ui/src/index.ts`: the shared components
- `packages/core/src/habitForm.ts` and `packages/core/src/api.ts`
- `mobile/src/screens/TodayScreen.tsx`: the pattern to follow

## Rules

1. Keep screens thin. No streak rules, date logic or validation in a screen.
2. Use `tracker` from `mobile/src/services/tracker.ts` for all data. Never import `supabase` in a screen.
3. Use tokens from `@habit-tracker/core` for every colour, size and space. No hex values or magic numbers.
4. Use shared components from `@habit-tracker/ui` before writing a new one.
5. Don't change anything in `packages/`, `supabase/`, `frontend/` or `PLAN.md`. Ask if you think you need to.
6. No red, no pure white or black, no glassmorphism, no gradients.
7. Every interactive element is at least 48px tall and has an accessibility label.
8. No wording that blames the user.
9. Don't add a dependency without asking.

## Files to create

| File | What it is |
| --- | --- |
| `mobile/src/screens/HabitFormScreen.tsx` | The form, for both creating and editing |
| `mobile/src/screens/HabitFormScreen.test.tsx` | Tests for every state below |
| `mobile/src/hooks/useHabitForm.ts` | Loads, holds and saves form state |
| `mobile/src/habits/IdentitySection.tsx` | Choose an identity, or add one |

## Files to change

| File | Change |
| --- | --- |
| `mobile/src/screens/TodayScreen.tsx` | Add an "Add habit" button, and show it in the empty state |
| `mobile/src/today/ShrinkSheet.tsx` | Add an "Edit habit" option |
| `mobile/App.tsx` | Show the form when asked. There is no router yet, so use a simple state switch |

## Shared code to use

**Components from `@habit-tracker/ui`:** `TextField`, `SegmentedControl`, `WeekdayPicker`, `ColourPicker`, `Chip`, `Button`, `FormMessage`, `Text`, `useTheme`, `useLayoutSize`.

**Helpers from `@habit-tracker/core`:** `emptyHabitForm`, `validateHabitForm`, `hasErrors`, `toHabitInput`, `habitFormFromDetail`, `habitLimitMessage`, `HABIT_TYPE_LABELS`, `IDENTITY_TOKENS`, plus the `space`, `radius` and `layout` tokens.

**API from `tracker`:**

| Function | Use |
| --- | --- |
| `getHabitAllowance()` | Returns `{ allowed, active, can_add }`. Call it when opening the create form |
| `listIdentities()` | Fills the identity choices |
| `createIdentity(userId, name, colourToken, whyText)` | Adds an identity |
| `createHabit(toHabitInput(values))` | Saves a new habit. The server enforces the limit |
| `getHabit(id)` | Loads a habit to edit. Pass the result to `habitFormFromDetail` |
| `updateHabit(id, changes)` | Saves edits. Pass only what changed |
| `archiveHabit(id)` | Removes a habit from Today and keeps its history |

## Form fields, in order

| Field | Shown | Notes |
| --- | --- | --- |
| Identity | Always | See Identity section |
| Name | Always | `title`. Required |
| Type | Create only | `SegmentedControl` using `HABIT_TYPE_LABELS`. A habit's type can't change later |
| Target and unit | Count and duration only | `target` is required. Number keyboard |
| Days | Always | `WeekdayPicker`. At least one day |
| Full version | Always | `fullDescription`. Optional: defaults to the name |
| Minimum version | Always | `minimumDescription`. Required. Hint: "The smallest version that still counts on a hard day." |
| Minimum target | Count and duration only | `minimumTarget`. Optional |
| Just set up | Always | `setupDescription`. Optional. Hint: "The first step, like putting on your shoes." |
| Voice names | Under "More options" | `voiceAliases`, comma separated. Hint: "Other names you might say out loud." |
| Milestone | Under "More options" | `milestoneAmount` and `milestoneLabel`. Hint: "For example, 300 pages = 1 book." |

The form scrolls. "More options" starts collapsed.

## Every screen state

| State | When | What the user sees |
| --- | --- | --- |
| Loading | Fetching allowance, identities or a habit | A small `ActivityIndicator`, with the label "Loading". No form yet |
| Load failed | Any fetch fails | "This couldn't load." with a "Try again" button. Never an empty form |
| At the limit | `can_add` is false on create | No form. Show `habitLimitMessage(allowed, active)`, with a "Back" button |
| Empty create | Opening the form, under the limit | Blank form. Title: "New habit". Identity preselected if there is only one |
| No identities yet | `listIdentities()` returns nothing | Show the add-identity fields in place of the choices |
| Editing | Opening with a habit | Filled form. Title: "Edit habit". Type is hidden |
| Field errors | Save pressed with problems | `validateHabitForm` errors under each field. Scroll to the first. Nothing is sent |
| Saving | Save pressed, form valid | Save button disabled. All fields stay visible |
| Save failed | The server refuses, or the network fails | Show `error.message` in a `FormMessage` above the button. Keep everything typed |
| Limit reached on save | Server says "You have reached your habit limit." | Same as Save failed. This can happen if another device added a habit |
| Saved | Save succeeded | Return to Today, which refreshes and shows the habit if it's due |
| Unsaved changes | Back pressed after typing | Ask "Discard your changes?" with "Keep editing" and "Discard" in a `BottomSheet` |
| Archive | "Archive habit" pressed, edit only | Confirm in a `BottomSheet`: "Archive Read? Its history is kept." with "Archive" and "Keep" |

An edit note sits above the save button: "Changes apply from today. Past days stay as they were."

## Identity section

- Show existing identities as `Chip`s.
- "New identity" reveals a name field, `ColourPicker` and an optional "Why this matters" field.
- Default the colour to the first of `IDENTITY_TOKENS` that isn't in use.
- Create the identity when the habit is saved, not before.
- An identity name is required, up to 80 characters.

## The 3-habit cap

- The server enforces it. Your job is to explain it, not to count.
- Don't hide "Add habit" at the limit. Tapping it shows the At the limit state.
- Archived habits don't count, and the server handles that.

## Wide screens

- At `useLayoutSize()` of `wide` or `desktop`, keep the form within `layout.readingWidth`, centred.
- The Tab key reaches every field in order, and focus stays visible.
- Enter in the last text field saves. Escape acts like Back.

## What "done" looks like

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes, including new tests for every row of the state table.
- [ ] A habit can be created for each of the four types, and appears on Today when due.
- [ ] Editing a habit changes today without changing past days.
- [ ] Creating a 4th habit on a new account shows the At the limit state.
- [ ] Archiving removes a habit from Today, and frees a slot.
- [ ] A server error keeps everything the user typed.
- [ ] `npx expo start --web` logs no errors or warnings on any state.
- [ ] Light and dark themes both checked, at 390px and 1200px wide.
- [ ] Nothing changed outside the files listed above.

## Out of scope

Reminders, onboarding, habit templates, reordering habits, and bringing back archived habits.
