"""Scheduled jobs, called by Supabase's pg_cron with a shared secret. Each is safe to run
twice: work is claimed before it's done, and a claim is given back if it fails."""

import hmac
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from . import coach
from .auth import CurrentUser
from .config import Settings, get_settings
from .data_policy import may_reach_provider
from .llm.base import LLMError, LLMProvider
from .llm.metered import MeteredProvider
from .push import Push

log = logging.getLogger("ai")

router = APIRouter(prefix="/jobs")

DAY = 24 * 3600
REMINDER_TITLE = "Time for your habits"
REMINDER_BODY = "A small version still counts."


def hour_label(hour: int) -> str:
    twelve = hour % 12 or 12
    return f"{twelve}{'am' if hour < 12 else 'pm'}"


def nudge_body(title: str, hour: int) -> str:
    # The same words the phone uses for its own nudges.
    return f"{title} usually happens around {hour_label(hour)}. The small version counts."


async def job_secret(
    x_job_secret: str = Header(default=""), settings: Settings = Depends(get_settings)
) -> None:
    if not settings.job_secret:
        raise HTTPException(503, "Scheduled jobs are off: JOB_SECRET isn't set")
    # Compared in constant time, so the secret can't be guessed a character at a time.
    if not hmac.compare_digest(x_job_secret.encode(), settings.job_secret.encode()):
        raise HTTPException(401, "Wrong job secret")


class ContextTracker:
    """Gives coach.letter the same reads the app's Tracker does, from one person's job context."""

    def __init__(self, context: dict[str, Any]):
        self.context = context

    async def tone(self) -> str:
        return self.context.get("tone") or "gentle"

    async def identities(self) -> list[dict[str, Any]]:
        return self.context.get("identities") or []

    async def recent_logs(self) -> list[dict[str, Any]]:
        return self.context.get("logs") or []


@router.post("/nightly-patterns", dependencies=[Depends(job_secret)])
async def nightly_patterns(request: Request) -> dict:
    return {"job": "nightly-patterns", "people": await request.app.state.db.rebuild_patterns()}


@router.post("/sunday-letters", dependencies=[Depends(job_secret)])
async def sunday_letters(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    db = request.app.state.db
    provider: LLMProvider = request.app.state.provider
    written = skipped = failed = 0
    for candidate in await db.letter_candidates(settings.job_letter_hour):
        user = CurrentUser(candidate["user_id"], "")
        week = candidate["week_start"]
        # On a free tier, only test accounts reach the provider, scheduled or not.
        if not may_reach_provider(user, settings, provider):
            skipped += 1
            continue
        key = f"{user.id}:{week}"
        if not await db.claim("sunday-letter", key):
            continue
        try:
            context = await db.letter_context(user.id, week)
            metered = MeteredProvider(provider)
            stream = await coach.letter(metered, ContextTracker(context), context.get("wins") or [], context.get("mood"))
            text = "".join([piece async for piece in stream])
            await db.record_coach_event(user.id, "letter", {"week_start": week, "text": text, "scheduled": True}, "written")
            await db.spend(f"user:{user.id}:tokens", metered.tokens, DAY)
            written += 1
        except LLMError as error:
            log.warning("Scheduled letter not written: %s", type(error).__name__)
            await db.release("sunday-letter", key)
            failed += 1
    return {"job": "sunday-letters", "written": written, "skipped": skipped, "failed": failed}


@router.post("/reminders-and-nudges", dependencies=[Depends(job_secret)])
async def reminders_and_nudges(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    db = request.app.state.db
    push: Push = request.app.state.push
    counts = {"reminders": 0, "nudges": 0, "no_device": 0}

    async def deliver(job: str, key: str, user_id: str, title: str, body: str, data: dict, event: dict) -> None:
        if not await db.claim(job, key):
            return
        tokens = await db.push_tokens(user_id)
        if not tokens or await push.send(tokens, title, body, data) == 0:
            # Nothing reached a phone, so nothing counts against the day's two, and the
            # phone's own local reminder still goes off.
            await db.release(job, key)
            counts["no_device"] += 1
            return
        await db.record_coach_event(user_id, event["kind"], event["payload"], "sent")
        counts["reminders" if job == "reminder" else "nudges"] += 1

    for due in await db.due_reminders():
        day = due["local_day"]
        await deliver(
            "reminder", f"{due['user_id']}:{day}", due["user_id"], REMINDER_TITLE, REMINDER_BODY,
            {"kind": "reminder"}, {"kind": "reminder", "payload": {"date": day}},
        )
    for due in await db.due_nudges():
        day = due["local_day"]
        await deliver(
            "nudge", f"{due['user_id']}:{day}", due["user_id"], REMINDER_TITLE,
            nudge_body(due["title"], due["usual_hour"]),
            {"kind": "nudge", "habitId": due["habit_id"]},
            {"kind": "nudge", "payload": {"habit_id": due["habit_id"], "date": day}},
        )
    return {"job": "reminders-and-nudges", **counts}
