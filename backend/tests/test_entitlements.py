import re
from pathlib import Path

from app.auth import CurrentUser
from app.config import get_settings
from app.entitlements import PLAN_FEATURES, as_plan, effective_plan, has_feature

CORE = Path(__file__).resolve().parents[2] / "packages/core/src/entitlements.ts"


def core_plans() -> dict[str, set[str]]:
    """Reads the plan lists from the app's own file, so the two can't drift apart."""
    source = CORE.read_text()
    lists: dict[str, set[str]] = {}
    for name, body in re.findall(r"const (FREE|PRO|ULTRA|ENTERPRISE): Feature\[\] = \[(.*?)\];", source, re.S):
        features = set(re.findall(r"'([a-z.]+)'", body))
        base = re.search(r"\.\.\.(FREE|PRO|ULTRA)", body)
        if base:
            features |= lists[base.group(1)]
        lists[name] = features
    return {plan.lower(): features for plan, features in lists.items()}


def test_matches_the_apps_own_plan_list():
    assert {plan: set(features) for plan, features in PLAN_FEATURES.items()} == core_plans()


def test_free_has_no_ai():
    assert not has_feature("free", "ai.coach")
    assert not has_feature("free", "ai.voice")
    assert has_feature("pro", "ai.voice")


def test_unknown_plans_are_free():
    assert as_plan("premium") == "free"
    assert as_plan(None) == "free"


def test_test_accounts_are_pro_and_nobody_else_is():
    settings = get_settings()
    assert effective_plan(CurrentUser("test-user", ""), "free", settings) == "pro"
    assert effective_plan(CurrentUser("someone", ""), "free", settings) == "free"
    assert effective_plan(CurrentUser("test-user", ""), "ultra", settings) == "ultra"
