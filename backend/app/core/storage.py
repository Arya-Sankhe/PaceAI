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


def page_path(document_id: str, page_number: int) -> str:
    return f"{document_id}/page_{page_number:04d}.png"
