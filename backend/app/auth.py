from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, Request

from .config import Settings, get_settings


@dataclass(frozen=True)
class CurrentUser:
    id: str
    token: str


async def current_user(request: Request, settings: Settings = Depends(get_settings)) -> CurrentUser:
    """Supabase checks the token, so key rotation needs nothing from us."""
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in first")
    token = header[7:]
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"apikey": settings.supabase_publishable_key, "Authorization": header},
            )
        except httpx.HTTPError as error:
            raise HTTPException(503, "Can't reach the server") from error
    if response.status_code != 200:
        raise HTTPException(401, "Sign in first")
    return CurrentUser(id=response.json()["id"], token=token)
