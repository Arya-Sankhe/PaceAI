from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Orion AI Copilot"
    API_V1_STR: str = "/api/v1"
    
    # Environment
    ENVIRONMENT: str = "production"
    DEBUG: bool = False
    
    # Supabase (Dedicated role URL + Admin credentials)
    SUPABASE_DB_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET_MANUALS: str = "manual-documents"
    SUPABASE_STORAGE_BUCKET_PAGES: str = "manual-pages"
    
    # Auth
    SUPABASE_JWT_ISSUER: str = ""
    SUPABASE_JWT_JWKS_URL: str = ""
    
    # Gemini API (Pinned v0.5 MVP baseline)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    EMBEDDING_MODEL: str = "gemini-embedding-2"
    EMBEDDING_DIMENSION: int = 1536
    
    # Storage signed URL TTL
    SIGNED_URL_EXPIRY_SECONDS: int = 300  # 5 minutes
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT == "production" and not self.DEBUG:
            missing = []
            if not self.SUPABASE_URL:
                missing.append("SUPABASE_URL")
            if not self.SUPABASE_SERVICE_ROLE_KEY:
                missing.append("SUPABASE_SERVICE_ROLE_KEY")
            if not self.GEMINI_API_KEY:
                missing.append("GEMINI_API_KEY")
            if missing:
                raise ValueError(f"Production requires missing secrets: {', '.join(missing)}")
        return self

settings = Settings()
