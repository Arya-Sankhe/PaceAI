"""Application-owned hybrid retrieval: exact + FTS + dual HNSW, fused with RRF.

Only ready + active revisions. No cosine threshold in WHERE (HNSW rule).
Fused output capped at 8 pages; images fetched for the top 4 only.
"""

import anyio

from app.core import gemini, storage
from app.core.config import settings
from app.copilot import tokenizer

RRF_K = 60
EXACT_BOOST = 1.0
PAGE_CAP = 8
IMAGE_CAP = 4
LANE_LIMIT = 20

_PAGE_COLS = """p.id, p.document_id, d.revision, p.page_number, p.page_type,
    p.subsystem, p.summary, p.extracted_text, p.storage_path,
    p.error_codes_indexed, p.component_tags"""
_READY = "d.status = 'ready' AND d.is_active"


def rrf_fuse(ranked: list[list], k: int = RRF_K, boost_ids: set | None = None) -> list:
    """Pure RRF over id-lists. Returns [(id, score)] ranked. Tested in test_phase3."""
    scores: dict = {}
    for ids in ranked:
        for rank, pid in enumerate(ids, start=1):
            scores[pid] = scores.get(pid, 0.0) + 1.0 / (k + rank)
    if boost_ids:
        for pid in boost_ids:
            if pid in scores:
                scores[pid] += EXACT_BOOST
    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)


async def retrieve(conn, question: str) -> tuple[list[dict], list[tuple]]:
    """Returns (pages[<=8], images[(page_id, png)] for top <=4). Empty question evidence -> ([], [])."""
    toks = tokenizer.extract(question)
    exact_ids = await _exact(conn, toks)
    fts_ids = await _fts(conn, toks["text"])
    pages = await _pages_by_ids(conn, set(exact_ids) | set(fts_ids))
    if not pages and not toks["text"].strip():
        return [], []

    qvec = await anyio.to_thread.run_sync(gemini.embed_texts, [toks["text"] or " "])
    text_ids = await _vector(conn, "text_embedding", qvec[0])
    img_ids = await _vector(conn, "image_embedding", qvec[0])

    by_id = {p["id"]: p for p in pages}
    by_id.update({p["id"]: p for p in await _pages_by_ids(conn, set(text_ids) | set(img_ids))})
    fused = rrf_fuse([exact_ids, fts_ids, text_ids, img_ids], boost_ids=set(exact_ids))
    top = [(by_id[pid], score) for pid, score in fused if pid in by_id][:PAGE_CAP]
    if not top:
        return [], []
    for page, score in top:
        page["score"] = round(score, 4)
    images = []
    for page, _ in top[:IMAGE_CAP]:
        try:
            png = await anyio.to_thread.run_sync(
                storage.get_object, settings.SUPABASE_STORAGE_BUCKET_PAGES, page["storage_path"]
            )
            images.append((page["id"], png))
        except Exception:
            pass  # Missing image doesn't block text diagnostic
    return [p for p, _ in top], images


async def _exact(conn, toks: dict) -> list:
    if not toks["codes"] and not toks["components"]:
        return []
    rows = await conn.fetch(
        f"""SELECT p.id FROM manual_pages p JOIN manual_documents d ON d.id = p.document_id
            WHERE {_READY} AND (p.error_codes_indexed && $1::text[] OR p.component_tags && $2::text[])
            LIMIT {LANE_LIMIT}""",
        toks["codes"], toks["components"],
    )
    return [r["id"] for r in rows]


async def _fts(conn, text: str) -> list:
    if not text.strip():
        return []
    rows = await conn.fetch(
        f"""SELECT p.id FROM manual_pages p JOIN manual_documents d ON d.id = p.document_id
            WHERE {_READY} AND p.search_tsv @@ plainto_tsquery('english', $1)
            ORDER BY ts_rank(p.search_tsv, plainto_tsquery('english', $1)) DESC
            LIMIT {LANE_LIMIT}""",
        text,
    )
    return [r["id"] for r in rows]


async def _vector(conn, col: str, vec: list[float]) -> list:
    rows = await conn.fetch(
        f"""SELECT p.id FROM manual_pages p JOIN manual_documents d ON d.id = p.document_id
            WHERE {_READY} AND p.{col} IS NOT NULL
            ORDER BY p.{col} <=> $1 LIMIT {LANE_LIMIT}""",
        _vec_lit(vec),
    )
    return [r["id"] for r in rows]


async def _pages_by_ids(conn, ids: set) -> list[dict]:
    if not ids:
        return []
    rows = await conn.fetch(
        f"SELECT {_PAGE_COLS} FROM manual_pages p JOIN manual_documents d ON d.id = p.document_id"
        " WHERE p.id = ANY($1)",
        list(ids),
    )
    return [dict(r) for r in rows]


def _vec_lit(v: list[float]) -> str:
    return "[" + ",".join(str(x) for x in v) + "]"
