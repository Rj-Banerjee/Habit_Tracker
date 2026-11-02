"""Finds words speech recognition probably got wrong. It only suggests: the model sees
both versions and decides, because "and" sounds just like "undo" and a blind swap would
break sentences that were heard correctly."""

import re
from dataclasses import dataclass, field
from typing import Any

from metaphone import doublemetaphone
from rapidfuzz import fuzz

# The words people use to give commands, in the spelling the model should see.
COMMANDS = [
    "undo", "undo the", "undo that", "cancel", "take back", "remove", "wapas", "hata do",
    "skip", "skipped", "chhod do", "rehne do", "chhuti",
    "log", "did", "done", "finished", "completed", "ho gaya", "kar liya", "kar li", "kiya",
    "shrink", "minimum", "small version", "thoda", "bas",
    "pages", "glasses", "minutes",
]  # fmt: skip

# Everyday words that sound like commands. "And" is the same as "undo" phonetically.
LEAVE_ALONE = set(
    """a about after all am an and any are as at be been but by can could da de did do does
    done for from get go going got had has have he her here him his how i if in is it its
    just kar ke ki ko last latest let like made make me more most much my nahi no not now of
    on one only or our out over said she so some than that the their them then there these
    they this those to today too two up update us very was we went were what when where
    which who why will with would yes yesterday you your aaj hai hain main mera meri tha thi
    three four five six seven eight nine ten teen char glass good home car weather lovely
    keep missing mornings bought trees sick feel tired dat dis ai gaya gayi gai gya liya
    li lee kee gee pi pee piya sa jaunga glas sham""".split()
)

MATCH_AT = 0.78
# Same sound but spelled quite differently: worth suggesting, not worth acting on alone.
SAME_SOUND = 0.79
MIN_SPELLING = 0.4
LONG_CODE = 4
LONGEST_PHRASE = 2


@dataclass(frozen=True)
class Change:
    heard: str
    meant: str
    score: float


@dataclass
class Correction:
    text: str
    changes: list[Change] = field(default_factory=list)

    @property
    def score(self) -> float:
        """How sure the weakest fix is. 1 if nothing needed fixing."""
        return min((change.score for change in self.changes), default=1.0)


# Hindi speech recognition writes Devanagari, and the habit names are in Latin letters.
VOWELS = {"अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai",
          "ओ": "o", "औ": "au", "ऑ": "o"}  # fmt: skip
MATRAS = {"ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o",
          "ौ": "au", "ॉ": "o", "ृ": "ri"}  # fmt: skip
CONSONANTS = {"क": "k", "ख": "kh", "ग": "g", "घ": "gh", "च": "ch", "छ": "chh", "ज": "j",
              "झ": "jh", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t",
              "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b",
              "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
              "ष": "sh", "स": "s", "ह": "h"}  # fmt: skip
NUKTA = "़"
VIRAMA = "्"
NASALS = {"ं": "n", "ँ": "n"}


def romanise(text: str) -> str:
    out: list[str] = []
    chars = list(text.replace(NUKTA, ""))
    for index, char in enumerate(chars):
        if char in VOWELS:
            out.append(VOWELS[char])
        elif char in CONSONANTS:
            out.append(CONSONANTS[char])
            following = chars[index + 1] if index + 1 < len(chars) else ""
            # Hindi drops the vowel at the end of a word, so only a middle one is said.
            if following in CONSONANTS or following in NASALS:
                out.append("a")
        elif char in MATRAS:
            out.append(MATRAS[char])
        elif char in NASALS:
            out.append(NASALS[char])
        elif char != VIRAMA:
            out.append(char)
    return "".join(out)


def accent_neutral(word: str) -> str:
    """Spellings an Indian accent or a Hinglish writer swaps freely."""
    word = word.lower().replace(" ", "")
    for sounds_like, plain in (("v", "w"), ("th", "t"), ("dh", "d"), ("z", "j"), ("ph", "f"),
                               ("aa", "a"), ("ee", "i"), ("oo", "u")):  # fmt: skip
        word = word.replace(sounds_like, plain)
    return word


def codes(word: str) -> list[str]:
    return [code for code in doublemetaphone(accent_neutral(word)) if code]


def sounds_alike(heard: str, meant: str) -> float:
    return max(
        (fuzz.ratio(a, b) / 100 for a in codes(heard) for b in codes(meant)),
        default=0.0,
    )


def similarity(heard: str, meant: str) -> float:
    phonetic = sounds_alike(heard, meant)
    if phonetic < 0.75:
        return 0.0
    spelling = fuzz.ratio(accent_neutral(heard), accent_neutral(meant)) / 100
    score = 0.4 * spelling + 0.6 * phonetic
    # A short code matches too many words, so it needs help from the spelling.
    sure_of_sound = phonetic == 1.0 and (
        spelling >= MIN_SPELLING or max(map(len, codes(heard))) >= LONG_CODE
    )
    return max(score, SAME_SOUND) if sure_of_sound else score


def targets_for(habits: list[dict[str, Any]]) -> set[str]:
    names = [habit["title"].lower() for habit in habits]
    names += [alias.lower() for habit in habits for alias in habit.get("voice_aliases") or []]
    words = {word for name in names for word in name.split()}
    return set(COMMANDS) | set(names) | words


def correct(transcript: str, habits: list[dict[str, Any]]) -> Correction:
    tokens = re.findall(r"[\w']+", romanise(transcript).lower())
    targets = targets_for(habits)
    fixed: list[str] = []
    changes: list[Change] = []

    index = 0
    while index < len(tokens):
        word = tokens[index]
        if word in targets or word in LEAVE_ALONE or len(word) < 3 or word.isdigit():
            fixed.append(word)
            index += 1
            continue

        best: tuple[float, str, int] = (0.0, "", 1)
        for size in range(1, LONGEST_PHRASE + 1):
            heard = " ".join(tokens[index : index + size])
            for target in targets:
                score = similarity(heard, target)
                if score > best[0]:
                    best = (score, target, size)

        score, target, size = best
        if score >= MATCH_AT:
            heard = " ".join(tokens[index : index + size])
            if heard != target:
                changes.append(Change(heard, target, round(score, 2)))
            fixed.append(target)
            index += size
        else:
            fixed.append(word)
            index += 1

    return Correction(" ".join(fixed), changes)
