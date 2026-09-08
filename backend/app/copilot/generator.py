"""Gemini synthesis with citation allowlist validation. Retry once, then stable error."""

import json
import time

import anyio

from app.core import gemini
from app.copilot import prompt

REQUIRED = ("observed_facts", "hypotheses", "next_checks", "safety_warning",
            "freshness_warning", "citations")


class DiagnosticError(RuntimeError):
    pass


def validate(answer: dict, allowed_ids: set[str], allowed_pages: list[dict] | None = None) -> dict:
    """Pure: drops citations outside the retrieved set, fills missing keys. Tested."""
    if not isinstance(answer, dict):
        raise DiagnosticError("bad_model_output")
    clean = {k: answer.get(k) for k in REQUIRED}
    clean["observed_facts"] = [str(x)[:500] for x in (clean["observed_facts"] or [])][:20]
    clean["hypotheses"] = [
        {
            "cause": str(h.get("cause", ""))[:500],
            "supports": str(h.get("supports", ""))[:500],
            "conflicts": str(h.get("conflicts", ""))[:500],
        }
        for h in (clean["hypotheses"] or [])
        if isinstance(h, dict) and str(h.get("cause", "")).strip()
    ][:10]
    clean["safety_warning"] = str(clean["safety_warning"] or "")[:1000]
    clean["freshness_warning"] = str(clean["freshness_warning"] or "")[:1000]
    clean["next_checks"] = [str(x)[:500] for x in (clean["next_checks"] or [])][:20]
    
    allowed_doc_pages = set()
    page_by_id = {}
    page_by_doc_page = {}
    if allowed_pages:
        for p in allowed_pages:
            doc_id = str(p.get("document_id", ""))
            pg_num = p.get("page_number")
            if doc_id and pg_num is not None:
                allowed_doc_pages.add((doc_id, int(pg_num)))
                page_by_doc_page[(doc_id, int(pg_num))] = p
            if p.get("id"):
                page_by_id[str(p["id"])] = p

    kept = []
    for c in clean["citations"] or []:
        if not isinstance(c, dict):
            continue
        pid = str(c.get("page_id", c.get("id", "")))
        doc_id = str(c.get("document_id", ""))
        pg_num = c.get("page_number")
        try:
            pg_num = int(pg_num) if pg_num is not None else None
        except (TypeError, ValueError):
            continue
        is_allowed_id = pid in allowed_ids if pid else False
        is_allowed_doc_page = (
            (doc_id, pg_num) in allowed_doc_pages
            if (doc_id and pg_num is not None and allowed_doc_pages)
            else False
        )
        if is_allowed_id or is_allowed_doc_page:
            source = page_by_id.get(pid) or page_by_doc_page.get((doc_id, pg_num)) or {}
            kept.append({
                "document_id": str(source.get("document_id", doc_id)),
                "revision": str(source.get("revision", c.get("revision", "")))[:100],
                "page_number": source.get("page_number", pg_num),
                **({"page_id": pid} if pid else {}),
            })
    # ponytail: unsupported citations are dropped, never repaired — a repaired citation is a fabricated one
    clean["citations"] = kept[:8]
    return clean


async def generate(user_prompt: str, images: list[bytes]) -> tuple[dict, dict]:
    """Returns (answer, meta{latency_ms}). Raises DiagnosticError after one identical retry."""
    t0 = time.time()
    last: Exception | None = None
    for _ in range(2):
        try:
            raw = await anyio.to_thread.run_sync(
                gemini.generate_json_multi, user_prompt, images, prompt.SYSTEM
            )
            return json.loads(raw), {"latency_ms": int((time.time() - t0) * 1000)}
        except Exception as e:  # noqa: BLE001 — retry once with identical evidence, then fail closed
            last = e
    raise DiagnosticError(f"bad_model_output: {type(last).__name__}")
