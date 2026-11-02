import json
from pathlib import Path

import pytest

from app.speech_fix import correct, romanise

FIXTURE = json.loads(Path("tests/voice_phrases.json").read_text())
HABITS = FIXTURE["habits"]


def fixed(heard: str) -> str:
    return correct(heard, HABITS).text


def test_the_phrase_that_failed():
    result = correct("anduda latest update", HABITS)
    assert result.text.startswith("undo")
    assert result.changes[0].heard == "anduda"


@pytest.mark.parametrize(
    "heard,meant",
    [
        ("skeep the gym", "skip"),
        ("scape meditate", "skip"),
        ("mornin run", "morning run"),
        ("ewening walk", "evening"),
        ("stady done", "study"),
        ("dreenk vater", "drink water"),
        ("did my wark out", "workout"),
        ("completed medi tate", "meditate"),
        ("padai kar liya", "padhai"),
        ("I red 20 pages", "read"),
    ],
)
def test_mishearings(heard, meant):
    assert meant in fixed(heard)


@pytest.mark.parametrize(
    "heard",
    ["I read 20 pages", "undo that", "skip gym today", "why do I keep missing mornings"],
)
def test_clean_speech_is_left_alone(heard):
    result = correct(heard, HABITS)
    assert result.changes == []
    assert result.score == 1.0


def test_a_loose_sound_match_alone_is_not_enough():
    assert "jog" not in fixed("evening vok done")


def test_and_is_not_undo():
    assert "undo" not in fixed("I read and ran")


@pytest.mark.parametrize("word", ["gaya", "gayi", "liya", "piya"])
def test_hinglish_words_stay(word):
    assert correct(f"gym ho {word}", HABITS).changes == []


def test_a_habit_only_this_person_has_is_matched():
    habits = [{"title": "Sitar practice", "voice_aliases": []}]
    assert "sitar" in correct("seetar practice done", habits).text


def test_the_weakest_fix_sets_the_score():
    result = correct("anduda skeep", HABITS)
    assert result.score == min(change.score for change in result.changes)


def test_devanagari_becomes_latin_for_matching():
    assert romanise("जिम") == "jim"
    assert romanise("पानी") == "panee"
    assert "wapas" in fixed("वापस कर दो")
    assert "padhai" in fixed("पढ़ाई कर ली")


def test_nothing_in_a_transcript_crashes_it():
    for heard in ["", "!!!", "123", "😀 done"]:
        correct(heard, HABITS)


def test_the_set_has_enough_mishearings():
    misheard = [p for p in FIXTURE["phrases"] if p["group"] not in ("clean", "no_action")]
    assert len(misheard) >= 31
    assert any(p["heard"] == "anduda latest update" for p in misheard)


@pytest.mark.parametrize("heard", ["on do gym", "and do my run", "un do the read"])
def test_two_words_that_sound_like_undo(heard):
    result = correct(heard, HABITS)
    assert result.text.startswith("undo ")
    assert result.changes[0].meant == "undo"


@pytest.mark.parametrize("heard", ["run and do gym", "on do", "on the gym"])
def test_leaves_other_uses_of_those_words(heard):
    assert correct(heard, HABITS).changes == []
