"""Counts roughly what one request costs, for the daily allowance. It's an estimate from
text length, so it works the same for every provider."""

from collections.abc import AsyncIterator

from .base import LLMProvider, Message, Tier, ToolResult, ToolSpec

CHARS_PER_TOKEN = 4


def tokens_in(system: str, messages: list[Message]) -> int:
    return (len(system) + sum(len(m.text) for m in messages)) // CHARS_PER_TOKEN


class MeteredProvider(LLMProvider):
    def __init__(self, inner: LLMProvider):
        self.inner = inner
        self.tokens = 0

    async def stream_chat(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[str]:
        self.tokens += tokens_in(system, messages)
        async for text in self.inner.stream_chat(tier, system, messages, max_tokens):
            self.tokens += len(text) // CHARS_PER_TOKEN
            yield text

    async def call_tools(
        self,
        tier: Tier,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> ToolResult:
        self.tokens += tokens_in(system, messages)
        return await self.inner.call_tools(tier, system, messages, tools, max_tokens)

    async def count_tokens(self, tier: Tier, system: str, messages: list[Message]) -> int:
        return await self.inner.count_tokens(tier, system, messages)

    def uses_outside_servers(self) -> bool:
        return self.inner.uses_outside_servers()
