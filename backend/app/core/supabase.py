from supabase import create_client, Client
from app.core.config import settings
import threading

_admin_client: Client | None = None
_lock = threading.Lock()

def get_supabase_admin_client() -> Client:
    """
    Thread-safe client reserved strictly for Storage & Auth administration.
    Database DML routes through dedicated database connection pool (SUPABASE_DB_URL).
    """
    global _admin_client
    if _admin_client is None:
        with _lock:
            if _admin_client is None:
                if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
                    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
                _admin_client = create_client(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_SERVICE_ROLE_KEY
                )
    return _admin_client
