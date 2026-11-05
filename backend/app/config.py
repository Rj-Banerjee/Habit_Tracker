from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from typing_extensions import Annotated

CommaList = Annotated[list[str], NoDecode]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Switching provider is only these three, plus that provider's key.
    ai_provider: str
    ai_model_fast: str
    ai_model_strong: str

    # Free tiers may use prompts for training, so only allow-listed test accounts
    # reach the provider. Fails closed: "paid" has to be said out loud.
    ai_provider_tier: Literal["free", "paid"] = "free"
    ai_test_user_ids: CommaList = []

    gemini_api_key: str = ""
    ollama_url: str = "http://localhost:11434"

    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str

    # What one person can use.
    ai_user_chats_per_hour: int = 20
    ai_user_voice_per_hour: int = 60
    # An estimate of tokens across everything one person uses in a day. 0 turns it off.
    ai_user_daily_tokens: int = 100000

    # What the whole service may send, kept under the provider's own limits so
    # we can say "busy" without spending quota. 0 turns a check off.
    ai_fast_rpm: int = 0
    ai_fast_rpd: int = 0
    ai_strong_rpm: int = 0
    ai_strong_rpd: int = 0

    ai_max_input_tokens: int = 8000
    ai_retry_attempts: int = 3
    ai_retry_budget_seconds: float = 8.0

    ai_allowed_origins: CommaList = []

    # Scheduled jobs. Supabase's pg_cron sends this secret with each call. Empty turns the
    # /jobs endpoints off.
    job_secret: str = ""
    # Sunday letters are written from this hour, in each person's own timezone.
    job_letter_hour: int = 18
    # Expo's push service. Tests point it elsewhere.
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"

    @field_validator("ai_test_user_ids", "ai_allowed_origins", mode="before")
    @classmethod
    def split_commas(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
