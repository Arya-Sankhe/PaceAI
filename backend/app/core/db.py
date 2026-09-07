import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Lazy asyncpg pool. Single pool for all app SQL; Storage goes via supabase-py."""
    global _pool
    if _pool is None or _pool.is_closing():
        if not settings.SUPABASE_DB_URL:
            raise RuntimeError("SUPABASE_DB_URL must be set.")
        # ponytail: statement_cache_size=0 — required behind Supabase pgbouncer
        _pool = await asyncpg.create_pool(
            settings.SUPABASE_DB_URL, min_size=1, max_size=10, statement_cache_size=0
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
