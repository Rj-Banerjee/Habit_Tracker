from .auth import CurrentUser
from .config import Settings
from .llm.base import LLMProvider


def may_reach_provider(user: CurrentUser, settings: Settings, provider: LLMProvider) -> bool:
    """Free tiers may use prompts for training and people may read them, so on a free
    tier only test accounts get through. See "AI data" in PLAN.md."""
    if not provider.uses_outside_servers() or settings.ai_provider_tier == "paid":
        return True
    return user.id in settings.ai_test_user_ids
