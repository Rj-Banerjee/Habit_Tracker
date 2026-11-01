import pytest

from app.llm.base import Message, Misconfigured, RateLimited, Refused, Tier, ToolResult, Unavailable
from app.llm.reliable import ReliableProvider, Window

from .fakes import FakeProvider

HI = [Message("user", "hi")]
LIMITS = {Tier.FAST: (0, 0), Tier.STRONG: (0, 0)}


def reliable(inner, limits=LIMITS, attempts=3, budget=8.0):
    slept = []

    async def sleep(seconds):
        slept.append(seconds)

    wrapped = ReliableProvider(inner, limits, attempts, budget, sleep=sleep)
    return wrapped, slept


async def collect(provider):
    return [text async for text in provider.stream_chat(Tier.STRONG, "s", HI, 10)]


def test_window_counts_and_clears():
    now = [0.0]
    window = Window(2, 60, clock=lambda: now[0])
    window.record()
    window.record()
    assert window.wait_needed() == 60
    now[0] = 45
    assert window.wait_needed() == 15
    now[0] = 61
    assert window.wait_needed() == 0


def test_a_limit_of_zero_means_no_check():
    window = Window(0, 60)
    window.record()
    assert window.wait_needed() == 0


async def test_retries_a_rate_limit_then_streams():
    inner = FakeProvider([[RateLimited(), None], "Hello", " there"])
    provider, slept = reliable(inner)
    assert await collect(provider) == ["Hello", " there"]
    assert inner.opened == 2
    assert 1 <= slept[0] <= 1.5


async def test_backoff_grows():
    inner = FakeProvider([[Unavailable(), Unavailable(), None], "ok"])
    provider, slept = reliable(inner)
    assert await collect(provider) == ["ok"]
    assert slept[1] >= 2


async def test_gives_up_after_the_last_attempt():
    inner = FakeProvider([[RateLimited(), RateLimited(), RateLimited()]])
    provider, _ = reliable(inner)
    with pytest.raises(RateLimited):
        await collect(provider)
    assert inner.opened == 3


async def test_honours_a_long_retry_after_by_failing_fast():
    inner = FakeProvider([[RateLimited(retry_after=40)]])
    provider, slept = reliable(inner)
    with pytest.raises(RateLimited):
        await collect(provider)
    assert slept == []


async def test_a_daily_limit_is_never_retried():
    inner = FakeProvider([[RateLimited(daily=True)]])
    provider, _ = reliable(inner)
    with pytest.raises(RateLimited):
        await collect(provider)
    assert inner.opened == 1


@pytest.mark.parametrize("error", [Refused(), Misconfigured()])
async def test_permanent_failures_are_not_retried(error):
    inner = FakeProvider([[error]])
    provider, _ = reliable(inner)
    with pytest.raises(type(error)):
        await collect(provider)
    assert inner.opened == 1


async def test_a_failure_after_words_appeared_is_not_retried():
    inner = FakeProvider(["Hello", Unavailable()])
    provider, _ = reliable(inner)
    seen = []
    with pytest.raises(Unavailable):
        async for text in provider.stream_chat(Tier.STRONG, "s", HI, 10):
            seen.append(text)
    assert seen == ["Hello"]
    assert inner.opened == 1


async def test_the_local_throttle_says_busy_without_calling_the_provider():
    inner = FakeProvider(["ok"])
    provider, _ = reliable(inner, {Tier.FAST: (0, 0), Tier.STRONG: (1, 0)})
    await collect(provider)
    with pytest.raises(RateLimited) as caught:
        await collect(provider)
    assert not caught.value.daily
    assert inner.opened == 1


async def test_the_local_daily_cap_reports_daily():
    inner = FakeProvider(["ok"])
    provider, _ = reliable(inner, {Tier.FAST: (0, 0), Tier.STRONG: (0, 1)})
    await collect(provider)
    with pytest.raises(RateLimited) as caught:
        await collect(provider)
    assert caught.value.daily


async def test_tools_are_retried_too():
    inner = FakeProvider([Unavailable()])
    provider, _ = reliable(inner)
    assert await provider.call_tools(Tier.FAST, "s", HI, [], 10) == ToolResult()
    assert inner.opened == 2
