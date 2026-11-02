import json

import httpx
import pytest

from app.config import get_settings
from app.llm import ADAPTERS, build_provider
from app.llm.base import (
    LLMError,
    Message,
    Misconfigured,
    RateLimited,
    Tier,
    ToolSpec,
    Unavailable,
)
from app.llm.gemini import GeminiProvider, to_input, to_llm_error
from app.llm.ollama import OllamaProvider

from .fakes import FakeDb

HI = [Message("user", "hi")]


class ApiError(Exception):
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.body = body


def test_unknown_provider_names_the_options():
    settings = get_settings().model_copy(update={"ai_provider": "nope"})
    with pytest.raises(ValueError, match="gemini"):
        build_provider(settings, FakeDb())


def test_switching_provider_is_config_only():
    for name in ADAPTERS:
        settings = get_settings().model_copy(update={"ai_provider": name})
        assert build_provider(settings, FakeDb()).inner is not None


@pytest.mark.parametrize(
    "body,daily",
    [
        ({"error": {"code": "rate_limit_exceeded", "message": "slow"}}, False),
        ({"error": {"code": "too_many_requests", "message": "slow"}}, False),
        ({"error": {"code": "quota_exceeded", "message": "done"}}, True),
    ],
)
def test_gemini_429s(body, daily):
    error = to_llm_error(ApiError(429, body))
    assert isinstance(error, RateLimited)
    assert error.daily is daily


def test_gemini_reads_a_retry_delay():
    body = [{"error": {"details": [{"retryDelay": "17s"}]}}]
    assert to_llm_error(ApiError(429, body)).retry_after == 17


@pytest.mark.parametrize(
    "status,body,kind",
    [
        (503, "busy", Unavailable),
        (500, "oops", Unavailable),
        (404, "no model", Misconfigured),
        (400, "API key not valid", Misconfigured),
        (400, "bad request", LLMError),
    ],
)
def test_gemini_error_mapping(status, body, kind):
    assert type(to_llm_error(ApiError(status, body))) is kind


def test_gemini_timeout_is_temporary():
    assert isinstance(to_llm_error(TimeoutError()), Unavailable)


def test_gemini_leaves_room_for_thinking_on_top_of_the_reply():
    provider = GeminiProvider(get_settings())
    request = provider._request(Tier.FAST, "s", HI, 500)
    assert request["generation_config"]["max_output_tokens"] > 500 + 1000


def test_gemini_turn_shape():
    assert to_input([Message("user", "a"), Message("assistant", "b")]) == [
        {"type": "user_input", "content": [{"type": "text", "text": "a"}]},
        {"type": "model_output", "content": [{"type": "text", "text": "b"}]},
    ]


async def test_gemini_without_a_key_is_misconfigured_not_a_crash():
    provider = GeminiProvider(get_settings())
    with pytest.raises(Misconfigured):
        await provider.count_tokens(Tier.FAST, "s", HI)


def ollama(handler):
    return OllamaProvider(get_settings(), transport=httpx.MockTransport(handler))


async def test_ollama_streams_ndjson():
    def handler(request):
        body = json.loads(request.content)
        assert body["model"] == "strong-model"
        assert body["messages"][0] == {"role": "system", "content": "sys"}
        lines = [
            {"message": {"content": "Hel"}, "done": False},
            {"message": {"content": "lo"}, "done": False},
            {"message": {"content": ""}, "done": True},
        ]
        return httpx.Response(200, text="\n".join(json.dumps(line) for line in lines))

    provider = ollama(handler)
    assert [t async for t in provider.stream_chat(Tier.STRONG, "sys", HI, 10)] == ["Hel", "lo"]


async def test_ollama_tool_calls():
    tool = ToolSpec("log_habit", "Log it", {"type": "object", "properties": {}})

    def handler(request):
        body = json.loads(request.content)
        assert body["model"] == "fast-model"
        assert body["tools"][0]["function"]["name"] == "log_habit"
        call = {"function": {"name": "log_habit", "arguments": {"habit": "h1"}}}
        return httpx.Response(200, json={"message": {"content": "", "tool_calls": [call]}})

    result = await ollama(handler).call_tools(Tier.FAST, "s", HI, [tool], 10)
    assert result.calls[0].name == "log_habit"
    assert result.calls[0].arguments == {"habit": "h1"}


async def test_ollama_counts_with_the_prompt_size():
    provider = ollama(lambda _: httpx.Response(200, json={"prompt_eval_count": 42}))
    assert await provider.count_tokens(Tier.FAST, "s", HI) == 42


async def test_ollama_not_running_is_temporary():
    def handler(_):
        raise httpx.ConnectError("refused")

    with pytest.raises(Unavailable):
        await ollama(handler).call_tools(Tier.FAST, "s", HI, [], 10)


async def test_ollama_missing_model_is_misconfigured():
    with pytest.raises(Misconfigured):
        await ollama(lambda _: httpx.Response(404)).count_tokens(Tier.FAST, "s", HI)


def test_ollama_stays_on_this_machine():
    assert not OllamaProvider(get_settings()).uses_outside_servers()
