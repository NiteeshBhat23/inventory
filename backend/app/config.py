from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_url: str  # e.g. https://xxxx.supabase.co — used to fetch the JWKS for JWT verification
    cors_origins: str = "http://localhost:5173"

    # ---------- Bill scanning (Phase 2) ----------
    # Deliberately optional: every other feature must keep working — and the
    # app must still boot and deploy — on an environment that has no key set.
    # The bill endpoints check this at request time and return a clean 503,
    # rather than the whole process failing validation at import.
    gemini_api_key: str | None = None
    # Pinned in config rather than in code so a model deprecation is an env-var
    # change, not a redeploy. Default is a vision-capable model on Google's
    # free tier (no billing account required).
    gemini_model: str = "gemini-3.5-flash-lite"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def bill_scanning_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
