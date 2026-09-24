import re
from functools import lru_cache
from pathlib import Path
from typing import List, Union
from pydantic import model_validator, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.language import tts_language

BASE_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    PROJECT_NAME: str = "Orion AI Copilot"
    API_V1_STR: str = "/api/v1"
    
    # Defaults to development so bare imports/tests never crash
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    DEMO_MODE: bool = True
    MOCK_FAULT: str = "hor_front_temp"
    MOCK_FAULT_MACHINE: str = "orion_1"
    
    # Supabase (Dedicated role URL + Admin credentials)
    SUPABASE_DB_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET_MANUALS: str = "manual-documents"
    SUPABASE_STORAGE_BUCKET_PAGES: str = "manual-pages"
    
    # Auth
    SUPABASE_JWT_ISSUER: str = ""
    SUPABASE_JWT_JWKS_URL: str = ""
    
    # Gemini API
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_SERVICE_TIER: str = "standard"
    EMBEDDING_MODEL: str = "gemini-embedding-2"
    EMBEDDING_DIMENSION: int = 1536

    # Sarvam speech-to-text (realtime streaming WebSocket)
    SARVAM_API_KEY: str = ""
    # "auto" detects the spoken language per utterance; pin a code like "hi-IN"
    # only to force a single language.
    SARVAM_STT_LANGUAGE: str = "auto"
    # Sarvam text-to-speech (Bulbul). Kept separate from the STT language: the
    # synthesiser needs a concrete code, so this is only the fallback for text
    # carrying no language of its own — each answer brings its language_code.
    SARVAM_TTS_LANGUAGE: str = "en-IN"
    SARVAM_TTS_SPEAKER: str = "shubh"
    
    # Storage signed URL TTL
    SIGNED_URL_EXPIRY_SECONDS: int = 300
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @field_validator("GEMINI_SERVICE_TIER", mode="before")
    @classmethod
    def normalize_service_tier(cls, v: str) -> str:
        tier = str(v or "standard").lower()
        if tier not in ("standard", "flex", "priority"):
            raise ValueError(f"GEMINI_SERVICE_TIER must be standard, flex, or priority (got {v!r})")
        return tier

    @field_validator("SARVAM_STT_LANGUAGE", mode="before")
    @classmethod
    def normalize_stt_language(cls, v: str) -> str:
        v = str(v or "auto").strip()
        if v.lower() == "auto":
            return "auto"
        base = v.lower().replace("_", "-")
        if base == "od-in":
            return "or-IN"  # the synthesiser's Odia spelling; STT wants or-IN
        if not re.fullmatch(r"[a-z]{2,3}(?:-[a-z0-9]{2,8})?", base):
            raise ValueError(f"SARVAM_STT_LANGUAGE must be 'auto' or a BCP-47 code (got {v!r})")
        return f"{base.split('-')[0]}-IN"

    @field_validator("SARVAM_TTS_LANGUAGE", mode="before")
    @classmethod
    def normalize_tts_language(cls, v: str) -> str:
        lang = tts_language(str(v or "").strip() or "en-IN")
        if not lang:
            raise ValueError(f"SARVAM_TTS_LANGUAGE must be a Bulbul language code (got {v!r})")
        return lang

    @field_validator("SARVAM_TTS_SPEAKER", mode="before")
    @classmethod
    def normalize_tts_speaker(cls, v: str) -> str:
        # Bulbul speaker names are case-sensitive and lowercase.
        return str(v or "shubh").strip().lower()

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT == "production" and not self.DEBUG:
            missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY") if not getattr(self, k)]
            if missing:
                raise ValueError(f"Production requires missing secrets: {', '.join(missing)}")
        return self

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
