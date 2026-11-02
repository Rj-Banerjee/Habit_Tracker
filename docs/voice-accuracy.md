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

- **The miss:** "medication done" for Meditate. It's a real word that sounds different, so it falls through to "didn't match", which is the safe way to fail.
- **Treat 98% with care.** I wrote these phrases and tuned the matcher against them, so a fresh set will score lower. PLAN.md's bar is 95% on 200+ real phrases, and that needs recordings of real speech.
- **Why the total hid the problem.** The first version scored 91% too, but one of its errors logged Read for "I bought a red car". Count wrong actions, not only the total.
- **The set is typed, not recorded.** Hindi and Hinglish did well, but real recordings may not.
