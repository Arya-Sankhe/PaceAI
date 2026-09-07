from supabase import create_client, Client
from app.core.config import settings
import logging
import threading

logger = logging.getLogger(__name__)

_supabase_client: Client = None
_lock = threading.Lock()

def get_supabase_client() -> Client:
    """
    Returns a thread-safe singleton instance of the Supabase client initialized with
    the service role key for full backend operational access.
    """
    global _supabase_client
    if _supabase_client is None:
        with _lock:
            if _supabase_client is None:
                if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
                    logger.warning(
                        "Supabase credentials not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing). "
                        "Running in unconfigured / offline mock mode."
                    )
                    return None
                _supabase_client = create_client(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_SERVICE_ROLE_KEY
                )
    return _supabase_client
