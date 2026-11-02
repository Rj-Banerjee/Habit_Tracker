import json

import httpx
import pytest

from app.config import get_settings
from app.llm.base import Unavailable
from app.service_db import ServiceDb


def db(handler):
    return ServiceDb(get_settings(), transport=httpx.MockTransport(handler))


async def test_take_slot_calls_the_function_with_the_secret_key():
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/ai_take_slot"
        assert request.headers["apikey"] == "secret"
        assert json.loads(request.content) == {"p_scope": "s", "p_limit": 5, "p_seconds": 60}
        return httpx.Response(200, json=12)

    assert await db(handler).take_slot("s", 5, 60) == 12


async def test_a_limit_of_zero_skips_the_database():
    def handler(_):
        raise AssertionError("no call expected")

    assert await db(handler).take_slot("s", 0, 60) == 0


async def test_counters_down_is_unavailable():
    with pytest.raises(Unavailable):
        await db(lambda _: httpx.Response(500)).take_slot("s", 5, 60)


async def test_a_lost_coach_event_doesnt_raise():
    await db(lambda _: httpx.Response(500)).record_coach_event("u", "chat", {}, "replied")


async def test_coach_event_shape():
    def handler(request):
        assert request.url.path == "/rest/v1/coach_events"
        assert json.loads(request.content)["outcome"] == "replied"
        return httpx.Response(201)

    await db(handler).record_coach_event("u", "chat", {"turns": 1}, "replied")
