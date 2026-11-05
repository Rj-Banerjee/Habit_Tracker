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

    async def plan_of(self, user_id: str) -> str:
        """The stored plan. If it can't be read, nothing is unlocked: the caller stops."""
        try:
            response = await self.client.get(
                "/users", params={"select": "plan", "id": f"eq.{user_id}"}
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise Unavailable("Plan isn't readable") from error
        rows = response.json()
        return rows[0]["plan"] if rows else "free"

    async def close(self) -> None:
        await self.client.aclose()


class JobDb(ServiceDb):
    """What the scheduled jobs read and write, all through service_role-only functions."""

    async def rpc(self, name: str, args: dict[str, Any] | None = None) -> Any:
        try:
            response = await self.client.post(f"/rpc/{name}", json=args or {})
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise Unavailable(f"{name} failed") from error
        return response.json()

    async def claim(self, job: str, key: str) -> bool:
        return bool(await self.rpc("job_claim", {"p_job": job, "p_run_key": key}))

    async def release(self, job: str, key: str) -> None:
        await self.rpc("job_release", {"p_job": job, "p_run_key": key})

    async def rebuild_patterns(self) -> int:
        return int(await self.rpc("job_rebuild_patterns"))

    async def letter_candidates(self, hour: int) -> list[dict[str, Any]]:
        return await self.rpc("job_letter_candidates", {"p_hour": hour})

    async def letter_context(self, user_id: str, week_start: str) -> dict[str, Any]:
        return await self.rpc("job_letter_context", {"p_user": user_id, "p_week_start": week_start})

    async def due_reminders(self) -> list[dict[str, Any]]:
        return await self.rpc("job_due_reminders")

    async def due_nudges(self) -> list[dict[str, Any]]:
        return await self.rpc("job_due_nudges")

    async def push_tokens(self, user_id: str) -> list[str]:
        return await self.rpc("job_push_tokens", {"p_user": user_id})
