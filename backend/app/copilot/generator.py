"""Gemini synthesis with citation allowlist validation. Retry once, then stable error."""

import json
import threading
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
    clean["hypotheses"] = [h for h in (clean["hypotheses"] or []) if isinstance(h, dict)][:10]
    clean["next_checks"] = [str(x)[:500] for x in (clean["next_checks"] or [])][:20]
    
    allowed_doc_pages = set()
    if allowed_pages:
        for p in allowed_pages:
            doc_id = str(p.get("document_id", ""))
            pg_num = p.get("page_number")
            if doc_id and pg_num is not None:
                allowed_doc_pages.add((doc_id, int(pg_num)))

    kept = []
    for c in clean["citations"] or []:
        if not isinstance(c, dict):
            continue
        pid = str(c.get("page_id", c.get("id", "")))
        doc_id = str(c.get("document_id", ""))
        pg_num = c.get("page_number")
        is_allowed_id = pid in allowed_ids if pid else False
        is_allowed_doc_page = (
            (doc_id, int(pg_num)) in allowed_doc_pages
            if (doc_id and pg_num is not None and allowed_doc_pages)
            else False
        )
        if is_allowed_id or is_allowed_doc_page:
            kept.append(c)
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
                gemini.generate_json_multi, prompt.SYSTEM + "\n\n" + user_prompt, images
            )
            return json.loads(raw), {"latency_ms": int((time.time() - t0) * 1000)}
        except Exception as e:  # noqa: BLE001 — retry once with identical evidence, then fail closed
            last = e
    raise DiagnosticError(f"bad_model_output: {type(last).__name__}")


async def stream_generate(user_prompt: str, images: list[bytes]):
    """Yields delta text chunks. Caller accumulates — async generators can't return values."""
    from google.genai import types

    from app.core.config import settings

    chan: list = []

    def _run():
        try:
            from google import genai

            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            parts: list = [prompt.SYSTEM + "\n\n" + user_prompt]
            for png in images[:4]:
                parts.append(types.Part.from_bytes(data=png, mime_type="image/png"))
            for chunk in client.models.generate_content_stream(
                model=settings.GEMINI_MODEL, contents=parts,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", temperature=0.1),
            ):
                if chunk.text:
                    chan.append(("t", chunk.text))
            chan.append(("done", None))
        except Exception as e:  # noqa: BLE001 — surfaced below as a stable error event
            chan.append(("err", e))

    th = threading.Thread(target=_run, daemon=True)
    th.start()
    while True:
        await anyio.sleep(0.05)
        while chan:
            kind, payload = chan.pop(0)
            if kind == "t":
                yield payload
            elif kind == "err":
                raise DiagnosticError(f"bad_model_output: {type(payload).__name__}")
            else:
                th.join()
                return
