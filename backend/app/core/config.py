from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List, Dict, Any
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "Orion AI Copilot"
    API_V1_STR: str = "/api/v1"
    
    # Environment
    ENVIRONMENT: str = Field(default="development", env="ENVIRONMENT")
    DEBUG: bool = Field(default=True, env="DEBUG")
    
    # Supabase Configuration
    SUPABASE_URL: str = Field(default="", env="SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="", env="SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_ANON_KEY: str = Field(default="", env="SUPABASE_ANON_KEY")
    SUPABASE_DB_URL: str = Field(default="", env="SUPABASE_DB_URL")
    SUPABASE_STORAGE_BUCKET_MANUALS: str = Field(default="manual-documents", env="SUPABASE_STORAGE_BUCKET_MANUALS")
    SUPABASE_STORAGE_BUCKET_PAGES: str = Field(default="manual-pages", env="SUPABASE_STORAGE_BUCKET_PAGES")
    
    # Google AI / Vertex Configuration
    GEMINI_API_KEY: str = Field(default="", env="GEMINI_API_KEY")
    GEMINI_PROFILER_MODEL: str = Field(default="gemini-2.5-flash", env="GEMINI_PROFILER_MODEL")
    GEMINI_DIAGNOSTIC_MODEL: str = Field(default="gemini-2.5-pro", env="GEMINI_DIAGNOSTIC_MODEL")
    GOOGLE_MULTIMODAL_EMBEDDING_MODEL: str = Field(
        default="multimodalembedding@002", 
        env="GOOGLE_MULTIMODAL_EMBEDDING_MODEL"
    )
    GOOGLE_CLOUD_PROJECT: str = Field(default="", env="GOOGLE_CLOUD_PROJECT")
    GOOGLE_CLOUD_LOCATION: str = Field(default="us-central1", env="GOOGLE_CLOUD_LOCATION")
    
    # Edge Telemetry Configuration
    TELEMETRY_POLL_INTERVAL_SECONDS: float = Field(default=1.0, env="TELEMETRY_POLL_INTERVAL_SECONDS")
    TELEMETRY_BATCH_FLUSH_SECONDS: float = Field(default=3.0, env="TELEMETRY_BATCH_FLUSH_SECONDS")
    OFFLINE_MOCK_TELEMETRY: bool = Field(default=False, env="OFFLINE_MOCK_TELEMETRY")
    
    # OPC UA Industrial Security & Connection Settings
    OPC_UA_SECURITY_POLICY: str = Field(default="None", env="OPC_UA_SECURITY_POLICY")
    OPC_UA_USERNAME: str = Field(default="", env="OPC_UA_USERNAME")
    OPC_UA_PASSWORD: str = Field(default="", env="OPC_UA_PASSWORD")
    OPC_UA_TIMEOUT_SECONDS: float = Field(default=5.0, env="OPC_UA_TIMEOUT_SECONDS")
    
    # Machines Registry Defaults
    MACHINES: Dict[str, Dict[str, str]] = {
        "orion_1": {
            "name": "Orion VFFS #1",
            "opc_url": "opc.tcp://192.168.213.1:4840",
            "hmi_url": "http://192.168.213.1:81",
        },
        "orion_2": {
            "name": "Orion VFFS #2",
            "opc_url": "opc.tcp://192.168.213.2:4840",
            "hmi_url": "http://192.168.213.2:81",
        }
    }
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
