"""Backoff and throttling, for every provider."""

import asyncio
import random
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Protocol

from .base import LLMProvider, Message, RateLimited, Tier, ToolResult, ToolSpec, Unavailable

MINUTE = 60
DAY = 86400


class Counters(Protocol):
    async def take_slot(self, scope: str, limit: int, seconds: int) -> int:
        """Seconds to wait, or 0 if granted."""


class ReliableProvider(LLMProvider):
    def __init__(
        self,
        inner: LLMProvider,
        limits: dict[Tier, tuple[int, int]],
        counters: Counters,
        attempts: int,
        budget_seconds: float,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self.inner = inner
        self.limits = limits
        self.counters = counters
        self.attempts = attempts
        self.budget_seconds = budget_seconds
        self.sleep = sleep

    async def _admit(self, tier: Tier) -> None:
        per_minute, per_day = self.limits[tier]
        # The day goes first, so a refused request doesn't use up a minute slot.
        wait = await self.counters.take_slot(f"provider:{tier.value}:day", per_day, DAY)
        if wait:
            raise RateLimited(retry_after=wait, daily=True)
        wait = await self.counters.take_slot(f"provider:{tier.value}:minute", per_minute, MINUTE)
        if wait:
            raise RateLimited(retry_after=wait)

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
            await self._admit(tier)
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
