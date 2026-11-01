# Hand-off: coach chat and voice

The AI service and the shared client are done and tested. The screens aren't built.

## Run the service

```
cd backend
python3.13 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --port 8200
```

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

## Not done yet

- `coach_events` isn't written, because that needs the secret key on the service.
- Limits are in memory, so they reset on restart and need shared storage before running more than one process.
- The service isn't deployed, so a phone can only reach it on your own network.
