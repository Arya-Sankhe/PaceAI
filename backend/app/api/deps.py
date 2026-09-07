"""Trust-boundary checks. Every protected route uses one of these."""

import hashlib
import hmac
import time
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, Request

from app.core import db
from app.core.config import settings

_jwks_cache: dict = {"keys": None, "at": 0.0}
JWKS_TTL = 600


async def get_conn():
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        yield conn


async def _jwks_keys() -> dict:
    if not settings.SUPABASE_JWT_JWKS_URL:
        raise HTTPException(503, "Auth not configured")
    now = time.time()
    if _jwks_cache["keys"] is None or now - _jwks_cache["at"] > JWKS_TTL:
        # ponytail: async fetch — the sync call blocked the loop on every cache miss
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.get(settings.SUPABASE_JWT_JWKS_URL)
        r.raise_for_status()
        _jwks_cache.update(keys={k["kid"]: k for k in r.json()["keys"]}, at=now)
    return _jwks_cache["keys"]


async def require_user(authorization: str = Header("")) -> UUID:
    """Validates Supabase access token, returns auth user id."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing_bearer")
    token = authorization[7:]
    try:
        kid = jwt.get_unverified_header(token)["kid"]
        key = (await _jwks_keys())[kid]
        payload = jwt.decode(
            token,
            key=jwt.PyJWK(key).key,
            algorithms=["ES256", "RS256"],
            issuer=settings.SUPABASE_JWT_ISSUER or None,
            options={"verify_aud": False},
        )
        return UUID(payload["sub"])
    except (KeyError, jwt.PyJWTError):
        raise HTTPException(401, "invalid_token")


async def require_admin(user_id: UUID = Depends(require_user), conn=Depends(get_conn)) -> UUID:
    row = await conn.fetchrow("SELECT role FROM app_users WHERE id = $1", user_id)
    if row is None or row["role"] != "admin":
        raise HTTPException(403, "admin_required")
    return user_id


async def require_edge(
    x_edge_id: str = Header(""), x_edge_secret: str = Header(""), conn=Depends(get_conn)
):
    """Per-collector bearer secret (sha256 hex at rest). Revocable via is_active."""
    try:
        edge_id = UUID(x_edge_id)
    except ValueError:
        raise HTTPException(401, "unknown_edge")
    row = await conn.fetchrow(
        "SELECT id, secret_hash, is_active FROM edge_devices WHERE id = $1", edge_id
    )
    if row is None or not row["is_active"]:
        raise HTTPException(401, "unknown_edge")
    digest = hashlib.sha256(x_edge_secret.encode()).hexdigest()
    if not hmac.compare_digest(digest, row["secret_hash"]):
        raise HTTPException(401, "bad_edge_secret")
    await conn.execute(
        "UPDATE edge_devices SET last_seen_at = now() WHERE id = $1", edge_id
    )
    return row


def log_admin(action: str, request: Request, target: str = "") -> None:
    # ponytail: structured stdout, log shipper handles the rest — no logging service in MVP
    print(f"admin action={action} target={target} ip={request.client.host}")
