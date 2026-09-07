"""Gemini page enrichment. Never raises — failure leaves the page searchable."""

import json

PROMPT = """Describe this manual page as strict JSON with keys:
page_type (electrical_schematic|troubleshooting|procedure|parts_catalog|parameter_table|overview),
subsystem (Cross Seal|Heater Zones|Film Feed|Poker|Unwind|Box Forming|Safety & I/O|Unknown),
error_codes (array of short identifier strings),
component_tags (array of short component/terminal/axis strings),
summary (one factual sentence, no advice).
Native text for reference: {text}
"""


def profile_page(png_bytes: bytes, native_text: str) -> tuple[dict, str | None]:
    """Returns (metadata, warning). Metadata always has all keys."""
    fallback = {
        "page_type": "unknown", "subsystem": "unknown",
        "error_codes": [], "component_tags": [], "summary": "",
    }
    try:
        from app.core import gemini

        raw = gemini.generate_json(
            PROMPT.format(text=(native_text or "")[:4000]), image_png=png_bytes
        )
        data = json.loads(raw)
        if not isinstance(data, dict):
            return fallback, "non_object_enrichment"
        return {
            "page_type": str(data.get("page_type", "unknown"))[:64],
            "subsystem": str(data.get("subsystem", "unknown"))[:64],
            "error_codes": _str_list(data.get("error_codes"), 50),
            "component_tags": _str_list(data.get("component_tags"), 50),
            "summary": str(data.get("summary", ""))[:2000],
        }, None
    except Exception as e:
        return fallback, f"enrichment_failed: {type(e).__name__}"


def _str_list(v, cap: int) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x)[:64] for x in v[:cap] if str(x).strip()]
