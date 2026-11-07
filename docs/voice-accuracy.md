# Voice accuracy

Measured on 2 Nov 2026 with `gemini-3.5-flash-lite` and made-up habits. The set is `backend/tests/voice_phrases.json`: 46 phrases, 39 of them mishearings. A phrase counts as right only if the app would do the right thing. Low confidence and "no match" change nothing, and medium asks first.

To repeat it, from `backend/`:

```
.venv/bin/python scripts/voice_accuracy.py --baseline
.venv/bin/python scripts/voice_accuracy.py
```

| Group | Phrases | Before | After |
| --- | --- | --- | --- |
| The failing phrase | 1 | 0 | 1 |
| English mishearings | 11 | 10 | 11 |
| Indian accent | 10 | 9 | 9 |
| Hinglish | 11 | 11 | 11 |
| Hindi | 6 | 6 | 6 |
| Clean speech | 4 | 4 | 4 |
| Nothing to do | 3 | 2 | 3 |
| **Total** | **46** | **42 (91%)** | **45 (98%)** |
| Wrong action taken | | 4 | 0 |

**Latest run, 2 Nov 2026:** 62 of 63 (98%) with 0 wrong actions. It adds 17 phrases: undo by name (6 of 6), skip and shrink by name (5 of 5), a habit that doesn't exist (5 of 5), and off-topic (4 of 4). The table above is the first measurement, kept for the before and after.

**Held-out run, 3 Nov 2026:** 150 of 154 (97%) on phrases written before scoring and not tuned against, with `backend/tests/voice_phrases_heldout.json`. With the 63 above, that's 212 of 217 (98%), which passes PLAN.md's 95% bar on typed phrases. 13 phrases hit a model outage on the first pass and were rerun, so those were scored later on the same model.

| Held-out miss | Heard as | Why it matters |
| --- | --- | --- |
| "on do gym" | Log Gym, without asking | The harmful one: it did the opposite. Fixed, so it now suggests undo and asks. Moved to the tuned set, leaving 153 held out |
| "aaj sirf thoda sa padha" | Shrink Study, without asking | Expected Read. "Padha" fits both, so it should have asked which |
| "I got through some of my novel" | Shrink Read, without asking | Right habit. Expected a full log, and the shrink is a fair reading |
| "I did my cardio" | Offered to create a habit | Safe. Expected "which habit?" |

After the fix, 9 of the 10 undo-by-name phrases pass with the live model. The miss is "and do my evening walk today please", which offers to log the walk but asks first.

- **The miss:** "medication done" for Meditate. It's a real word that sounds different, so it falls through to "didn't match", which is the safe way to fail.
- **Treat 98% with care.** I wrote these phrases and tuned the matcher against them, so a fresh set will score lower. PLAN.md's bar is 95% on 200+ real phrases, and that needs recordings of real speech.
- **Why the total hid the problem.** The first version scored 91% too, but one of its errors logged Read for "I bought a red car". Count wrong actions, not only the total.
- **The set is typed, not recorded.** Hindi and Hinglish did well, but real recordings may not.

**Re-run, 6 Nov 2026:** 150 of 153 held-out phrases (98%), the same three misses as on 3 Nov: "I got through some of my novel" (a shrink, fair), "aaj sirf thoda sa padha" (Study instead of Read, without asking) and "I did my cardio" (no match, safe). Five phrases hit a model outage and were rerun. So nothing has slipped since.

**The phone matcher:** Free uses it with no AI. On all 220 typed phrases it acts on 14, every one correctly, and never on half of a sentence that named two habits (`packages/core/src/voicePhrases.test.ts`). Everything else goes to "didn't catch that", the safe way to fail.

## Spoken test

The typed sets can't show what the phone's recogniser does to real speech. `packages/core/src/voiceSpoken.json` has 206 phrases to say aloud: the 138 held-out phrases that make sense spoken (not the deliberate mishearings), and 68 written on 6 Nov before any recording, never tuned against.

1. Start the AI service with `VOICE_SAMPLES_PATH` set in `backend/.env` (it's set on this Mac), so it saves to `backend/recordings/voice_spoken.jsonl`, which git ignores.
2. In a preview build, signed in as a test account: You → **Voice test (test builds only)**. Hold to talk and say each phrase. What the phone heard is saved; nothing is logged. Progress is kept between sittings.
3. Score it: `.venv/bin/python scripts/voice_accuracy.py --spoken recordings/voice_spoken.jsonl`. It says how many the phone heard word for word, then scores the parser on what it actually heard.

The service only accepts samples from test accounts, sends nothing to a model, and keeps only the phrase id, the transcript and the language.

### First full run (6 Nov 2026, Samsung, one speaker)

All 206 recorded. The phone heard 148 word for word; most differences were numbers written as digits and capital letters. The parser got **200 of 206 (97%)**, with every Hindi phrase right (16 of 16). Four of the six misses acted without asking.

Two rules came out of it. Neither is about a phrase, so the held-out phrases are still fair to measure with:

- **An undo only goes ahead without asking when they used a word for undoing** (undo, cancel, take back, remove, delete, wapas, hata and similar, in what was heard or the corrected text). "tick off study" was heard as "take off study" and the model undid Study at high confidence; now it asks first.
- **An amount on a yes/no habit is a plain log.** "ten minutes of meditation done" and "studied for two hours" came back as amounts on habits that have none. The app would have logged them in full but said "Logged 10 of Meditate".

Rescored with the real model after the change, together with every undo phrase from all three sets: both amount phrases now pass, "take off study" asks first, and no undo that was said plainly started asking. **With the fixes: 202 of 206 (98%), 2 done wrong without asking**, both the same as when typed ("I got through some of my novel" as the small version of Read, and "aaj sirf thoda sa padha" as Study). "I did my cardio" says no such habit instead of asking which one.

## Partial logging set (7 Nov 2026)

`backend/tests/voice_phrases_partial.json` has 20 phrases about amounts, written before scoring and never tuned against:
- ranges ("read 2-3 pages");
- adding more ("read 8 more");
- units that can't count ("read 2-3 lines", "500 ml" for a glasses habit);
- number words, Hinglish and Hindi.

The scorer now also checks the amount and unit when a phrase has them.

Live model: **19 of 20 (95%)**. The miss was "read 8 more", where the model gave "more" as the unit, which the server would have refused as a unit it can't convert. The parser now treats "more" and similar words as no unit, and the three "more" phrases rescored 3 of 3, so **20 of 20 with the fix**. The phone matcher still never does something that wasn't meant across all 240 typed phrases. The same 20 are in the spoken test as p001 to p020, still to be recorded.
