# Hand-off: coach chat and voice

The AI service, the shared client and the mobile screens are built. Coach cards, the drawer, the voice sheet and the You tab are in `mobile/src`.

## Run the service

From the repo root, with the phone on the same Wi-Fi as the Mac:

```
npm run ai
```

It installs the service on first run, writes this Mac's address to `EXPO_PUBLIC_AI_URL` in `mobile/.env`, and listens on port 8200. If the address changed, restart Expo with `npx expo start -c`.

On a free tier, only the user IDs in `AI_TEST_USER_IDS` get through. Everyone else gets `test_only`.

## Use it from an app

```ts
const ai = createAiClient({ baseUrl, getToken, fetch });
for await (const text of ai.chat(messages)) { /* append to the reply */ }
const intents = await ai.parseVoice(transcript);
```

Mobile must pass `fetch` from `expo/fetch`, because React Native's own fetch can't stream.

## What the app must do

- Show `error.message` from a `CoachError` as it is. These are already written for people.
- Treat AI as optional. If a call fails, the tracker carries on, and tapping still works.
- Keep the conversation on the client and send it each time. The service stores nothing.
- Voice returns intents and writes nothing. The app applies them through `logHabit`, `skipHabit` and `undoLog`, then shows the 10-second undo. An empty list means nothing matched, so ask them to try again.
- Send only the transcript, and drop it after the log is written.

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `busy` | 429 | Provider or throttle limit. `retry_after` says when to try again |
| `out_for_today` | 429 | Daily quota used |
| `too_many` | 429 | This person's hourly limit |
| `test_only` | 403 | Free tier, and not a test account |
| `refused` | 422 | The provider's safety filter blocked it |
| `unavailable` | 503 | Provider or tracker down |

## Voice in Expo Go

Hold-to-talk uses `expo-speech-recognition`, a native module that isn't in Expo Go. There, `speechInput()` returns null and the sheet shows only the text box, where the keyboard's own mic does the speech-to-text on the phone. A development build gets the hold-to-talk button with no code change. It runs on-device only, so a phone that can't do that also gets the text box. On web, the browser's speech recognition is used where it exists.

## Decisions

- Coach cards are made on the device from Today's data, so a card costs no AI call and still shows when the AI is down. Tapping one asks the coach.
- "Quick log my day" opens the voice sheet, and "I feel burned out" asks the coach. PLAN.md doesn't describe the chips, so these are my reading.
- `ask_which` joins the voice tools, for "Deep work or workout?".
- `coach_events` records the source, turn count and outcome of a chat, never its words.
- Voice logs are saved with source `voice` and actor `ai_assisted`.
- Plain "undo" phrases are matched on the device, so undo never depends on the AI.
- Rate-limit counters live in `tracker.ai_counters`. Only the service's secret key can reach them.

## Not done yet

- Offline voice logs and on-device matching of simple phrases, from PLAN.md's voice section.
- The wake word, Siri and widgets.
- The service isn't deployed, so a phone can only reach it on your own network.
