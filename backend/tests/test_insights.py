import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import insights
from app.config import get_settings
from app.llm.base import ToolCall, Unavailable
from app.main import app

from .fakes import FakeProvider
from .test_jobs import SECRET, FakeJobDb, FakePush

# A Sunday, so the 8 weeks before it are whole.
TODAY = date(2026, 11, 8)
DAYS = 90


def habit(hid: str, title: str, **patch) -> dict:
    return {
        "id": hid,
        "title": title,
        "type": "boolean",
        "unit": None,
        "frequency": "days",
        "per_week": None,
        "target": None,
        "schedule_days": [1, 2, 3, 4, 5, 6, 7],
        "time_of_day": "anytime",
        "reminder_time": None,
        **patch,
    }


def day(hid: str, on: date, status: str, level: str = "full", amount=None, target=None, minute=None) -> dict:
    done = status == "done"
    return {
        "habit_id": hid,
        "date": on.isoformat(),
        "status": status,
        "log_status": "done" if done else None,
        "level_done": level if done else None,
        "amount": amount,
        "target": target,
        "logged_minute": minute if done else None,
    }


def history(hid: str, done, **day_args) -> list[dict]:
    """A day for each of the last 90 days, done or missed by done(offset, date)."""
    out = []
    for offset in range(DAYS - 1, 0, -1):
        on = TODAY - timedelta(days=offset)
        out.append(day(hid, on, "done" if done(offset, on) else "missed", **day_args))
    return out


def data(habits: list[dict], days: list[dict], weeks: list[dict] | None = None) -> dict:
    return {
        "from": (TODAY - timedelta(days=DAYS - 1)).isoformat(),
        "to": TODAY.isoformat(),
        "today": TODAY.isoformat(),
        "habits": habits,
        "days": days,
        "weeks": weeks or [],
    }


def kinds(found) -> list[str]:
    return [x.kind for x in found]


# Read slips every Wednesday, is set for the morning but done at 7:30 pm, reminds at
# 8am, and has a 20-page target it usually doesn't reach.
READ = habit("read", "Read", type="count", unit="pages", target=20, time_of_day="morning", reminder_time="08:00:00")
READ_DAYS = [
    day("read", TODAY - timedelta(days=o), "missed" if (TODAY - timedelta(days=o)).isoweekday() == 3 else "done",
        amount=20 if o % 7 == 0 else 7, target=20, minute=19 * 60 + 30)
    for o in range(DAYS - 1, 0, -1)
]


def read_found(**setup):
    return insights.find_for_habit(READ, data([READ], READ_DAYS), {"minimum": 5, **setup}, TODAY.isoformat())


def test_a_weekday_that_slips_is_found_with_its_numbers():
    weak = next(x for x in read_found() if x.kind == "weak_weekday")
    assert weak.numbers["weekday"] == 3
    assert weak.numbers["weekday_rate"] == 0
    assert weak.numbers["other_rate"] == 100
    assert weak.action == {"type": "light_day", "weekday": 3}
    assert weak.text.startswith("You do Read on 0% of Wednesdays, against 100% on other days.")


def test_a_day_already_lighter_isnt_suggested_again():
    assert "weak_weekday" not in kinds(read_found(light_days=[3]))


def test_a_target_rarely_reached_gets_a_kinder_one():
    found = next(x for x in read_found() if x.kind == "target_too_high")
    assert found.numbers["hit_rate"] < 30
    assert found.numbers["typical"] == 7
    assert found.action == {"type": "change_target", "target": 7}
    assert "Try a target of 7 pages?" in found.text


def test_the_time_of_day_and_reminder_follow_when_it_is_done():
    found = {x.kind: x for x in read_found()}
    assert found["wrong_time"].action == {"type": "move_time", "time_of_day": "evening"}
    assert found["wrong_time"].numbers["share"] == 100
    assert found["reminder_not_working"].action == {"type": "add_reminder", "reminder_time": "19:30"}
    assert "around 7:30pm" in found["reminder_not_working"].text


def test_an_even_pattern_finds_nothing():
    even = habit("even", "Stretch")
    days = history("even", lambda offset, on: offset % 2 == 0)
    found = insights.find_for_habit(even, data([even], days), {}, TODAY.isoformat())
    assert "weak_weekday" not in kinds(found)
    assert "wrong_time" not in kinds(found)
    assert insights.find_pairs(data([even, READ], days + READ_DAYS), TODAY.isoformat()) == []


def test_too_little_history_finds_nothing():
    short = [d for d in READ_DAYS if d["date"] >= (TODAY - timedelta(days=10)).isoformat()]
    found = insights.find_for_habit(READ, data([READ], short), {"minimum": 5}, TODAY.isoformat())
    assert found == []


def test_getting_stronger_and_declining():
    rising = habit("up", "Run")
    up = history("up", lambda offset, on: offset < 30 or offset % 3 == 0)
    assert "getting_stronger" in kinds(insights.find_for_habit(rising, data([rising], up), {}, TODAY.isoformat()))

    falling = habit("down", "Journal")
    down = history("down", lambda offset, on: offset > 28 or offset % 3 == 0)
    found = {x.kind: x for x in insights.find_for_habit(falling, data([falling], down), {}, TODAY.isoformat())}
    assert "declining" in found
    assert found["declining"].action is None
    assert "minimum still counts" in found["declining"].text


def test_an_every_day_habit_done_a_few_times_a_week_could_be_weekly():
    gym = habit("gym", "Gym")
    days = history("gym", lambda offset, on: on.isoweekday() in (1, 3, 5, 6))
    fit = next(x for x in insights.find_for_habit(gym, data([gym], days), {}, TODAY.isoformat()) if x.kind == "weekly_fit")
    assert fit.action == {"type": "switch_per_week", "per_week": 4}


def test_habits_that_go_together_are_paired_with_their_numbers():
    run = habit("run", "Run")
    together = history("run", lambda offset, on: on.isoweekday() != 3)
    pairs = insights.find_pairs(data([READ, run], READ_DAYS + together), TODAY.isoformat())
    assert len(pairs) == 1
    assert pairs[0].numbers["b_when_a"] == 100
    assert pairs[0].numbers["days"] >= insights.PAIR_MIN_DAYS


def test_choose_keeps_three_a_view_and_leaves_out_dismissed_ones():
    run = habit("run", "Run")
    together = history("run", lambda offset, on: on.isoweekday() != 3)
    analytics = data([READ, run], READ_DAYS + together)
    rows = insights.choose(analytics, [{"id": "read", "minimum": 5, "light_days": []}], [])
    by_habit = [r for r in rows if r["habit_id"] == "read"]
    overview = [r for r in rows if r["habit_id"] is None]
    assert len(by_habit) == 3
    assert 1 <= len(overview) <= 3
    # The Overview's copy names the habit its action changes.
    assert overview[0]["action"]["habit_id"] == "read"
    assert any(r["kind"] == "habit_pair" for r in overview)

    hidden = insights.choose(analytics, [{"id": "read", "minimum": 5}], ["weak_weekday:read:3"])
    assert all(r["key"] != "weak_weekday:read:3" for r in hidden)


# ---------------------------------------------------------------------------
# The model's words are checked against the numbers
# ---------------------------------------------------------------------------

PLAIN = "You do Read on 40% of Wednesdays, against 85% on other days. Make Wednesday a lighter day?"


def test_good_wording_is_kept():
    assert insights.safe_wording("Wednesdays are harder for Read: 40% of them, against 85% otherwise. Lighter Wednesdays?", PLAIN)


@pytest.mark.parametrize(
    "text",
    [
        "Read happens on 45% of Wednesdays, against 85% otherwise.",  # a number that wasn't measured
        "Wednesdays are harder for Read. Lighter Wednesdays?",  # the numbers left out
        "You fail at Read on Wednesdays: 40% against 85%.",  # shaming
        "Wednesday meetings cause it: 40% against 85%.",  # a cause
        "",
    ],
)
def test_wording_that_strays_from_the_numbers_is_thrown_away(text):
    assert not insights.safe_wording(text, PLAIN)


async def test_the_model_words_them_and_bad_wording_keeps_the_plain_text():
    rows = [
        {"key": "a", "text": PLAIN},
        {"key": "b", "text": "Run is getting stronger: 72 out of 100, up from 50 four weeks ago."},
    ]
    provider = FakeProvider(
        calls=[
            ToolCall(
                "write_cards",
                {"cards": [
                    {"key": "1", "text": "Wednesdays: 40% done, against 85% on other days. Make them lighter?"},
                    {"key": "2", "text": "Run is up to 99 out of 100!"},
                    {"key": "7", "text": "A card for nothing."},
                ]},
            )
        ]
    )
    worded = await insights.word(provider, rows)
    assert worded[0]["text"] == "Wednesdays: 40% done, against 85% on other days. Make them lighter?"
    assert worded[1]["text"] == rows[1]["text"]
    # The model sees only the measured sentences, numbered: no keys or ids.
    assert provider.seen[0]["messages"][0].text == f"- 1: {PLAIN}\n- 2: {rows[1]['text']}"


async def test_when_the_model_is_down_the_plain_text_stands():
    rows = [{"key": "a", "text": PLAIN}]
    assert await insights.word(FakeProvider([Unavailable("down")]), rows) == rows


# ---------------------------------------------------------------------------
# The same numbers as the app
# ---------------------------------------------------------------------------

PARITY = Path(__file__).parents[2] / "packages/core/src/fixtures/analyticsParity.json"


def test_strength_and_weekday_rates_match_the_apps():
    fixture = json.loads(PARITY.read_text())
    analytics = fixture["data"]
    for expected in fixture["expected"]:
        h = next(x for x in analytics["habits"] if x["id"] == expected["habit_id"])
        series = insights.strength_series(h, analytics)
        assert series[-1][1] == expected["strength"]
        days = [d for d in analytics["days"] if d["habit_id"] == h["id"]]
        assert [list(s) for s in insights.weekday_rates(days)] == expected["weekday"]


# ---------------------------------------------------------------------------
# The nightly job
# ---------------------------------------------------------------------------


class InsightDb(FakeJobDb):
    def __init__(self):
        super().__init__()
        self.people = [{"user_id": "test-user", "plan": "free"}, {"user_id": "real-person", "plan": "free"}]
        self.saved: dict[str, list] = {}

    async def insight_people(self):
        return self.people

    async def insight_data(self, user_id):
        return {"analytics": data([READ], READ_DAYS), "setup": [{"id": "read", "minimum": 5}], "dismissed": []}

    async def save_insights(self, user_id, items):
        self.saved[user_id] = items
        return len(items)


@pytest.fixture
def job(monkeypatch):
    monkeypatch.setenv("JOB_SECRET", "s3cret")
    get_settings.cache_clear()
    with TestClient(app) as client:
        app.state.db = InsightDb()
        app.state.push = FakePush()
        app.state.provider = FakeProvider()
        yield client
    get_settings.cache_clear()


def test_the_nightly_job_saves_insights_for_pro_and_clears_them_for_free(job):
    result = job.post("/jobs/nightly-insights", headers=SECRET).json()
    assert result == {"job": "nightly-insights", "saved": 1, "cleared": 1, "failed": 0}
    db = app.state.db
    # The test account counts as Pro; the real free account gets none.
    assert len(db.saved["test-user"]) > 0
    assert db.saved["real-person"] == []
    assert db.spent.get("user:test-user:tokens", 0) >= 0


def test_running_it_twice_does_the_work_once(job):
    job.post("/jobs/nightly-insights", headers=SECRET)
    app.state.provider = FakeProvider()
    job.post("/jobs/nightly-insights", headers=SECRET)
    assert app.state.provider.opened == 0


def test_a_failed_run_gives_its_claim_back(job):
    async def broken(user_id):
        raise Unavailable("db down")

    app.state.db.insight_data = broken
    result = job.post("/jobs/nightly-insights", headers=SECRET).json()
    assert result["failed"] == 1
    assert app.state.db.released[0][0] == "nightly-insights"
