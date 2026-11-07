import random
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import connections
from app.config import get_settings
from app.llm.base import ToolCall, Unavailable
from app.main import app

from .fakes import FakeProvider
from .test_jobs import SECRET, FakeJobDb, FakePush

TODAY = date(2026, 11, 8)
DAYS = 90


def habit(hid: str, title: str, **patch) -> dict:
    return {
        "id": hid, "title": title, "type": "boolean", "unit": None, "frequency": "days", "per_week": None,
        "time_of_day": "anytime", "starts_on": (TODAY - timedelta(days=DAYS - 1)).isoformat(), **patch,
    }  # fmt: skip


def day(hid: str, on: date, done: bool, amount=None, skip_reason=None) -> dict:
    status = "skipped" if skip_reason else ("done" if done else "missed")
    return {
        "habit_id": hid, "date": on.isoformat(), "status": status,
        "level_done": "full" if done else None, "amount": amount if done else None, "skip_reason": skip_reason,
    }  # fmt: skip


def dates():
    return [TODAY - timedelta(days=offset) for offset in range(DAYS - 1, 0, -1)]


def noise(hid: str, seed: str, rate: float = 0.6) -> list[dict]:
    rng = random.Random(seed)
    return [day(hid, on, rng.random() < rate) for on in dates()]


def planted(seed: str = "plant", tired_skips: float = 0.3):
    """Long runs leave the next day tired, and Study slips then. Read and Stretch are
    coin flips that have nothing to do with anything."""
    rng = random.Random(seed)
    habits = [
        habit("run", "Run", type="count", unit="km", time_of_day="morning"),
        habit("study", "Study", time_of_day="evening"),
        habit("read", "Read", time_of_day="evening"),
        habit("stretch", "Stretch"),
    ]
    days, checkins = [], []
    long_before = False
    for on in dates():
        ran = rng.random() < 0.55
        km = (rng.choice([16, 18, 21]) if rng.random() < 0.45 else rng.choice([5, 6, 8])) if ran else None
        days.append(day("run", on, ran, km))
        # Tired after yesterday's long run, and Study mostly doesn't happen.
        studied = rng.random() < (0.3 if long_before else 0.85)
        reason = "tired" if long_before and not studied and rng.random() < tired_skips else None
        days.append(day("study", on, studied, skip_reason=reason))
        energy = rng.choice([1, 2, 2]) if long_before else rng.choice([3, 4, 4, 5])
        checkins.append({"date": on.isoformat(), "energy": energy, "sleep_hours": rng.choice([6.5, 7, 7.5, 8]), "mood": rng.choice([3, 4])})
        long_before = bool(km and km > 10)
    days += noise("read", f"{seed}-read") + noise("stretch", f"{seed}-stretch")
    return {"analytics": {"today": TODAY.isoformat(), "habits": habits, "days": days, "weeks": []}, "checkins": checkins, "changes": []}


def kinds_between(found, a: str, b: str) -> set[str]:
    return {f["kind"] for f in found if [s.get("id", s.get("name")) for s in f["subjects"]] == [a, b]}


# ---------------------------------------------------------------------------
# The statistics
# ---------------------------------------------------------------------------


def test_fisher_matches_the_textbook():
    # The lady tasting tea, one-sided 0.0014 so two-sided about 0.0028.
    assert connections.fisher(1, 9, 11, 3) == pytest.approx(0.002759, abs=1e-5)
    assert connections.fisher(5, 5, 5, 5) == pytest.approx(1.0)


def test_benjamini_hochberg_corrects_for_many_tests():
    adjusted = connections.benjamini_hochberg([0.01, 0.04, 0.03, 0.005])
    assert adjusted == pytest.approx([0.02, 0.04, 0.04, 0.02])


def test_spearman_sees_a_steady_rise():
    rho, p = connections.spearman([1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 5, 7, 9, 10, 12, 15], "x")
    assert rho == pytest.approx(1.0)
    assert p < 0.01


# ---------------------------------------------------------------------------
# The engine
# ---------------------------------------------------------------------------


def test_the_hidden_run_tiredness_study_pattern_is_found():
    found = connections.find(planted())
    after_long = next(f for f in found if f["kind"] == "after_big_amount" and f["key"] == "after_big_amount:run:study")
    assert after_long["direction"] == "competes"
    assert after_long["numbers"]["after_big"] < after_long["numbers"]["otherwise"] - 20
    assert after_long["numbers"]["unit"] == "km"
    assert after_long["numbers"]["at_least"] == 16
    assert "competes" in {f["direction"] for f in found if f["key"] == "next_day_energy:run"}
    assert any(f["key"] == "signal:energy:study" and f["direction"] == "competes" for f in found)


def test_a_reason_given_mostly_after_one_habit_is_found():
    found = connections.find(planted(tired_skips=0.7))
    tired = next(f for f in found if f["key"] == "skip_reason:run:study:tired")
    assert tired["numbers"]["after"] == tired["numbers"]["times"]


def test_every_finding_carries_its_numbers():
    for finding in connections.find(planted()):
        assert finding["sample"] >= connections.MIN_GROUP * 2 or finding["kind"] == "overload"
        assert finding["p_value"] < connections.ALPHA
        assert finding["confidence"] in ("high", "medium")
        assert finding["numbers"]
        assert finding["range_to"] == TODAY.isoformat()


def test_coin_flip_habits_are_never_linked():
    found = connections.find(planted())
    for finding in found:
        ids = {s.get("id") for s in finding["subjects"]}
        assert not ids & {"read", "stretch"}, finding


@pytest.mark.parametrize("seed", ["a", "b", "c", "d", "e"])
def test_pure_noise_finds_nothing(seed):
    habits = [habit(f"h{i}", f"Habit {i}", time_of_day=t) for i, t in enumerate(["morning", "evening", "anytime", "anytime"])]
    days = [d for h in habits for d in noise(h["id"], f"{seed}-{h['id']}")]
    rng = random.Random(seed)
    checkins = [{"date": on.isoformat(), "energy": rng.randint(1, 5), "sleep_hours": rng.choice([5, 6, 7, 8]), "mood": rng.randint(1, 5)} for on in dates()]
    assert connections.find({"analytics": {"today": TODAY.isoformat(), "habits": habits, "days": days, "weeks": []}, "checkins": checkins}) == []


def test_the_same_data_gives_the_same_findings():
    assert connections.find(planted()) == connections.find(planted())


def test_nothing_before_21_days():
    data = planted()
    since = (TODAY - timedelta(days=15)).isoformat()
    data["analytics"]["days"] = [d for d in data["analytics"]["days"] if d["date"] >= since]
    assert connections.find(data) == []


def test_a_side_of_7_days_is_too_few():
    assert connections.compare_rates("x", "x", [], "with", "without", [1] * 7, [0] * 30) is None
    assert connections.compare_rates("x", "x", [], "with", "without", [1] * 8, [0] * 13) is not None


def test_a_small_difference_is_not_reported_however_certain():
    # 60% against 45% over hundreds of days: real, but under 20 points.
    candidate = connections.compare_rates("x", "x", [], "with", "without", [1] * 120 + [0] * 80, [1] * 90 + [0] * 110)
    assert candidate.p < 0.01
    assert not candidate.big_enough


def test_two_habits_in_one_part_of_the_day_that_rarely_both_happen_clash():
    habits = [habit("gym", "Gym", time_of_day="evening"), habit("cook", "Cook", time_of_day="evening")]
    days = []
    for i, on in enumerate(dates()):
        gym = i % 2 == 0
        days += [day("gym", on, gym), day("cook", on, not gym or i % 8 == 0)]
    found = connections.find({"analytics": {"today": TODAY.isoformat(), "habits": habits, "days": days, "weeks": []}})
    clash = next(f for f in found if f["kind"] == "clash")
    assert clash["numbers"]["part"] == "evening"
    assert clash["numbers"]["both"] < clash["numbers"]["expected"]


def test_older_habits_slipping_after_a_new_one_is_overload():
    added = TODAY - timedelta(days=30)
    habits = [habit("a", "Read"), habit("b", "Walk"), habit("new", "Cold shower", starts_on=added.isoformat())]
    days = []
    for on in dates():
        after = on >= added
        days += [day("a", on, not after or on.day % 3 == 0), day("b", on, not after or on.day % 2 == 0)]
        if after:
            days.append(day("new", on, True))
    found = connections.find({
        "analytics": {"today": TODAY.isoformat(), "habits": habits, "days": days, "weeks": []},
        "changes": [{"habit_id": "new", "date": added.isoformat(), "kind": "added"}],
    })  # fmt: skip
    overload = next(f for f in found if f["kind"] == "overload")
    assert overload["subjects"][0]["id"] == "new"
    assert {h["title"] for h in overload["numbers"]["habits"]} == {"Read", "Walk"}


def test_times_per_week_habits_are_left_out_of_day_comparisons():
    data = planted()
    data["analytics"]["habits"][1]["frequency"] = "per_week"
    assert not any("study" in f["key"] for f in connections.find(data))


# ---------------------------------------------------------------------------
# The nightly job
# ---------------------------------------------------------------------------


class ConnectionDb(FakeJobDb):
    def __init__(self):
        super().__init__()
        self.people = [{"user_id": "test-user", "plan": "free"}, {"user_id": "real-person", "plan": "free"}]
        self.saved: dict[str, list] = {}
        self.autopilot_changes: dict[str, list] = {}

    async def insight_people(self):
        return self.people

    async def connection_data(self, user_id):
        return planted()

    async def save_findings(self, user_id, items):
        self.saved[user_id] = items
        return len(items)

    async def autopilot(self, user_id):
        return self.autopilot_changes.get(user_id, [])


@pytest.fixture
def job(monkeypatch):
    monkeypatch.setenv("JOB_SECRET", "s3cret")
    get_settings.cache_clear()
    with TestClient(app) as client:
        app.state.db = ConnectionDb()
        app.state.push = FakePush()
        app.state.provider = FakeProvider()
        yield client
    get_settings.cache_clear()


def test_the_job_measures_pro_and_clears_free(job):
    result = job.post("/jobs/nightly-connections", headers=SECRET).json()
    assert result == {"job": "nightly-connections", "saved": 1, "cleared": 1, "failed": 0, "autopilot": 0}
    saved = app.state.db.saved["test-user"]
    assert len(saved) > 0
    assert all(row["explanation"] and row["question"] for row in saved)
    assert app.state.db.saved["real-person"] == []
    # Only the test account's findings reached the model, once.
    assert app.state.provider.opened == 1


# ---------------------------------------------------------------------------
# Explanations and fixes
# ---------------------------------------------------------------------------


def worded(data=None):
    data = data or planted()
    return connections.with_words_and_fixes(data, connections.find(data))


def test_each_finding_gets_seems_linked_words_with_its_own_numbers():
    for row in worded():
        assert "seem" in row["explanation"]
        assert row["question"].endswith("?")
        assert connections.numbers_in(row["explanation"]) <= connections.numbers_in(str(row["numbers"]) + " 16 2")


def test_a_long_run_brings_a_rest_after_it_and_never_a_harder_target():
    rows = {row["key"]: row for row in worded()}
    fixes = rows["after_big_amount:run:study"]["fixes"]
    assert fixes[0] == {
        "label": "Make Study's goal the minimum the day after Run",
        "habit_id": "study",
        "action": {"type": "minimum_after", "after_habit_id": "run"},
    }
    assert 1 <= len(fixes) <= 3
    every = [fix["action"]["type"] for row in rows.values() for fix in row["fixes"]]
    assert "change_target" not in every


def test_a_rest_after_that_is_already_set_is_not_offered_again():
    data = planted()
    data["setup"] = [{"id": "study", "light_after": ["run"], "schedule_days": [1, 2, 3, 4, 5, 6, 7]}]
    rows = {row["key"]: row for row in worded(data)}
    assert all(f["action"]["type"] != "minimum_after" for f in rows["after_big_amount:run:study"]["fixes"])


def test_a_clash_offers_another_part_of_the_day_or_the_order():
    finding = {
        "kind": "clash", "direction": "competes", "numbers": {"part": "evening", "both": 5, "expected": 25, "days": 40},
        "subjects": [{"type": "habit", "id": "gym", "title": "Gym"}, {"type": "habit", "id": "cook", "title": "Cook"}],
    }  # fmt: skip
    setup = {"gym": {"time_of_day": "evening"}, "cook": {"time_of_day": "evening"}, "read": {"time_of_day": "morning"}}
    fixes = connections.fixes_for(finding, {}, setup)
    assert fixes[0]["action"] == {"type": "move_time", "time_of_day": "afternoon"}
    assert fixes[1] == {"label": "Put Gym first in the evening", "habit_id": "gym", "action": {"type": "move_first"}}


def test_links_answered_no_stay_hidden():
    data = planted()
    data["hidden"] = ["after_big_amount:run:study"]
    assert "after_big_amount:run:study" not in {row["key"] for row in worded(data)}


FINDING = {
    "key": "after_big_amount:run:study",
    "kind": "after_big_amount",
    "explanation": "After Run of 16 km or more, you complete Study 40% of the time, against 85% otherwise. They seem linked.",
    "question": "Does a big Run leave less room for Study the next day?",
}


@pytest.mark.parametrize(
    ("text", "question", "kept"),
    [
        ("Study seems to slip after long runs: 40% after 16 km or more, against 85% otherwise.", "Do long runs leave you less room?", True),
        ("Study seems to slip after long runs: 45% after 16 km or more, against 85% otherwise.", "Do long runs leave you less room?", False),
        ("Study seems to slip after long runs: 40% against 85% otherwise.", "Do long runs leave you less room?", False),
        ("Long runs cause Study to slip: 40% after 16 km or more, against 85%.", "Do they?", False),
        ("After 16 km or more, Study is 40% against 85%.", "Do long runs leave you less room?", False),
        ("Study seems to slip after long runs: 40% after 16 km or more, against 85% otherwise.", "Long runs leave less room.", False),
        ("It seems linked to insomnia: 40% after 16 km or more, against 85%.", "Is that it?", False),
    ],
)
def test_the_models_words_must_carry_exactly_the_measured_numbers(text, question, kept):
    assert connections.safe_explanation(text, question, FINDING["explanation"] + " " + FINDING["question"]) is kept


async def test_explanations_that_stray_keep_the_plain_words():
    rows = [dict(FINDING), {**FINDING, "key": "b", "explanation": "On days you do Read, you do Walk 80% of the time, against 30% on other days. They seem linked."}]
    provider = FakeProvider(
        calls=[
            ToolCall("write_explanations", {"items": [
                {"key": "1", "explanation": "Study seems to slip after long runs: 40% after 16 km or more, against 85% otherwise.", "question": "Do long runs leave you less room?"},
                {"key": "2", "explanation": "Read seems to cause Walk: 80% against 30%.", "question": "Is it?"},
            ]})
        ]
    )  # fmt: skip
    out = await connections.explain(provider, rows)
    assert out[0]["explanation"].startswith("Study seems to slip")
    assert out[1]["explanation"] == rows[1]["explanation"]
    # The model saw the measured sentences only, numbered.
    assert provider.seen[0]["messages"][0].text.startswith("- 1: After Run of 16 km")


async def test_the_plain_words_stand_when_the_model_is_down():
    rows = [dict(FINDING)]
    assert await connections.explain(FakeProvider([Unavailable("down")]), rows) == rows


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------


def checkins_for(days: int, **values) -> dict:
    return {(TODAY - timedelta(days=i)).isoformat(): {"date": (TODAY - timedelta(days=i)).isoformat(), **values} for i in range(days)}


def test_two_weeks_of_low_energy_brings_a_gentle_word_about_a_doctor():
    note = connections.wellbeing(checkins_for(14, energy=2, sleep_hours=7), TODAY.isoformat())
    assert note["key"] == "wellbeing:energy"
    assert "doctor" in note["explanation"]
    assert note["fixes"] == []


def test_short_or_long_sleep_for_two_weeks_too():
    assert connections.wellbeing(checkins_for(14, energy=4, sleep_hours=4.5), TODAY.isoformat())["key"] == "wellbeing:sleep"
    assert connections.wellbeing(checkins_for(14, energy=4, sleep_hours=11), TODAY.isoformat())["key"] == "wellbeing:sleep"


def test_a_few_low_days_say_nothing():
    assert connections.wellbeing(checkins_for(6, energy=1, sleep_hours=4), TODAY.isoformat()) is None
    mixed = checkins_for(14, energy=4, sleep_hours=7)
    for day in list(mixed)[:5]:
        mixed[day]["energy"] = 1
    assert connections.wellbeing(mixed, TODAY.isoformat()) is None


def test_the_wellbeing_note_comes_first_and_never_through_the_model():
    data = planted()
    data["checkins"] = list(checkins_for(14, energy=1, sleep_hours=7).values())
    rows = worded(data)
    assert rows[0]["kind"] == "wellbeing"


def test_autopilot_changes_are_told_on_the_phone(job):
    app.state.db.autopilot_changes = {
        "test-user": [{"change_id": "c1", "habit_title": "Study", "reason": "After Run yesterday, Study's goal is the minimum today"}]
    }
    app.state.db.tokens = {"test-user": ["ExponentPushToken[x]"]}
    result = job.post("/jobs/nightly-connections", headers=SECRET).json()
    assert result["autopilot"] == 1
    sent = app.state.push.sent[0]
    assert sent["title"] == "Autopilot"
    assert sent["body"] == "After Run yesterday, Study's goal is the minimum today. Open the app to undo it."
    assert sent["data"] == {"kind": "autopilot", "change_id": "c1"}
    # Free accounts are never even asked.
    assert "real-person" not in app.state.db.autopilot_changes
