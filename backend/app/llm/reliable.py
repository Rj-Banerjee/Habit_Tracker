"""Backoff and throttling, for every provider."""

import asyncio
import random
import time
from collections import deque
from collections.abc import AsyncIterator, Awaitable, Callable

from .base import LLMProvider, Message, RateLimited, Tier, ToolResult, ToolSpec, Unavailable

MINUTE = 60.0
DAY = 86400.0


class Window:
    """Counts events in a sliding window."""

    def __init__(self, limit: int, seconds: float, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.seconds = seconds
        self.clock = clock
        self.events: deque[float] = deque()

    def wait_needed(self) -> float:
        """Seconds until there's room. 0 means go ahead."""
        if self.limit <= 0:
            return 0.0
        now = self.clock()
        while self.events and now - self.events[0] >= self.seconds:
            self.events.popleft()
        if len(self.events) < self.limit:
            return 0.0
        return self.seconds - (now - self.events[0])

    def record(self) -> None:
        self.events.append(self.clock())


class ReliableProvider(LLMProvider):
    def __init__(
        self,
        inner: LLMProvider,
        limits: dict[Tier, tuple[int, int]],
        attempts: int,
        budget_seconds: float,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self.inner = inner
        self.windows = {
            tier: (Window(rpm, MINUTE), Window(rpd, DAY)) for tier, (rpm, rpd) in limits.items()
        }
        self.attempts = attempts
        self.budget_seconds = budget_seconds
        self.sleep = sleep

    def _admit(self, tier: Tier) -> None:
        minute, day = self.windows[tier]
        wait = day.wait_needed()
        if wait:
            raise RateLimited(retry_after=wait, daily=True)
        wait = minute.wait_needed()
        if wait:
            raise RateLimited(retry_after=wait)
        minute.record()
        day.record()

    def _delay(self, attempt: int, error: Exception) -> float:
        """How long to wait before retrying, or raises if it isn't worth it."""
        if attempt + 1 >= self.attempts:
            raise error
        delay = 2.0**attempt + random.uniform(0, 0.5)
        if isinstance(error, RateLimited):
            if error.daily:
                raise error
            delay = max(delay, error.retry_after or 0)
        return delay

    async def _retrying(self, tier: Tier, call: Callable[[], Awaitable]):
        started = time.monotonic()
        attempt = 0
        while True:
            self._admit(tier)
            try:
                return await call()
            except (RateLimited, Unavailable) as error:
                delay = self._delay(attempt, error)
                # Someone is waiting. Better to say "busy" than to hang.
                if time.monotonic() - started + delay > self.budget_seconds:
                    raise
                await self.sleep(delay)
                attempt += 1

    async def stream_chat(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[str]:
        async def opened():
            stream = self.inner.stream_chat(tier, system, messages, max_tokens)
            return stream, await anext(stream, None)

        # Only the opening is retried. Once words are showing, a retry would repeat them.
        stream, first = await self._retrying(tier, opened)
        if first is None:
            return
        yield first
        async for text in stream:
            yield text

    async def call_tools(
        self,
        tier: Tier,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> ToolResult:
        return await self._retrying(
            tier, lambda: self.inner.call_tools(tier, system, messages, tools, max_tokens)
        )

    async def count_tokens(self, tier: Tier, system: str, messages: list[Message]) -> int:
        return await self.inner.count_tokens(tier, system, messages)

    def uses_outside_servers(self) -> bool:
        return self.inner.uses_outside_servers()
