"""Sends a push through Expo's push service, which hands it to FCM or APNs."""

import logging
from typing import Any

import httpx

log = logging.getLogger("ai")


class Push:
    def __init__(self, url: str, transport: httpx.AsyncBaseTransport | None = None):
        self.client = httpx.AsyncClient(timeout=10, transport=transport)
        self.url = url

    async def send(self, tokens: list[str], title: str, body: str, data: dict[str, Any]) -> int:
        """How many phones took it. A failure costs one push, never the whole job."""
        if not tokens:
            return 0
        messages = [
            {"to": token, "title": title, "body": body, "data": data, "sound": "default"}
            for token in tokens
        ]
        try:
            response = await self.client.post(self.url, json=messages)
            response.raise_for_status()
        except httpx.HTTPError as error:
            log.warning("Push not sent: %s", type(error).__name__)
            return 0
        tickets = response.json().get("data", [])
        return sum(1 for ticket in tickets if ticket.get("status") == "ok")

    async def close(self) -> None:
        await self.client.aclose()
