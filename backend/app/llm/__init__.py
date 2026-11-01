from importlib import import_module

from ..config import Settings
from .base import LLMProvider, Tier
from .reliable import Counters, ReliableProvider

# Adding a provider is one adapter file and one line here. Choosing it is config.
ADAPTERS = {
    "gemini": "app.llm.gemini:GeminiProvider",
    "ollama": "app.llm.ollama:OllamaProvider",
}


def build_provider(settings: Settings, counters: Counters) -> LLMProvider:
    path = ADAPTERS.get(settings.ai_provider)
    if path is None:
        raise ValueError(f"Unknown AI_PROVIDER {settings.ai_provider!r}. Options: {sorted(ADAPTERS)}")
    module, name = path.split(":")
    adapter = getattr(import_module(module), name)
    return ReliableProvider(
        adapter(settings),
        limits={
            Tier.FAST: (settings.ai_fast_rpm, settings.ai_fast_rpd),
            Tier.STRONG: (settings.ai_strong_rpm, settings.ai_strong_rpd),
        },
        counters=counters,
        attempts=settings.ai_retry_attempts,
        budget_seconds=settings.ai_retry_budget_seconds,
    )
