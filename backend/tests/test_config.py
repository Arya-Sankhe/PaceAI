import sys
from pathlib import Path

# Ensure backend root is in sys.path regardless of execution CWD
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import Settings

def test_production_fails_without_secrets():
    try:
        Settings(ENVIRONMENT="production", DEBUG=False)
        assert False, "Should have raised ValueError for missing secrets"
    except ValueError as e:
        assert "Production requires missing secrets" in str(e)

def test_development_allows_defaults():
    s = Settings(ENVIRONMENT="development", DEBUG=True)
    assert s.EMBEDDING_DIMENSION == 1536
    assert s.EMBEDDING_MODEL == "gemini-embedding-2"
    assert s.GEMINI_MODEL == "gemini-3.8-flash"
    assert s.GEMINI_SERVICE_TIER == "standard"
    assert s.ENVIRONMENT == "development"

def test_service_tier_accepts_known_tiers():
    assert Settings(GEMINI_SERVICE_TIER="flex").GEMINI_SERVICE_TIER == "flex"
    assert Settings(GEMINI_SERVICE_TIER="Flex").GEMINI_SERVICE_TIER == "flex"
    assert Settings(GEMINI_SERVICE_TIER="priority").GEMINI_SERVICE_TIER == "priority"

def test_service_tier_rejects_unknown_tiers():
    try:
        Settings(GEMINI_SERVICE_TIER="ultra")
        assert False, "Should have raised ValueError for unknown tier"
    except ValueError as e:
        assert "GEMINI_SERVICE_TIER" in str(e)

if __name__ == "__main__":
    test_production_fails_without_secrets()
    test_development_allows_defaults()
    test_service_tier_accepts_known_tiers()
    test_service_tier_rejects_unknown_tiers()
    print("Baseline config assertions passed.")
