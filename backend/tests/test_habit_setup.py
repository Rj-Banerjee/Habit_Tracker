import pytest

from app import habit_setup
from app.auth import CurrentUser, current_user
from app.llm.base import Tier, ToolCall
from app.main import SETUP_CACHE, app

from .fakes import FakeProvider
from .test_api import api, use  # noqa: F401  (the api fixture)

WORKOUT = {
    "type": "duration", "target": 45, "unit": "min", "minimum_text": "Work out for 15 minutes",
    "minimum_target": 15, "setup": "Pack your gym bag", "frequency": "per_week", "per_week": 4,
    "reason": "Rest days help your muscles recover.", "time_of_day": "morning",
    "identity": "The Athlete", "voice_aliases": ["gym", "workout"], "suggested_end_days": None,
    "note": None,
}  # fmt: skip


@pytest.fixture(autouse=True)
def empty_cache():
    SETUP_CACHE.items.clear()


def suggest(api, arguments, name="Kettlebell flow"):  # noqa: F811
    provider = use(FakeProvider(calls=[ToolCall("suggest_setup", arguments)]))
    return api.post("/habits/suggest", json={"name": name}), provider


def test_suggests_a_setup_with_the_fast_model(api):  # noqa: F811
    response, provider = suggest(api, WORKOUT)
    assert response.status_code == 200
    assert response.json() == WORKOUT
    assert provider.seen[0]["tier"] == Tier.FAST
    assert provider.seen[0]["messages"][0].text == "Kettlebell flow"


def test_tells_the_model_their_identities_and_habits(api):  # noqa: F811
    _, provider = suggest(api, WORKOUT)
    system = provider.seen[0]["system"]
    assert "The Reader" in system
    assert "Read, Run" in system


def test_a_common_habit_costs_one_model_call(api):  # noqa: F811
    _, provider = suggest(api, WORKOUT, "Kettlebell Flow")
    again = api.post("/habits/suggest", json={"name": "kettlebell flow!"})
    assert again.json() == WORKOUT
    assert provider.opened == 1


@pytest.mark.parametrize(
    "name,arguments,expected",
    [
        ("Read", {**WORKOUT, "type": "count", "target": 10, "unit": "pages", "frequency": "days", "per_week": None},
         {"frequency": "days", "per_week": None, "target": 10}),
        ("Deep clean", {**WORKOUT, "type": "boolean", "frequency": "per_week", "per_week": 1},
         {"frequency": "per_week", "per_week": 1, "target": None, "unit": None}),
        ("Workout", WORKOUT, {"frequency": "per_week", "per_week": 4}),
    ],
)  # fmt: skip
def test_suggestions_for_reading_a_workout_and_a_weekly_chore(api, name, arguments, expected):  # noqa: F811
    body = suggest(api, arguments, name)[0].json()
    assert {key: body[key] for key in expected} == expected


def test_units_come_back_in_the_apps_spelling(api):  # noqa: F811
    body = suggest(api, {**WORKOUT, "unit": "Minutes"}, "Practise calligraphy")[0].json()
    assert body["unit"] == "min"


def test_never_suggests_intense_exercise_every_day(api):  # noqa: F811
    body = suggest(api, {**WORKOUT, "frequency": "days", "per_week": None}, "Morning run club")[0].json()
    assert (body["frequency"], body["per_week"]) == ("per_week", 4)
    assert body["reason"] == "Rest days help your body recover."


def test_an_extreme_target_starts_gentler_and_says_so(api):  # noqa: F811
    body = suggest(api, {**WORKOUT, "type": "count", "target": 60, "unit": "km"}, "Ultra plan")[0].json()
    assert body["target"] == 5
    assert body["note"] == "Starting at 5 km a day is easier on your body. You can raise it any time."


def test_a_long_fast_is_built_up_to(api):  # noqa: F811
    arguments = {**WORKOUT, "type": "duration", "target": 48, "unit": "hours", "frequency": "per_week", "per_week": 1}
    body = suggest(api, arguments, "Water fast")[0].json()
    assert body["target"] == 12
    assert "doctor" in body["note"]


def test_a_bad_reply_cannot_suggest_anything_harmful(api):  # noqa: F811
    arguments = {"type": "rocket", "target": -4, "per_week": 12, "frequency": "per_week",
                 "time_of_day": "3am", "voice_aliases": ["a", 7, "", "b", "c", "d"], "suggested_end_days": 9999}  # fmt: skip
    body = suggest(api, arguments, "Polish telescopes")[0].json()
    assert body["type"] == "boolean"
    assert body["target"] is None
    assert (body["frequency"], body["per_week"]) == ("days", None)
    assert body["time_of_day"] == "anytime"
    assert body["voice_aliases"] == ["a", "b", "c"]
    assert body["suggested_end_days"] is None


def test_no_suggestion_is_unavailable_so_the_app_falls_back(api):  # noqa: F811
    use(FakeProvider(calls=[]))
    response = api.post("/habits/suggest", json={"name": "Polish telescopes"})
    assert response.status_code == 503


def test_free_never_reaches_the_model(api):  # noqa: F811
    provider = use(FakeProvider(calls=[ToolCall("suggest_setup", WORKOUT)]))
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person-free", "token")
    assert api.post("/habits/suggest", json={"name": "Polish telescopes"}).status_code == 403
    assert provider.opened == 0


def test_needs_three_letters(api):  # noqa: F811
    assert api.post("/habits/suggest", json={"name": "ab"}).status_code == 422


def test_the_cache_forgets_the_oldest():
    cache = habit_setup.SetupCache(size=2)
    for key in ("a", "b", "c"):
        cache.put((key,), {"k": key})
    assert cache.get(("a",)) is None
    assert cache.get(("c",)) == {"k": "c"}
