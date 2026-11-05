import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import coach, jobs, voice
from .auth import CurrentUser, current_user
from .config import Settings, get_settings
from .data_policy import may_reach_provider
from .entitlements import LOCKED, as_plan, effective_plan, has_feature
from .llm import build_provider
from .llm.base import LLMError, LLMProvider, Message, RateLimited, Refused
from .llm.metered import MeteredProvider
from .push import Push
from .service_db import JobDb, ServiceDb
from .tracker import Tracker, TrackerUnavailable

log = logging.getLogger("ai")

BUSY = "Coach is busy, try again in a minute."
OUT_FOR_TODAY = "Coach has run out of requests for today. Try again tomorrow."
UNAVAILABLE = "Coach isn't available right now. Your habits still work as normal."
REFUSED = "Coach can't help with that one. Try asking another way."
TEST_ONLY = "Coach is only open to test accounts for now."
TOO_MANY = "That's a lot of questions for one hour. Try again a bit later."
ONE_LETTER = "You've had this week's letter. There'll be a new one next week."
OUT_OF_ALLOWANCE = "You've used today's coach allowance. It'll be back tomorrow."
WEEK = 7 * 24 * 3600
DAY = 24 * 3600


def describe(error: LLMError) -> tuple[int, str, str, int | None]:
    if isinstance(error, RateLimited):
        message = OUT_FOR_TODAY if error.daily else BUSY
        wait = round(error.retry_after) if error.retry_after else 60
        return 429, "out_for_today" if error.daily else "busy", message, wait
    if isinstance(error, Refused):
        return 422, "refused", REFUSED, None
    # Details stay in our log. A bad key isn't something the user can act on.
    log.warning("AI call failed: %s: %s", type(error).__name__, error)
    return 503, "unavailable", UNAVAILABLE, None


class Denied(Exception):
    def __init__(self, status: int, code: str, message: str, retry_after: int | None = None):
        self.args = (status, code, message, retry_after)


def problem(status: int, code: str, message: str, retry_after: int | None = None) -> JSONResponse:
    headers = {"Retry-After": str(retry_after)} if retry_after else None
    return JSONResponse(
        {"code": code, "message": message, "retry_after": retry_after},
        status_code=status,
        headers=headers,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.db = JobDb(settings)
    app.state.provider = build_provider(settings, app.state.db)
    app.state.push = Push(settings.expo_push_url)
    yield
    await app.state.db.close()
    await app.state.push.close()


app = FastAPI(title="Habit tracker AI service", lifespan=lifespan)
app.include_router(jobs.router)


def add_cors(settings: Settings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ai_allowed_origins,
        allow_methods=["POST", "GET"],
        allow_headers=["Authorization", "Content-Type"],
    )


add_cors(get_settings())


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.provider


@app.exception_handler(LLMError)
async def on_llm_error(_: Request, error: LLMError) -> JSONResponse:
    return problem(*describe(error))


@app.exception_handler(Denied)
async def on_denied(_: Request, error: Denied) -> JSONResponse:
    return problem(*error.args)


@app.exception_handler(TrackerUnavailable)
async def on_tracker_error(_: Request, __: TrackerUnavailable) -> JSONResponse:
    return problem(503, "unavailable", UNAVAILABLE)


def allowance_scope(user: CurrentUser) -> str:
    return f"user:{user.id}:tokens"


async def admit(
    request: Request,
    user: CurrentUser,
    settings: Settings,
    action: str,
    limit: int,
    seconds: int = 3600,
    refused: str = TOO_MANY,
    feature: str = "ai.coach",
) -> None:
    # The plan comes first: Free never reaches the AI, however the app was changed.
    stored = as_plan(await request.app.state.db.plan_of(user.id))
    if not has_feature(effective_plan(user, stored, settings), feature):
        raise Denied(403, "needs_plan", LOCKED)
    if not may_reach_provider(user, settings, request.app.state.provider):
        raise Denied(403, "test_only", TEST_ONLY)
    wait = await request.app.state.db.take_slot(f"user:{user.id}:{action}", limit, seconds)
    if wait:
        raise Denied(429, "too_many", refused, round(wait))
    allowance = settings.ai_user_daily_tokens
    if allowance > 0:
        used = await request.app.state.db.spend(allowance_scope(user), 0, DAY)
        if used >= allowance:
            raise Denied(429, "out_of_allowance", OUT_OF_ALLOWANCE)


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[Turn] = Field(min_length=1, max_length=40)
    # Where the conversation started, for coach_events. The words are never stored.
    source: Literal["chat", "card", "burned_out", "miss_review"] = "chat"
    # One tap from a miss review. It's a choice from a list, so it's safe to keep.
    reason: Literal["tired", "forgot", "no_time", "too_big"] | None = None


class LetterRequest(BaseModel):
    week_start: date
    wins: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=3)
    mood: str | None = Field(default=None, max_length=200)


class VoiceRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=500)


@app.get("/health")
async def health(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    return {"status": "ok", "provider": settings.ai_provider}


def should_act(decision: dict) -> bool:
    """Only a real request reaches the app. Anything else is left to the coach to talk
    through, including asking what they meant."""
    if decision["talk"]:
        return False
    return decision["level"] == "no_habit" or (
        bool(decision["intents"]) and decision["level"] in ("high", "medium")
    )


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@app.post("/coach/chat")
async def coach_chat(
    body: ChatRequest,
    request: Request,
    user: CurrentUser = Depends(current_user),
    settings: Settings = Depends(get_settings),
    provider: LLMProvider = Depends(get_provider),
):
    await admit(request, user, settings, "chat", settings.ai_user_chats_per_hour)
    if body.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the user")

    db: ServiceDb = request.app.state.db
    miss_review = body.source == "miss_review"
    metered = MeteredProvider(provider)

    async def settle() -> None:
        await db.spend(allowance_scope(user), metered.tokens, DAY)

    async def record(outcome: str) -> None:
        payload = {"source": body.source, "turns": len(body.messages)}
        if miss_review:
            await db.record_coach_event(
                user.id, "miss_review", {**payload, "reason": body.reason}, outcome
            )
        else:
            await db.record_coach_event(user.id, "chat", payload, outcome)

    tracker = Tracker(settings, user)
    try:
        messages = [Message(turn.role, turn.text) for turn in body.messages]
        if not miss_review:
            decision = await voice.for_chat(metered, tracker, messages)
            if should_act(decision):
                await record("acted")
                await settle()
                return StreamingResponse(
                    iter([sse({"type": "actions", **decision}), sse({"type": "done"})]),
                    media_type="text/event-stream",
                )
        stream = await coach.reply(metered, settings, tracker, messages, miss_review)
        # Wait for the first words, so a failure can still be a normal error response.
        first = await anext(stream, None)
    except LLMError:
        await record("failed")
        await settle()
        raise
    finally:
        await tracker.close()

    async def events() -> AsyncIterator[str]:
        if first is not None:
            yield sse({"type": "delta", "text": first})
        try:
            async for text in stream:
                yield sse({"type": "delta", "text": text})
        except LLMError as error:
            _, code, message, retry_after = describe(error)
            await record("failed")
            await settle()
            yield sse({"type": "error", "code": code, "message": message, "retry_after": retry_after})
            return
        await record("replied")
        await settle()
        yield sse({"type": "done"})

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/coach/letter")
async def future_letter(
    body: LetterRequest,
    request: Request,
    user: CurrentUser = Depends(current_user),
    settings: Settings = Depends(get_settings),
    provider: LLMProvider = Depends(get_provider),
):
    await admit(request, user, settings, "letter", 1, WEEK, ONE_LETTER)
    db: ServiceDb = request.app.state.db
    metered = MeteredProvider(provider)

    tracker = Tracker(settings, user)
    try:
        stream = await coach.letter(metered, tracker, body.wins, body.mood)
        first = await anext(stream, None)
    finally:
        await tracker.close()

    async def events() -> AsyncIterator[str]:
        text = first or ""
        if first is not None:
            yield sse({"type": "delta", "text": first})
        try:
            async for piece in stream:
                text += piece
                yield sse({"type": "delta", "text": piece})
        except LLMError as error:
            _, code, message, retry_after = describe(error)
            yield sse({"type": "error", "code": code, "message": message, "retry_after": retry_after})
            return
        # Kept, unlike chats: it's something they'll want to read again.
        payload = {"week_start": body.week_start.isoformat(), "text": text}
        await db.record_coach_event(user.id, "letter", payload, "written")
        await db.spend(allowance_scope(user), metered.tokens, DAY)
        yield sse({"type": "done"})

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/voice/parse")
async def voice_parse(
    body: VoiceRequest,
    request: Request,
    user: CurrentUser = Depends(current_user),
    settings: Settings = Depends(get_settings),
    provider: LLMProvider = Depends(get_provider),
) -> dict:
    await admit(request, user, settings, "voice", settings.ai_user_voice_per_hour, feature="ai.voice")
    tracker = Tracker(settings, user)
    metered = MeteredProvider(provider)
    try:
        return await voice.parse(metered, tracker, body.transcript)
    finally:
        await tracker.close()
        await request.app.state.db.spend(allowance_scope(user), metered.tokens, DAY)


class NudgeOutcome(BaseModel):
    habit_id: str = Field(max_length=64)
    date: date
    outcome: Literal["logged", "ignored"]


@app.post("/coach/nudge-outcome", status_code=204)
async def nudge_outcome(
    body: NudgeOutcome,
    request: Request,
    user: CurrentUser = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> None:
    """Nudges are written on the phone, so no AI is involved and no test-account gate
    applies. Whether one helped decides if that habit gets another."""
    tracker = Tracker(settings, user)
    try:
        habits = await tracker.habits()
    finally:
        await tracker.close()
    if body.habit_id not in {habit["id"] for habit in habits}:
        raise HTTPException(404, "Habit not found")
    payload = {"habit_id": body.habit_id, "date": body.date.isoformat()}
    await request.app.state.db.record_coach_event(user.id, "nudge", payload, body.outcome)
