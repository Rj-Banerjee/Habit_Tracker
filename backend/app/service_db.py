"""The only code that uses the secret key: rate-limit counters and coach events.
People's own data is read with their own token in tracker.py."""

import logging
from typing import Any

import httpx

from .config import Settings
from .llm.base import Unavailable

log = logging.getLogger("ai")


class ServiceDb:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        key = settings.supabase_secret_key
        self.client = httpx.AsyncClient(
            base_url=f"{settings.supabase_url}/rest/v1",
            timeout=10,
            transport=transport,
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )

    async def take_slot(self, scope: str, limit: int, seconds: int) -> int:
        """Seconds to wait, or 0 if granted. A limit of 0 turns the check off."""
        if limit <= 0:
            return 0
        try:
            response = await self.client.post(
                "/rpc/ai_take_slot",
                json={"p_scope": scope, "p_limit": limit, "p_seconds": seconds},
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            # Without counters nothing can be promised about limits, so stop here.
            raise Unavailable("Counters aren't reachable") from error
        return response.json()

    async def spend(self, scope: str, amount: int, seconds: int) -> int:
        """Adds to a running total and returns it."""
        try:
            response = await self.client.post(
                "/rpc/ai_spend",
                json={"p_scope": scope, "p_amount": amount, "p_seconds": seconds},
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise Unavailable("Counters aren't reachable") from error
        return response.json()

    async def record_coach_event(
        self, user_id: str, kind: str, payload: dict[str, Any], outcome: str
    ) -> None:
        """Never holds up a reply: losing one event is better than failing the coach."""
        try:
            response = await self.client.post(
                "/coach_events",
                json={"user_id": user_id, "kind": kind, "payload": payload, "outcome": outcome},
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            log.warning("Coach event not saved: %s", type(error).__name__)

    async def close(self) -> None:
        await self.client.aclose()
