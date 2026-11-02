"""Reads the signed-in person's data with their own token, so RLS applies and this
service holds no database credentials for these reads."""

from datetime import date, timedelta
from typing import Any

import httpx

from .auth import CurrentUser
from .config import Settings


class TrackerUnavailable(Exception):
    pass


class Tracker:
    def __init__(self, settings: Settings, user: CurrentUser):
        self.client = httpx.AsyncClient(
            base_url=f"{settings.supabase_url}/rest/v1",
            timeout=10,
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {user.token}",
            },
        )

    async def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        try:
            response = await self.client.get(path, params=params)
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise TrackerUnavailable from error
        return response.json()

    async def _rpc(self, name: str) -> Any:
        try:
            response = await self.client.post(f"/rpc/{name}", json={})
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise TrackerUnavailable from error
        return response.json()

    async def close(self) -> None:
        await self.client.aclose()

    async def today(self) -> list[dict[str, Any]]:
        return await self._rpc("get_today")

    async def tone(self) -> str:
        rows = await self._get("/users", {"select": "tone"})
        return rows[0]["tone"] if rows else "gentle"

    async def recent_logs(self, days: int = 14) -> list[dict[str, Any]]:
        since = (date.today() - timedelta(days=days)).isoformat()
        return await self._get(
            "/habit_logs",
            {
                "select": "date,status,level_done,amount,skip_reason,habits(title)",
                "date": f"gte.{since}",
                "order": "date.desc",
                "limit": "200",
            },
        )

    async def identities(self) -> list[dict[str, Any]]:
        return await self._get("/identities", {"select": "name,why_text"})

    async def habits(self) -> list[dict[str, Any]]:
        return await self._get(
            "/habits",
            {"select": "id,title,type,unit,voice_aliases", "archived_at": "is.null"},
        )
