"""The one interface the rest of the service sees. Nothing outside app/llm knows
which provider is running."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class Tier(str, Enum):
    FAST = "fast"  # voice parsing and nudges
    STRONG = "strong"  # coach chat and letters


@dataclass(frozen=True)
class Message:
    role: Literal["user", "assistant"]
    text: str


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ToolResult:
    calls: list[ToolCall] = field(default_factory=list)
    text: str = ""


class LLMError(Exception):
    """Base class. Adapters translate every provider failure into one of these."""


class RateLimited(LLMError):
    def __init__(self, retry_after: float | None = None, daily: bool = False):
        super().__init__("rate limited")
        self.retry_after = retry_after
        self.daily = daily  # waiting a few seconds won't help


class Unavailable(LLMError):
    """Temporary: overloaded, timed out or unreachable. Worth retrying."""


class Refused(LLMError):
    """The provider's safety filter blocked this. Retrying won't help."""


class Misconfigured(LLMError):
    """A bad key or model name. Retrying won't help."""


class LLMProvider(ABC):
    @abstractmethod
    def stream_chat(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[str]:
        """Yields text as it arrives."""

    @abstractmethod
    async def call_tools(
        self,
        tier: Tier,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> ToolResult:
        """The model picks from tools. It may also answer in text, or call nothing."""

    @abstractmethod
    async def count_tokens(self, tier: Tier, system: str, messages: list[Message]) -> int:
        """Input tokens only."""

    def uses_outside_servers(self) -> bool:
        """False only for a provider that runs on this machine."""
        return True
