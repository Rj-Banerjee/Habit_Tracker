import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.jobs import nudge_body
from app.llm.base import Unavailable
from app.main import app
from app.push import Push
from app.service_db import JobDb

from .fakes import FakeProvider

SECRET = {"X-Job-Secret": "s3cret"}
CONTEXT = {
    "tone": "direct",
    "identities": [{"name": "The Reader", "why_text": "Calmer evenings"}],
    "logs": [{"date": "2026-11-07", "status": "done", "habits": {"title": "Read"}}],
    "wins": ["Read every day"],
    "mood": "Calm",
}


class FakeJobDb:
    def __init__(self):
        self.claims: set[tuple[str, str]] = set()
        self.released: list[tuple[str, str]] = []
        self.events: list[dict] = []
        self.spent: dict[str, int] = {}
        self.letters = [{"user_id": "test-user", "week_start": "2026-11-02"}]
        self.reminders: list[dict] = []
        self.nudges: list[dict] = []
        self.tokens: dict[str, list[str]] = {}

    async def claim(self, job, key):
        if (job, key) in self.claims:
            return False
        self.claims.add((job, key))
        return True

    async def release(self, job, key):
        self.claims.discard((job, key))
        self.released.append((job, key))

    async def rebuild_patterns(self):
        return 3

    async def letter_candidates(self, hour):
        self.hour = hour
        return self.letters

    async def letter_context(self, user_id, week):
        return CONTEXT

    async def due_reminders(self):
        return self.reminders

    async def due_nudges(self):
        return self.nudges

    async def push_tokens(self, user_id):
        return self.tokens.get(user_id, [])

    async def record_coach_event(self, user_id, kind, payload, outcome):
        self.events.append({"user_id": user_id, "kind": kind, "payload": payload, "outcome": outcome})

    async def spend(self, scope, amount, seconds):
        self.spent[scope] = self.spent.get(scope, 0) + amount
        return self.spent[scope]

    async def take_slot(self, *_):
        return 0

    async def close(self):
        pass


class FakePush:
    def __init__(self, delivered: int | None = None):
        self.sent: list[dict] = []
        self.delivered = delivered

    async def send(self, tokens, title, body, data):
        self.sent.append({"tokens": tokens, "title": title, "body": body, "data": data})
        return len(tokens) if self.delivered is None else self.delivered

    async def close(self):
        pass


@pytest.fixture
def jobs(monkeypatch):
    monkeypatch.setenv("JOB_SECRET", "s3cret")
    get_settings.cache_clear()
    with TestClient(app) as client:
        app.state.db = FakeJobDb()
        app.state.push = FakePush()
        app.state.provider = FakeProvider(["Dear you, ", "keep going."])
        yield client
    get_settings.cache_clear()


def test_jobs_need_the_secret(jobs):
    assert jobs.post("/jobs/nightly-patterns").status_code == 401
    assert jobs.post("/jobs/nightly-patterns", headers={"X-Job-Secret": "nope"}).status_code == 401
    assert jobs.post("/jobs/nightly-patterns", headers=SECRET).status_code == 200


def test_jobs_are_off_without_a_secret(monkeypatch):
    monkeypatch.setenv("JOB_SECRET", "")
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            assert client.post("/jobs/nightly-patterns", headers={"X-Job-Secret": ""}).status_code == 503
    finally:
        get_settings.cache_clear()


def test_nightly_patterns_says_how_many(jobs):
    assert jobs.post("/jobs/nightly-patterns", headers=SECRET).json() == {"job": "nightly-patterns", "people": 3}


def test_sunday_letter_is_written_from_their_own_review_and_kept(jobs):
    result = jobs.post("/jobs/sunday-letters", headers=SECRET).json()
    assert result == {"job": "sunday-letters", "written": 1, "skipped": 0, "failed": 0}
    db = app.state.db
    assert db.hour == 18
    [event] = db.events
    assert event["kind"] == "letter"
    assert event["payload"] == {"week_start": "2026-11-02", "text": "Dear you, keep going.", "scheduled": True}
    system = app.state.provider.seen[-1]["system"]
    assert "Read every day" in system
    assert "Calmer evenings" in system
    assert db.spent["user:test-user:tokens"] > 0


def test_a_second_run_writes_nothing_more(jobs):
    jobs.post("/jobs/sunday-letters", headers=SECRET)
    jobs.post("/jobs/sunday-letters", headers=SECRET)
    assert len(app.state.db.events) == 1


def test_on_a_free_tier_only_test_accounts_get_a_letter(jobs):
    app.state.db.letters = [{"user_id": "real-person", "week_start": "2026-11-02"}]
    result = jobs.post("/jobs/sunday-letters", headers=SECRET).json()
    assert result["skipped"] == 1
    assert app.state.provider.opened == 0
    assert app.state.db.events == []


def test_a_failed_letter_gives_its_claim_back_for_the_next_run(jobs):
    app.state.provider = FakeProvider([Unavailable("down")])
    result = jobs.post("/jobs/sunday-letters", headers=SECRET).json()
    assert result["failed"] == 1
    assert app.state.db.released == [("sunday-letter", "test-user:2026-11-02")]
    app.state.provider = FakeProvider(["Second try."])
    assert jobs.post("/jobs/sunday-letters", headers=SECRET).json()["written"] == 1


def test_reminders_and_nudges_go_to_the_phone_and_count_toward_the_cap(jobs):
    db = app.state.db
    db.tokens = {"u1": ["ExponentPushToken[a]"]}
    db.reminders = [{"user_id": "u1", "local_day": "2026-11-12"}]
    db.nudges = [{"user_id": "u1", "habit_id": "h1", "title": "Read", "local_day": "2026-11-12", "usual_hour": 19}]
    result = jobs.post("/jobs/reminders-and-nudges", headers=SECRET).json()
    assert result == {"job": "reminders-and-nudges", "reminders": 1, "nudges": 1, "no_device": 0}
    sent = app.state.push.sent
    assert sent[0]["body"] == "A small version still counts."
    assert sent[1]["body"] == "Read usually happens around 7pm. The small version counts."
    assert sent[1]["data"] == {"kind": "nudge", "habitId": "h1"}
    assert [e["kind"] for e in db.events] == ["reminder", "nudge"]
    assert db.events[1]["payload"] == {"habit_id": "h1", "date": "2026-11-12"}


def test_running_twice_never_sends_twice(jobs):
    db = app.state.db
    db.tokens = {"u1": ["ExponentPushToken[a]"]}
    db.reminders = [{"user_id": "u1", "local_day": "2026-11-12"}]
    jobs.post("/jobs/reminders-and-nudges", headers=SECRET)
    jobs.post("/jobs/reminders-and-nudges", headers=SECRET)
    assert len(app.state.push.sent) == 1


def test_without_a_phone_nothing_is_recorded_so_the_local_reminder_still_fires(jobs):
    db = app.state.db
    db.reminders = [{"user_id": "u1", "local_day": "2026-11-12"}]
    result = jobs.post("/jobs/reminders-and-nudges", headers=SECRET).json()
    assert result["no_device"] == 1
    assert db.events == []
    assert db.released == [("reminder", "u1:2026-11-12")]


def test_a_push_nobody_took_is_given_back(jobs):
    db = app.state.db
    app.state.push = FakePush(delivered=0)
    db.tokens = {"u1": ["ExponentPushToken[gone]"]}
    db.reminders = [{"user_id": "u1", "local_day": "2026-11-12"}]
    assert jobs.post("/jobs/reminders-and-nudges", headers=SECRET).json()["no_device"] == 1
    assert db.events == []


def test_nudge_words_match_the_phone():
    assert nudge_body("Read", 7) == "Read usually happens around 7am. The small version counts."
    assert nudge_body("Run", 0) == "Run usually happens around 12am. The small version counts."


async def test_push_sends_one_message_per_phone_and_counts_what_was_taken():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"data": [{"status": "ok"}, {"status": "error"}]})

    push = Push("https://push.test/send", transport=httpx.MockTransport(handler))
    taken = await push.send(["a", "b"], "Title", "Body", {"kind": "reminder"})
    assert taken == 1
    assert [m["to"] for m in seen["body"]] == ["a", "b"]
    assert await push.send([], "Title", "Body", {}) == 0
    await push.close()


async def test_push_failure_costs_one_push_not_the_job():
    push = Push("https://push.test/send", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    assert await push.send(["a"], "Title", "Body", {}) == 0
    await push.close()


async def test_job_db_calls_the_service_only_functions():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.url.path, json.loads(request.content), request.headers["authorization"]))
        return httpx.Response(200, json=True)

    db = JobDb(get_settings(), transport=httpx.MockTransport(handler))
    assert await db.claim("nudge", "u1:2026-11-12") is True
    path, body, auth = calls[0]
    assert path == "/rest/v1/rpc/job_claim"
    assert body == {"p_job": "nudge", "p_run_key": "u1:2026-11-12"}
    assert auth == "Bearer secret"
    await db.close()
