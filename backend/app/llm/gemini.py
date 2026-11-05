"""Uses the Interactions API. Nothing is stored on Google's side (store=False), so the
whole conversation is sent each time."""

import asyncio
import re
from collections.abc import AsyncIterator
from typing import Any

from google import genai
from google.genai import types

from ..config import Settings
from .base import (
    LLMError,
    LLMProvider,
    Message,
    Misconfigured,
    RateLimited,
    Refused,
    Tier,
    ToolCall,
    ToolResult,
    ToolSpec,
    Unavailable,
)

# A stalled model is reported rather than waited on. Measured November 2026: the
# flash models can take over 40 seconds with default thinking, and under 4 with low.
STALL_SECONDS = 25.0
THINKING_LEVEL = "low"
# Thinking spends from the same budget as the reply. Without this a letter stopped after
# one sentence, so max_tokens here means the words people actually read.
THINKING_ALLOWANCE = 1500

BLOCKED_CODES = {"safety", "recitation", "prohibited_content", "spii", "blocklist", "content_blocked"}
ROLES = {"user": "user_input", "assistant": "model_output"}


def to_llm_error(error: Exception) -> LLMError:
    """Works from the status and body, since the SDK's error classes are private."""
    if isinstance(error, LLMError):
        return error
    if isinstance(error, TimeoutError):
        return Unavailable("Timed out")
    status = getattr(error, "status_code", None)
    body = str(getattr(error, "body", "") or error)
    if status == 429:
        delay = re.search(r"retryDelay'?\"?:\s*'?\"?(\d+(?:\.\d+)?)s", body)
        return RateLimited(
            retry_after=float(delay.group(1)) if delay else None,
            daily="quota_exceeded" in body or "PerDay" in body,
        )
    if status in (401, 403, 404) or (status == 400 and "API key" in body):
        return Misconfigured(f"Gemini returned {status}")
    if status is None or status >= 500:
        return Unavailable(f"Gemini failed: {type(error).__name__}")
    return LLMError(f"Gemini returned {status}")


def to_input(messages: list[Message]) -> list[dict[str, Any]]:
    return [
        {"type": ROLES[m.role], "content": [{"type": "text", "text": m.text}]} for m in messages
    ]


class GeminiProvider(LLMProvider):
    def __init__(self, settings: Settings):
        self.models = {Tier.FAST: settings.ai_model_fast, Tier.STRONG: settings.ai_model_strong}
        self.client = None
        if settings.gemini_api_key:
            self.client = genai.Client(
                api_key=settings.gemini_api_key,
                # One attempt: ReliableProvider owns retries, so they don't multiply.
                http_options=types.HttpOptions(
                    timeout=int(STALL_SECONDS * 1000),
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            )

    def _sdk(self) -> Any:
        if self.client is None:
            raise Misconfigured("GEMINI_API_KEY isn't set")
        return self.client.aio

    def _request(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int
    ) -> dict[str, Any]:
        return {
            "model": self.models[tier],
            "input": to_input(messages),
            "system_instruction": system,
            "store": False,
            "generation_config": {
                "max_output_tokens": max_tokens + THINKING_ALLOWANCE,
                "thinking_level": THINKING_LEVEL,
            },
        }

    async def stream_chat(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[str]:
        request = self._request(tier, system, messages, max_tokens)
        try:
            stream = await asyncio.wait_for(
                self._sdk().interactions.create(stream=True, **request), STALL_SECONDS
            )
            events = aiter(stream)
            while True:
                try:
                    event = await asyncio.wait_for(anext(events), STALL_SECONDS)
                except StopAsyncIteration:
                    return
                if event.event_type == "step.delta" and event.delta.type == "text":
                    if event.delta.text:
                        yield event.delta.text
                elif event.event_type == "error":
                    code = str(getattr(event.error, "code", ""))
                    if code in BLOCKED_CODES:
                        raise Refused(code)
                    if code in ("rate_limit_exceeded", "too_many_requests", "quota_exceeded"):
                        raise RateLimited(daily=code == "quota_exceeded")
                    raise Unavailable(code)
        except Exception as error:
            raise to_llm_error(error) from error

    async def call_tools(
        self,
        tier: Tier,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> ToolResult:
        request = self._request(tier, system, messages, max_tokens)
        request["generation_config"]["tool_choice"] = "validated"
        request["tools"] = [
            {
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            }
            for tool in tools
        ]
        try:
            response = await asyncio.wait_for(
                self._sdk().interactions.create(**request), STALL_SECONDS
            )
        except Exception as error:
            raise to_llm_error(error) from error

        calls: list[ToolCall] = []
        text = ""
        for step in response.steps or []:
            if step.type == "function_call":
                calls.append(ToolCall(step.name, step.arguments or {}))
            elif step.type == "model_output":
                text += "".join(c.text or "" for c in step.content or [] if c.type == "text")
        return ToolResult(calls=calls, text=text)

    async def count_tokens(self, tier: Tier, system: str, messages: list[Message]) -> int:
        contents = "\n".join([system, *(m.text for m in messages)])
        try:
            response = await asyncio.wait_for(
                self._sdk().models.count_tokens(model=self.models[tier], contents=contents),
                STALL_SECONDS,
            )
        except Exception as error:
            raise to_llm_error(error) from error
        return response.total_tokens or 0
