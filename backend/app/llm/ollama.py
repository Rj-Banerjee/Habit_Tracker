"""Runs on this Mac, so nothing leaves it. See https://docs.ollama.com/api/chat."""

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from ..config import Settings
from .base import (
    LLMError,
    LLMProvider,
    Message,
    Misconfigured,
    Tier,
    ToolCall,
    ToolResult,
    ToolSpec,
    Unavailable,
)

# Local models are slow to load the first time.
TIMEOUT = httpx.Timeout(120.0, connect=3.0)


class OllamaProvider(LLMProvider):
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.models = {Tier.FAST: settings.ai_model_fast, Tier.STRONG: settings.ai_model_strong}
        self.client = httpx.AsyncClient(
            base_url=settings.ollama_url, timeout=TIMEOUT, transport=transport
        )

    def uses_outside_servers(self) -> bool:
        return False

    def _body(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int, stream: bool
    ) -> dict[str, Any]:
        turns = [{"role": "system", "content": system}]
        turns += [{"role": m.role, "content": m.text} for m in messages]
        return {
            "model": self.models[tier],
            "messages": turns,
            "stream": stream,
            "options": {"num_predict": max_tokens},
        }

    @staticmethod
    def _check(status: int) -> None:
        if status == 404:
            raise Misconfigured("Model not found. Run: ollama pull <model>")
        if status >= 500:
            raise Unavailable(f"Ollama returned {status}")
        if status >= 400:
            raise LLMError(f"Ollama returned {status}")

    async def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self.client.post("/api/chat", json=body)
        except httpx.HTTPError as error:
            raise Unavailable("Ollama isn't reachable") from error
        self._check(response.status_code)
        return response.json()

    async def stream_chat(
        self, tier: Tier, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[str]:
        body = self._body(tier, system, messages, max_tokens, stream=True)
        try:
            async with self.client.stream("POST", "/api/chat", json=body) as response:
                self._check(response.status_code)
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    event = json.loads(line)
                    if text := event.get("message", {}).get("content"):
                        yield text
        except httpx.HTTPError as error:
            raise Unavailable("Ollama isn't reachable") from error

    async def call_tools(
        self,
        tier: Tier,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> ToolResult:
        body = self._body(tier, system, messages, max_tokens, stream=False)
        body["tools"] = [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in tools
        ]
        message = (await self._post(body)).get("message", {})
        calls = [
            ToolCall(call["function"]["name"], call["function"].get("arguments") or {})
            for call in message.get("tool_calls") or []
        ]
        return ToolResult(calls=calls, text=message.get("content") or "")

    async def count_tokens(self, tier: Tier, system: str, messages: list[Message]) -> int:
        # There's no count endpoint, so ask for one token and read the prompt's size.
        body = self._body(tier, system, messages, 1, stream=False)
        return (await self._post(body)).get("prompt_eval_count", 0)
