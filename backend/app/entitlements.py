"""What each plan includes, kept in step with packages/core/src/entitlements.ts by a test.
The app hides what a plan doesn't include; this makes sure the AI service refuses it too."""

from typing import Literal

from .auth import CurrentUser
from .config import Settings

Plan = Literal["free", "pro", "ultra", "enterprise"]
PLANS: tuple[Plan, ...] = ("free", "pro", "ultra", "enterprise")

FREE = ("tracker", "voice.simple", "themes.standard")
PRO = (*FREE, "ai.coach", "ai.nudges", "ai.voice", "ai.setup", "themes.game", "social")
ULTRA = (*PRO, "workspace")
ENTERPRISE = (*ULTRA, "team")

PLAN_FEATURES: dict[Plan, tuple[str, ...]] = {
    "free": FREE,
    "pro": PRO,
    "ultra": ULTRA,
    "enterprise": ENTERPRISE,
}

LOCKED = "Available on Pro."


def as_plan(value: object) -> Plan:
    """Anything unknown counts as Free, so a bad value never unlocks anything."""
    return value if value in PLANS else "free"  # type: ignore[return-value]


def has_feature(plan: Plan, feature: str) -> bool:
    return feature in PLAN_FEATURES[plan]


def effective_plan(user: CurrentUser, stored: Plan, settings: Settings) -> Plan:
    """Test accounts get Pro, so the AI can be tried before plans are sold."""
    if user.id in settings.ai_test_user_ids and not has_feature(stored, "ai.coach"):
        return "pro"
    return stored
