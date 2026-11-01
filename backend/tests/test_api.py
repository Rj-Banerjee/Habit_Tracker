import json

import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, current_user
from app.config import get_settings
from app.llm.base import LLMProvider, RateLimited, Refused, ToolCall, Unavailable
from app.main import app
from app.rate_limit import UserLimits
from app import tracker as tracker_module

from .fakes import FakeProvider

HABITS = [
    {"id": "uuid-read", "title": "Read", "type": "count", "unit": "pages", "voice_aliases": ["book"]},
    {"id": "uuid-run", "title": "Run", "type": "boolean", "unit": None, "voice_aliases": []},
]
TODAY = [
    {
        "title": "Read",
        "identity_name": "The Reader",
        "status": "open",
        "current_streak": 4,
        "is_today": True,
    }
]
LOGS = [{"date": "2026-11-01", "status": "skipped", "skip_reason": "Sick", "habits": {"title": "Run"}}]
ASK = {"messages": [{"role": "user", "text": "How am I doing?"}]}


class FakeTracker:
    fail = False

    def __init__(self, *_):
        pass

    async def close(self):
        pass

    async def today(self):
        if FakeTracker.fail:
            raise tracker_module.TrackerUnavailable
        return TODAY

    async def recent_logs(self):
        return LOGS

    async def tone(self):
        return "direct"

    async def habits(self):
        return HABITS


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr("app.main.Tracker", FakeTracker)
    FakeTracker.fail = False
    app.dependency_overrides[current_user] = lambda: CurrentUser("test-user", "token")
    with TestClient(app) as client:
        app.state.limits = UserLimits()
        yield client
    app.dependency_overrides.clear()


def use(provider: LLMProvider) -> LLMProvider:
    app.state.provider = provider
    return provider


def events(response):
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_health_shows_no_secrets(api):
    assert api.get("/health").json() == {"status": "ok", "provider": "ollama"}


def test_chat_needs_a_sign_in():
    with TestClient(app) as client:
        assert client.post("/coach/chat", json=ASK).status_code == 401


def test_chat_streams_and_uses_the_strong_model(api):
    provider = use(FakeProvider(["You're ", "doing well."]))
    response = api.post("/coach/chat", json=ASK)
    assert response.headers["content-type"].startswith("text/event-stream")
    assert events(response) == [
        {"type": "delta", "text": "You're "},
        {"type": "delta", "text": "doing well."},
        {"type": "done"},
    ]
    assert provider.seen[0]["tier"].value == "strong"


def test_chat_gives_the_coach_their_data_and_tone(api):
    provider = use(FakeProvider(["ok"]))
    api.post("/coach/chat", json=ASK)
    system = provider.seen[0]["system"]
    assert "Read (The Reader): open, 4-day streak" in system
    assert "2026-11-01 Run: skipped, Sick" in system
    assert "Plain and to the point" in system


def test_chat_never_sends_ids_or_the_token(api):
    provider = use(FakeProvider(["ok"]))
    api.post("/coach/chat", json=ASK)
    assert "test-user" not in provider.seen[0]["system"]
    assert "token" not in provider.seen[0]["system"]


def test_busy_is_a_friendly_429(api):
    use(FakeProvider([RateLimited(retry_after=30)]))
    response = api.post("/coach/chat", json=ASK)
    assert response.status_code == 429
    assert response.json()["message"] == "Coach is busy, try again in a minute."
    assert response.headers["retry-after"] == "30"


def test_out_for_the_day_says_so(api):
    use(FakeProvider([RateLimited(daily=True)]))
    response = api.post("/coach/chat", json=ASK)
    assert response.json()["code"] == "out_for_today"


def test_a_failure_mid_reply_arrives_as_an_event(api):
    use(FakeProvider(["Hello", RateLimited()]))
    seen = events(api.post("/coach/chat", json=ASK))
    assert seen[0] == {"type": "delta", "text": "Hello"}
    assert seen[1]["type"] == "error"
    assert seen[1]["message"] == "Coach is busy, try again in a minute."


def test_provider_down_leaves_the_app_a_calm_message(api):
    use(FakeProvider([Unavailable("secret detail")]))
    response = api.post("/coach/chat", json=ASK)
    assert response.status_code == 503
    assert "Your habits still work" in response.json()["message"]
    assert "secret" not in response.text


def test_a_refusal_is_reported(api):
    use(FakeProvider([Refused()]))
    assert api.post("/coach/chat", json=ASK).json()["code"] == "refused"


def test_tracker_down_is_a_503(api):
    use(FakeProvider(["ok"]))
    FakeTracker.fail = True
    assert api.post("/coach/chat", json=ASK).status_code == 503


def test_free_tier_blocks_a_real_account_before_reading_or_sending(api):
    provider = use(FakeProvider(["ok"]))
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person", "token")
    response = api.post("/coach/chat", json=ASK)
    assert response.status_code == 403
    assert response.json()["code"] == "test_only"
    assert provider.opened == 0


def test_free_tier_blocks_voice_too(api):
    provider = use(FakeProvider(calls=[ToolCall("undo_last", {})]))
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person", "token")
    assert api.post("/voice/parse", json={"transcript": "undo"}).status_code == 403
    assert provider.opened == 0


def test_a_paid_tier_lets_real_accounts_through(api):
    use(FakeProvider(["ok"]))
    paid = get_settings().model_copy(update={"ai_provider_tier": "paid"})
    app.dependency_overrides[get_settings] = lambda: paid
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person", "token")
    assert api.post("/coach/chat", json=ASK).status_code == 200


def test_a_local_provider_lets_any_account_through(api):
    use(FakeProvider(["ok"], outside=False))
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person", "token")
    assert api.post("/coach/chat", json=ASK).status_code == 200


def test_per_user_limit(api):
    provider = use(FakeProvider(["ok"]))
    limited = get_settings().model_copy(update={"ai_user_chats_per_hour": 1})
    app.dependency_overrides[get_settings] = lambda: limited
    assert api.post("/coach/chat", json=ASK).status_code == 200
    response = api.post("/coach/chat", json=ASK)
    assert response.status_code == 429
    assert response.json()["code"] == "too_many"
    assert provider.opened == 1


def test_the_last_turn_must_be_the_user(api):
    use(FakeProvider(["ok"]))
    body = {"messages": [{"role": "assistant", "text": "hi"}]}
    assert api.post("/coach/chat", json=body).status_code == 422


def test_old_turns_drop_when_the_prompt_is_too_long(api):
    provider = use(FakeProvider(["ok"]))
    small = get_settings().model_copy(update={"ai_max_input_tokens": 700})
    app.dependency_overrides[get_settings] = lambda: small
    turns = [{"role": "user", "text": "x" * 3000}, {"role": "assistant", "text": "y" * 3000}]
    api.post("/coach/chat", json={"messages": [*turns, {"role": "user", "text": "latest"}]})
    assert [m.text for m in provider.seen[0]["messages"]] == ["latest"]


def voice(api, calls, transcript="anything"):
    provider = use(FakeProvider(calls=calls))
    response = api.post("/voice/parse", json={"transcript": transcript})
    return response.json()["intents"], provider


def test_voice_uses_the_fast_model_and_short_refs(api):
    intents, provider = voice(api, [ToolCall("log_habit", {"habit": "h1"})])
    assert intents == [{"intent": "log_habit", "habit_id": "uuid-read", "habit_title": "Read"}]
    assert provider.seen[0]["tier"].value == "fast"
    assert "h1: Read (book)" in provider.seen[0]["system"]
    assert "uuid-read" not in provider.seen[0]["system"]


def test_voice_several_habits(api):
    calls = [ToolCall("log_habit", {"habit": "h2"}), ToolCall("log_amount", {"habit": "h1", "amount": 20})]
    intents, _ = voice(api, calls)
    assert [i["intent"] for i in intents] == ["log_habit", "log_amount"]
    assert intents[1]["amount"] == 20


@pytest.mark.parametrize(
    "call",
    [
        ToolCall("log_habit", {"habit": "h9"}),
        ToolCall("log_habit", {}),
        ToolCall("log_amount", {"habit": "h1", "amount": -5}),
        ToolCall("log_amount", {"habit": "h1", "amount": "lots"}),
        ToolCall("log_amount", {"habit": "h1", "amount": True}),
        ToolCall("ask_coach", {"question": "  "}),
        ToolCall("delete_everything", {}),
    ],
)
def test_voice_drops_anything_that_doesnt_hold_up(api, call):
    assert voice(api, [call])[0] == []


def test_voice_other_intents(api):
    intents, _ = voice(
        api,
        [
            ToolCall("shrink_habit", {"habit": "h1"}),
            ToolCall("skip_habit", {"habit": "h2", "reason": "Sick"}),
            ToolCall("undo_last", {}),
            ToolCall("ask_coach", {"question": "Why do I skip Mondays?"}),
        ],
    )
    assert [i["intent"] for i in intents] == ["shrink_habit", "skip_habit", "undo_last", "ask_coach"]
    assert intents[1]["reason"] == "Sick"
    assert intents[3]["question"] == "Why do I skip Mondays?"


def test_voice_when_nothing_matches(api):
    assert voice(api, [])[0] == []


def test_voice_busy(api):
    use(FakeProvider([RateLimited()]))
    response = api.post("/voice/parse", json={"transcript": "I ran"})
    assert response.status_code == 429
    assert response.json()["message"] == "Coach is busy, try again in a minute."


def test_voice_length_limit(api):
    use(FakeProvider())
    assert api.post("/voice/parse", json={"transcript": "x" * 501}).status_code == 422
