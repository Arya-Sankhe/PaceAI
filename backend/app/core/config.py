from functools import lru_cache
from pathlib import Path
from typing import List, Union
from pydantic import model_validator, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    EMBEDDING_MODEL: str = "gemini-embedding-2"
    EMBEDDING_DIMENSION: int = 1536
    
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
