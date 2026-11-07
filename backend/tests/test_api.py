import json

import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, current_user
from app.config import get_settings
from app.llm.base import LLMProvider, RateLimited, Refused, ToolCall, Unavailable
from app.main import app
from app import tracker as tracker_module

from .fakes import FakeDb, FakeProvider

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

    async def identities(self):
        return [{"name": "The Reader", "why_text": "Calmer evenings"}]

    async def patterns(self):
        return {"best_hours": [19, 7], "weak_weekdays": [2], "common_skip_reasons": ["Sick"]}


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr("app.main.Tracker", FakeTracker)
    FakeTracker.fail = False
    app.dependency_overrides[current_user] = lambda: CurrentUser("test-user", "token")
    with TestClient(app) as client:
        # These tests are about the AI, so their real account is on Pro.
        app.state.db = FakeDb(plans={"real-person": "pro"})
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
    assert provider.seen[-1]["tier"].value == "strong"


def test_chat_gives_the_coach_their_data_and_tone(api):
    provider = use(FakeProvider(["ok"]))
    api.post("/coach/chat", json=ASK)
    system = provider.seen[-1]["system"]
    assert "Read (The Reader): open, 4-day streak" in system
    assert "2026-11-01 Run: skipped, Sick" in system
    assert "Plain and to the point" in system


def test_chat_never_sends_ids_or_the_token(api):
    provider = use(FakeProvider(["ok"]))
    api.post("/coach/chat", json=ASK)
    for call in provider.seen:
        assert "test-user" not in call["system"]
        assert "token" not in call["system"]


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


def test_free_plan_never_reaches_the_ai_and_says_so_calmly(api):
    provider = use(FakeProvider(["ok"]))
    paid = get_settings().model_copy(update={"ai_provider_tier": "paid"})
    app.dependency_overrides[get_settings] = lambda: paid
    app.dependency_overrides[current_user] = lambda: CurrentUser("free-person", "token")
    for path, body in (("/coach/chat", ASK), ("/voice/parse", {"transcript": "I read"})):
        response = api.post(path, json=body)
        assert response.status_code == 403
        assert response.json() == {"code": "needs_plan", "message": "Available on Pro.", "retry_after": None}
    assert provider.opened == 0


def test_an_unknown_plan_counts_as_free(api):
    use(FakeProvider(["ok"]))
    app.state.db = FakeDb(plans={"odd-person": "premium"})
    paid = get_settings().model_copy(update={"ai_provider_tier": "paid"})
    app.dependency_overrides[get_settings] = lambda: paid
    app.dependency_overrides[current_user] = lambda: CurrentUser("odd-person", "token")
    assert api.post("/coach/chat", json=ASK).json()["code"] == "needs_plan"


def test_test_accounts_get_pro_for_testing(api):
    use(FakeProvider(["ok"]))
    app.state.db = FakeDb()
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
    assert provider.opened == 2  # the first chat's two calls, and none for the second


def test_limits_are_per_person(api):
    use(FakeProvider(["ok"]))
    limited = get_settings().model_copy(update={"ai_user_chats_per_hour": 1})
    app.dependency_overrides[get_settings] = lambda: limited
    api.post("/coach/chat", json=ASK)
    assert app.state.db.used == {"user:test-user:chat": 1}


def test_a_finished_chat_is_recorded_without_its_words(api):
    use(FakeProvider(["ok"]))
    api.post("/coach/chat", json={**ASK, "source": "burned_out"})
    assert app.state.db.events == [
        {
            "user": "test-user",
            "kind": "chat",
            "payload": {"source": "burned_out", "turns": 1},
            "outcome": "replied",
        }
    ]


def test_a_failed_chat_is_recorded(api):
    use(FakeProvider([Unavailable()]))
    api.post("/coach/chat", json=ASK)
    assert app.state.db.events[0]["outcome"] == "failed"


def test_a_failure_mid_reply_is_recorded(api):
    use(FakeProvider(["Hello", Unavailable()]))
    api.post("/coach/chat", json=ASK)
    assert app.state.db.events[0]["outcome"] == "failed"


def chat_events(api, calls, text="I read 20 pages"):
    provider = use(FakeProvider(["Advice."], calls=calls))
    body = {"messages": [{"role": "user", "text": text}]}
    return events(api.post("/coach/chat", json=body)), provider


def test_coach_returns_actions_when_the_request_is_clear(api):
    call = ToolCall("log_amount", {"habit": "h1", "amount": 20, "confidence": "high"})
    seen, provider = chat_events(api, [call])
    assert seen[0]["type"] == "actions"
    assert seen[0]["level"] == "high"
    assert seen[0]["intents"][0]["habit_id"] == "uuid-read"
    assert seen[1] == {"type": "done"}
    assert provider.opened == 1  # no second call to the stronger model


def test_coach_asks_first_when_it_had_to_guess(api):
    call = ToolCall("log_habit", {"habit": "h1", "confidence": "medium"})
    assert chat_events(api, [call])[0][0]["level"] == "medium"


def test_coach_undoes_a_named_habit(api):
    call = ToolCall("undo_habit", {"habit": "h1", "confidence": "high"})
    assert chat_events(api, [call], "undo the read")[0][0]["intents"][0]["intent"] == "undo_habit"


def test_coach_can_ask_which_habit(api):
    call = ToolCall("ask_which", {"habits": ["h1", "h2"], "action": "log_habit", "confidence": "high"})
    assert chat_events(api, [call], "did it")[0][0]["intents"][0]["intent"] == "ask_which"


def test_coach_names_a_habit_that_doesnt_exist(api):
    seen, _ = chat_events(api, [ToolCall("no_such_habit", {"name": "yoga"})], "I did yoga")
    assert seen[0]["missing_habit"] == "Yoga"


def test_coach_just_talks_when_nothing_should_change(api):
    seen, provider = chat_events(api, [ToolCall("talk", {})], "I feel tired")
    assert seen[0] == {"type": "delta", "text": "Advice."}
    assert provider.seen[-1]["tier"].value == "strong"


def test_coach_talks_through_something_it_cant_be_sure_of(api):
    call = ToolCall("log_habit", {"habit": "h1", "confidence": "low"})
    assert chat_events(api, [call])[0][0]["type"] == "delta"


def test_coach_only_sees_the_signed_in_users_habits(api):
    _, provider = chat_events(api, [ToolCall("talk", {})])
    assert "uuid-read" not in provider.seen[0]["system"]
    assert "h1: Read" in provider.seen[0]["system"]


def test_coach_cant_act_on_a_habit_outside_the_list(api):
    call = ToolCall("log_habit", {"habit": "h9", "confidence": "high"})
    assert chat_events(api, [call])[0][0]["type"] == "delta"


def test_coach_gives_the_model_earlier_turns_for_context(api):
    provider = use(FakeProvider(calls=[ToolCall("undo_last", {"confidence": "high"})]))
    turns = [
        {"role": "user", "text": "I read"},
        {"role": "assistant", "text": "Logged Read."},
        {"role": "user", "text": "undo that"},
    ]
    api.post("/coach/chat", json={"messages": turns})
    assert "Logged Read." in provider.seen[0]["messages"][0].text


def test_an_action_is_recorded_as_a_coach_event(api):
    call = ToolCall("log_habit", {"habit": "h1", "confidence": "high"})
    chat_events(api, [call])
    assert app.state.db.events[0]["outcome"] == "acted"


MISS = {
    "messages": [{"role": "user", "text": "Run slipped. I was too tired."}],
    "source": "miss_review",
    "reason": "tired",
}


def test_a_miss_review_goes_straight_to_the_coach(api):
    provider = use(FakeProvider(["Try a smaller run."]))
    seen = events(api.post("/coach/chat", json=MISS))
    assert seen[0]["text"] == "Try a smaller run."
    assert len(provider.seen) == 1
    assert "miss review" in provider.seen[0]["system"]


def test_a_miss_review_keeps_the_reason_but_not_the_words(api):
    use(FakeProvider(["ok"]))
    api.post("/coach/chat", json=MISS)
    event = app.state.db.events[0]
    assert event["kind"] == "miss_review"
    assert event["payload"]["reason"] == "tired"
    assert "slipped" not in str(event)


def test_a_reason_must_come_from_the_list(api):
    use(FakeProvider(["ok"]))
    assert api.post("/coach/chat", json={**MISS, "reason": "anything"}).status_code == 422


LETTER = {"week_start": "2026-11-02", "wins": ["Read 3 days"], "mood": "Tired but good"}


def test_the_letter_uses_their_real_details_and_the_stronger_model(api):
    provider = use(FakeProvider(["Dear you,", " keep going."]))
    seen = events(api.post("/coach/letter", json=LETTER))
    assert seen[-1] == {"type": "done"}
    call = provider.seen[0]
    assert call["tier"].value == "strong"
    for detail in ("Calmer evenings", "Read 3 days", "Tired but good", "Never invent"):
        assert detail in call["system"]


def test_the_letter_is_kept_to_read_again(api):
    use(FakeProvider(["Dear you,", " keep going."]))
    api.post("/coach/letter", json=LETTER)
    event = app.state.db.events[0]
    assert event["kind"] == "letter"
    assert event["payload"] == {"week_start": "2026-11-02", "text": "Dear you, keep going."}


def test_one_letter_a_week(api):
    use(FakeProvider(["ok"]))
    assert api.post("/coach/letter", json=LETTER).status_code == 200
    response = api.post("/coach/letter", json=LETTER)
    assert response.status_code == 429
    assert "next week" in response.json()["message"]


def test_a_failed_letter_saves_nothing(api):
    use(FakeProvider(["Dear", Unavailable()]))
    seen = events(api.post("/coach/letter", json=LETTER))
    assert seen[-1]["type"] == "error"
    assert app.state.db.events == []


def test_the_letter_needs_a_test_account_on_a_free_tier(api):
    provider = use(FakeProvider(["ok"]))
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person", "token")
    assert api.post("/coach/letter", json=LETTER).status_code == 403
    assert provider.opened == 0


def test_the_coach_sees_their_patterns(api):
    provider = use(FakeProvider(["ok"]))
    api.post("/coach/chat", json=ASK)
    system = provider.seen[-1]["system"]
    assert "19:00, 7:00" in system
    assert "Tuesday" in system
    assert "Sick" in system


def test_spending_is_counted_per_person(api):
    use(FakeProvider(["A reply."]))
    api.post("/coach/chat", json=ASK)
    assert app.state.db.spent["user:test-user:tokens"] > 0


def test_voice_counts_toward_the_allowance_too(api):
    use(FakeProvider(calls=[]))
    api.post("/voice/parse", json={"transcript": "I read"})
    assert app.state.db.spent["user:test-user:tokens"] > 0


def test_a_used_allowance_stops_the_call_before_it_costs_anything(api):
    provider = use(FakeProvider(["ok"]))
    limited = get_settings().model_copy(update={"ai_user_daily_tokens": 10})
    app.dependency_overrides[get_settings] = lambda: limited
    app.state.db.spent["user:test-user:tokens"] = 10
    response = api.post("/coach/chat", json=ASK)
    assert response.status_code == 429
    assert response.json()["code"] == "out_of_allowance"
    assert "tomorrow" in response.json()["message"]
    assert provider.opened == 0


def test_the_allowance_covers_voice_and_letters(api):
    provider = use(FakeProvider(["ok"]))
    limited = get_settings().model_copy(update={"ai_user_daily_tokens": 10})
    app.dependency_overrides[get_settings] = lambda: limited
    app.state.db.spent["user:test-user:tokens"] = 10
    assert api.post("/voice/parse", json={"transcript": "I read"}).status_code == 429
    assert api.post("/coach/letter", json=LETTER).status_code == 429
    assert provider.opened == 0


def test_an_allowance_of_zero_is_off(api):
    use(FakeProvider(["ok"]))
    unlimited = get_settings().model_copy(update={"ai_user_daily_tokens": 0})
    app.dependency_overrides[get_settings] = lambda: unlimited
    app.state.db.spent["user:test-user:tokens"] = 10**9
    assert api.post("/coach/chat", json=ASK).status_code == 200


NUDGE = {"habit_id": "uuid-read", "date": "2026-11-02", "outcome": "logged"}


def test_a_nudge_outcome_is_recorded(api):
    assert api.post("/coach/nudge-outcome", json=NUDGE).status_code == 204
    event = app.state.db.events[0]
    assert (event["kind"], event["outcome"]) == ("nudge", "logged")
    assert event["payload"]["habit_id"] == "uuid-read"


def test_a_nudge_outcome_only_works_on_your_own_habits(api):
    body = {**NUDGE, "habit_id": "someone-elses"}
    assert api.post("/coach/nudge-outcome", json=body).status_code == 404
    assert app.state.db.events == []


def test_a_nudge_outcome_needs_no_test_account(api):
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person", "token")
    assert api.post("/coach/nudge-outcome", json=NUDGE).status_code == 204


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
    assert [m.text for m in provider.seen[-1]["messages"]] == ["latest"]


def voice(api, calls, transcript="anything"):
    provider = use(FakeProvider(calls=calls))
    response = api.post("/voice/parse", json={"transcript": transcript})
    return response.json()["intents"], provider


def calls(*names):
    return [ToolCall(name, {"confidence": "high"}) for name in names]


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
        "why do I skip Mondays",
    )
    assert [i["intent"] for i in intents] == ["shrink_habit", "skip_habit", "undo_last", "ask_coach"]
    assert intents[1]["reason"] == "Sick"
    assert intents[3]["question"] == "Why do I skip Mondays?"


def test_voice_asks_when_two_habits_match(api):
    call = ToolCall("ask_which", {"habits": ["h1", "h2"], "action": "log_habit"})
    assert voice(api, [call])[0] == [
        {
            "intent": "ask_which",
            "action": "log_habit",
            "options": [
                {"habit_id": "uuid-read", "habit_title": "Read"},
                {"habit_id": "uuid-run", "habit_title": "Run"},
            ],
        }
    ]


def test_voice_question_keeps_the_amount(api):
    call = ToolCall("ask_which", {"habits": ["h1", "h2"], "action": "log_amount", "amount": 5})
    assert voice(api, [call])[0][0]["amount"] == 5


def test_voice_doesnt_ask_about_one_real_habit(api):
    call = ToolCall("ask_which", {"habits": ["h1", "h9"], "action": "log_habit"})
    intents = voice(api, [call])[0]
    assert intents == [{"intent": "log_habit", "habit_id": "uuid-read", "habit_title": "Read"}]


@pytest.mark.parametrize(
    "arguments",
    [
        {"habits": ["h8", "h9"], "action": "log_habit"},
        {"habits": ["h1", "h2"], "action": "delete_habit"},
        {"action": "log_habit"},
    ],
)
def test_voice_drops_a_bad_question(api, arguments):
    assert voice(api, [ToolCall("ask_which", arguments)])[0] == []


def voice_response(api, calls, transcript="I read"):
    use(FakeProvider(calls=calls))
    return api.post("/voice/parse", json={"transcript": transcript}).json()


def test_voice_always_returns_what_it_heard(api):
    body = voice_response(api, [ToolCall("log_habit", {"habit": "h1", "confidence": "high"})])
    assert body["heard"] == "I read"
    assert body["level"] == "high"


def test_voice_tells_the_model_it_may_be_misheard(api):
    provider = use(FakeProvider(calls=[]))
    api.post("/voice/parse", json={"transcript": "anduda latest update"})
    assert "speech recognition" in provider.seen[0]["system"]
    assert "undo" in provider.seen[0]["system"]
    assert "anduda latest update" in provider.seen[0]["messages"][0].text
    assert "may be wrong: undo" in provider.seen[0]["messages"][0].text


def test_a_guess_at_a_misheard_word_needs_confirming(api):
    call = ToolCall("undo_last", {"confidence": "high"})
    body = voice_response(api, [call], "anduda latest update")
    assert body["level"] == "medium"
    assert body["corrected"].startswith("undo")
    assert body["heard"] == "anduda latest update"


def test_an_amount_keeps_the_unit_it_was_said_in(api):
    call = ToolCall("log_amount", {"habit": "h1", "amount": 2, "unit": " lines ", "confidence": "high"})
    intents = voice_response(api, [call], "read 2-3 lines")["intents"]
    assert intents == [
        {"intent": "log_amount", "habit_id": "uuid-read", "habit_title": "Read", "amount": 2, "unit": "lines"}
    ]


@pytest.mark.parametrize("unit", [None, "more", " More ", ""])
def test_an_amount_without_a_unit_says_none(api, unit):
    call = ToolCall("log_amount", {"habit": "h1", "amount": 8, "unit": unit, "confidence": "high"})
    assert voice_response(api, [call], "read 8 more")["intents"][0]["unit"] is None


def test_the_parser_is_told_amounts_add_up_and_ranges_use_the_lower_number(api):
    provider = use(FakeProvider(calls=[]))
    api.post("/voice/parse", json={"transcript": "read 8 more"})
    assert "lower number" in provider.seen[0]["system"]
    assert "add up" in provider.seen[0]["system"]


def test_an_amount_on_a_yes_no_habit_is_a_plain_log(api):
    call = ToolCall("log_amount", {"habit": "h2", "amount": 10, "confidence": "high"})
    intents = voice_response(api, [call], "ran for 10 minutes")["intents"]
    assert intents == [{"intent": "log_habit", "habit_id": "uuid-run", "habit_title": "Run"}]


@pytest.mark.parametrize("heard", ["take off study", "I didn't read today", "scratch the run"])
def test_an_undo_without_an_undo_word_asks_first(api, heard):
    call = ToolCall("undo_habit", {"habit": "h1", "confidence": "high"})
    assert voice_response(api, [call], heard)["level"] == "medium"


@pytest.mark.parametrize(
    "heard",
    ["undo the read", "take that back", "cancel the read log", "read wapas kar do",
     "गलती से हो गया, हटा दो", "remove my read log"],
)  # fmt: skip
def test_an_undo_said_plainly_goes_ahead(api, heard):
    call = ToolCall("undo_habit", {"habit": "h1", "confidence": "high"})
    assert voice_response(api, [call], heard)["level"] == "high"


def test_a_low_undo_stays_low(api):
    call = ToolCall("undo_last", {"confidence": "low"})
    assert voice_response(api, [call], "take off")["level"] == "low"


@pytest.mark.parametrize("sureness,level", [("high", "high"), ("medium", "medium"), ("low", "low")])
def test_the_models_own_confidence_counts(api, sureness, level):
    call = ToolCall("log_habit", {"habit": "h1", "confidence": sureness})
    assert voice_response(api, [call])["level"] == level


def test_the_least_sure_call_sets_the_level(api):
    both = [
        ToolCall("log_habit", {"habit": "h1", "confidence": "high"}),
        ToolCall("log_habit", {"habit": "h2", "confidence": "low"}),
    ]
    assert voice_response(api, both)["level"] == "low"


def test_nonsense_is_low_with_nothing_to_do(api):
    body = voice_response(api, [ToolCall("unclear", {})], "blorp frim")
    assert body["level"] == "low"
    assert body["intents"] == []
    assert body["heard"] == "blorp frim"


def test_a_clear_command_for_a_missing_habit_names_it(api):
    call = ToolCall("no_such_habit", {"name": "yoga"})
    body = voice_response(api, [call], "I did yoga")
    assert body["level"] == "no_habit"
    assert body["missing_habit"] == "Yoga"
    assert body["intents"] == []


def test_something_unrelated_is_off_topic(api):
    body = voice_response(api, [ToolCall("off_topic", {})], "I bought a red car")
    assert body["level"] == "off_topic"
    assert body["intents"] == []


def test_no_calls_at_all_is_off_topic_not_a_mishearing(api):
    assert voice_response(api, [], "lovely weather")["level"] == "off_topic"


def test_undo_a_named_habit(api):
    call = ToolCall("undo_habit", {"habit": "h1", "confidence": "high"})
    body = voice_response(api, [call], "undo the read")
    assert body["intents"] == [
        {"intent": "undo_habit", "habit_id": "uuid-read", "habit_title": "Read"}
    ]


def test_undi_the_read_is_suggested_as_undo(api):
    provider = use(FakeProvider(calls=[]))
    api.post("/voice/parse", json={"transcript": "undi the read"})
    assert "may be wrong: undo the read" in provider.seen[0]["messages"][0].text


def test_a_statement_is_never_sent_to_the_coach(api):
    call = ToolCall("ask_coach", {"question": "I went swimming", "confidence": "high"})
    assert voice_response(api, [call], "I went swimming")["level"] == "off_topic"


@pytest.mark.parametrize(
    "heard",
    ["why do I skip", "how can I start", "gym kyu miss hota hai", "help me plan", "is this ok?"],
)
def test_a_real_question_reaches_the_coach(api, heard):
    call = ToolCall("ask_coach", {"question": heard, "confidence": "high"})
    assert voice_response(api, [call], heard)["intents"][0]["intent"] == "ask_coach"


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


SAMPLE = {"phrase_id": "n001", "heard": "done with gym", "language": "en-IN"}


@pytest.fixture
def samples(tmp_path, monkeypatch):
    path = tmp_path / "spoken.jsonl"
    monkeypatch.setenv("VOICE_SAMPLES_PATH", str(path))
    get_settings.cache_clear()
    yield path
    monkeypatch.delenv("VOICE_SAMPLES_PATH")
    get_settings.cache_clear()


def test_the_spoken_test_saves_what_was_heard_and_nothing_else(api, samples):
    provider = use(FakeProvider(["ok"]))
    assert api.post("/voice/samples", json=SAMPLE).status_code == 204
    assert api.post("/voice/samples", json={**SAMPLE, "phrase_id": "h002", "heard": "जिम"}).status_code == 204
    lines = [json.loads(line) for line in samples.read_text(encoding="utf-8").splitlines()]
    assert lines == [SAMPLE, {**SAMPLE, "phrase_id": "h002", "heard": "जिम"}]
    assert provider.opened == 0


def test_the_spoken_test_is_for_test_accounts_only(api, samples):
    app.dependency_overrides[current_user] = lambda: CurrentUser("real-person", "token")
    assert api.post("/voice/samples", json=SAMPLE).status_code == 403
    assert not samples.exists()


def test_the_spoken_test_is_off_unless_a_path_is_set(api, monkeypatch):
    monkeypatch.setenv("VOICE_SAMPLES_PATH", "")
    get_settings.cache_clear()
    try:
        assert api.post("/voice/samples", json=SAMPLE).status_code == 404
    finally:
        get_settings.cache_clear()


def test_the_spoken_test_takes_only_known_shapes(api, samples):
    assert api.post("/voice/samples", json={**SAMPLE, "phrase_id": "../x"}).status_code == 422
    assert api.post("/voice/samples", json={**SAMPLE, "language": "fr-FR"}).status_code == 422
    assert not samples.exists()
