"""Private Storage only. Uploads originals/renders; mints short signed URLs."""

from app.core.config import settings
from app.core.supabase import get_supabase_admin_client


def put_object(bucket: str, path: str, data: bytes, content_type: str) -> None:
    sb = get_supabase_admin_client()
    sb.storage.from_(bucket).upload(
        # Re-running a job should replace its deterministic page path.
        path, data, {"content-type": content_type, "upsert": "true"}
    )


def get_object(bucket: str, path: str) -> bytes:
    sb = get_supabase_admin_client()
    return sb.storage.from_(bucket).download(path)


def signed_url(bucket: str, path: str) -> tuple[str, int]:
    """Returns (url, expires_in). Never persist the URL — mint per request."""
    sb = get_supabase_admin_client()
    ttl = settings.SIGNED_URL_EXPIRY_SECONDS
    res = sb.storage.from_(bucket).create_signed_url(path, ttl)
    return res["signedURL"], ttl


def doc_prefix(document_id: str) -> str:
    return f"{document_id}/"


def remove_prefix(bucket: str, prefix: str) -> None:
    """Best-effort removal of every object under prefix. Missing bucket/prefix is fine."""
    sb = get_supabase_admin_client()
    try:
        items = sb.storage.from_(bucket).list(prefix) or []
    except Exception:
        return
    paths = [f"{prefix}/{it['name']}" for it in items if it.get("name")]
    for i in range(0, len(paths), 100):
        try:
            sb.storage.from_(bucket).remove(paths[i:i + 100])
        except Exception:
            pass


def page_path(document_id: str, page_number: int) -> str:
    return f"{document_id}/page_{page_number:04d}.png"
