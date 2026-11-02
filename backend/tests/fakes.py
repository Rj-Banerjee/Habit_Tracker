from collections.abc import AsyncIterator

from app.llm.base import LLMError, LLMProvider, Message, Tier, ToolCall, ToolResult


class FakeProvider(LLMProvider):
    """Plays back a script. An exception in it is raised at that point."""

    def __init__(self, script=(), calls: list[ToolCall] | None = None, outside: bool = True):
        self.script = list(script)
        self.tool_calls = calls or []
        self.outside = outside
        self.opened = 0
        self.seen: list[dict] = []

    def uses_outside_servers(self) -> bool:
        return self.outside

    async def stream_chat(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[str]:
        self.opened += 1
        self.seen.append({"tier": tier, "system": system, "messages": messages})
        for item in self.script:
            if isinstance(item, list):  # one attempt's failure
                error = item.pop(0) if item else None
                if error:
                    raise error
                continue
            if isinstance(item, LLMError):
                raise item
            yield item

    async def call_tools(self, tier, system, messages, tools, max_tokens) -> ToolResult:
        self.opened += 1
        self.seen.append({"tier": tier, "system": system, "messages": messages})
        self.tool_seen = tools
        if self.script and isinstance(self.script[0], LLMError):
            raise self.script.pop(0)
        return ToolResult(calls=self.tool_calls)

    async def count_tokens(self, tier: Tier, system: str, messages: list[Message]) -> int:
        return (len(system) + sum(len(m.text) for m in messages)) // 4


class FakeDb:
    """Stands in for ServiceDb. Scopes count up to their limit, then refuse."""

    def __init__(self):
        self.used: dict[str, int] = {}
        self.events: list[dict] = []

    async def take_slot(self, scope: str, limit: int, seconds: int) -> int:
        if limit <= 0:
            return 0
        if self.used.get(scope, 0) >= limit:
            return seconds
        self.used[scope] = self.used.get(scope, 0) + 1
        return 0

    async def record_coach_event(self, user_id, kind, payload, outcome) -> None:
        self.events.append({"user": user_id, "kind": kind, "payload": payload, "outcome": outcome})

    async def close(self) -> None:
        pass
