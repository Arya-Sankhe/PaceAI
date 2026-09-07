from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, collector, documents, telemetry
from app.core import db
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await db.close_pool()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(collector.router, prefix=settings.API_V1_STR, tags=["edge"])
    app.include_router(telemetry.router, prefix=settings.API_V1_STR, tags=["telemetry"])
    app.include_router(documents.router, prefix=settings.API_V1_STR, tags=["manuals"])
    app.include_router(chat.router, prefix=settings.API_V1_STR, tags=["copilot"])

    @app.get("/health/live")
    async def live():
        return {"ok": True}

    @app.get("/health/ready")
    async def ready():
        try:
            pool = await db.get_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            return {"ok": True}
        except Exception:
            return {"ok": False}

    return app


app = create_app()
