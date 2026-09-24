"""One-manual-at-a-time PDF ingestion. Run: python -m app.ingestion.worker."""

import asyncio
import anyio

from app.core import db, gemini, storage
from app.core.config import settings
from app.ingestion import pdf, profiler

LEASE_S = 600
MAX_ATTEMPTS = 5
IDLE_SLEEP_S = 5
# Pages in flight per manual. Each page is three Gemini calls plus an upload, so
# this bounds provider load — raise it only with quota headroom to spare.
PAGE_CONCURRENCY = 3


async def claim_job(conn):
    """Single atomic claim. Expired leases are retryable — crashed workers don't wedge the queue."""
    return await conn.fetchrow(
        """UPDATE ingestion_jobs SET status = 'processing', attempt_count = attempt_count + 1,
                  leased_until = now() + make_interval(secs => $1), updated_at = now()
           WHERE id = (
               SELECT id FROM ingestion_jobs
               WHERE status = 'pending' OR (status = 'processing' AND leased_until < now())
               ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
           ) RETURNING id, document_id, attempt_count""",
        LEASE_S,
    )


async def process_job(conn, job) -> None:
    doc = await conn.fetchrow("SELECT * FROM manual_documents WHERE id = $1", job["document_id"])
    raw = await anyio.to_thread.run_sync(
        storage.get_object, settings.SUPABASE_STORAGE_BUCKET_MANUALS, doc["pdf_storage_path"]
    )
    # A retry redoes only what is missing: a page row exists only once the page
    # is fully indexed (embeddings + upload included), so committed pages are
    # skipped outright. A first attempt — or a fresh re-upload — still does all.
    skip: set[int] = set()
    if job["attempt_count"] > 1:
        skip = {r["page_number"] for r in await conn.fetch(
            "SELECT page_number FROM manual_pages WHERE document_id = $1", doc["id"]
        )}
    total, pages = await anyio.to_thread.run_sync(pdf.extract_pages, raw, skip)
    await conn.execute(
        "UPDATE manual_documents SET total_pages = $1, status = 'processing' WHERE id = $2",
        total, doc["id"],
    )
    # Pages run a few at a time: one at a time left the provider idle between
    # calls, and each page is three network round trips plus an upload. The
    # semaphore bounds how many are in flight so quota pressure stays predictable.
    # A single connection cannot run concurrent statements, so the page writes
    # queue on a lock — milliseconds next to the provider calls.
    in_flight = asyncio.Semaphore(PAGE_CONCURRENCY)
    write = asyncio.Lock()

    async def ingest_page(num: int, text: str, png: bytes) -> None:
        async with in_flight:
            meta, _warning = await anyio.to_thread.run_sync(profiler.profile_page, png, text)
            # ponytail: sequential embed calls — batch only when quota bills prove it matters
            text_vec = await anyio.to_thread.run_sync(
                gemini.embed_texts, [f"{meta['summary']}\n{text[:6000]}"], "RETRIEVAL_DOCUMENT"
            )
            img_vec = await anyio.to_thread.run_sync(gemini.embed_image, png)
            path = storage.page_path(str(doc["id"]), num)
            await anyio.to_thread.run_sync(
                storage.put_object, settings.SUPABASE_STORAGE_BUCKET_PAGES, path, png, "image/png"
            )
            async with write:
                # ponytail: vector literal strings — asyncpg lists arrive as float8[], which has no cast to vector
                await conn.execute(
                    """INSERT INTO manual_pages
                       (document_id, page_number, storage_path, page_type, subsystem,
                        error_codes_indexed, component_tags, summary, extracted_text,
                        text_embedding, image_embedding)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11::vector)
                       ON CONFLICT (document_id, page_number) DO UPDATE SET
                         storage_path = EXCLUDED.storage_path, page_type = EXCLUDED.page_type,
                         subsystem = EXCLUDED.subsystem, error_codes_indexed = EXCLUDED.error_codes_indexed,
                         component_tags = EXCLUDED.component_tags, summary = EXCLUDED.summary,
                         extracted_text = EXCLUDED.extracted_text,
                         text_embedding = EXCLUDED.text_embedding, image_embedding = EXCLUDED.image_embedding""",
                    doc["id"], num, path, meta["page_type"], meta["subsystem"],
                    meta["error_codes"], meta["component_tags"], meta["summary"], text,
                    _vec(text_vec[0]), _vec(img_vec),
                )

    # A failed page cancels its siblings; pages already committed survive for the
    # retry (the upserts above resume from the lease). Unwrap so the job's
    # last_error carries the provider's message rather than "TaskGroup".
    try:
        async with asyncio.TaskGroup() as tg:
            for num, text, png in pages:
                tg.create_task(ingest_page(num, text, png))
    except ExceptionGroup as eg:
        raise eg.exceptions[0]
    # Short finishing transaction only — page upserts above already committed one by one,
    # so a crash mid-manual resumes from the lease without losing finished pages.
    async with conn.transaction():
        await conn.execute(
            "UPDATE manual_documents SET status = 'ready' WHERE id = $1", doc["id"]
        )
        await conn.execute(
            "UPDATE ingestion_jobs SET status = 'completed', leased_until = NULL WHERE id = $1",
            job["id"],
        )


def _vec(v: list[float]) -> str:
    return "[" + ",".join(str(x) for x in v) + "]"


async def fail_job(conn, job, err: str) -> None:
    status = "failed" if job["attempt_count"] >= MAX_ATTEMPTS else "pending"
    await conn.execute(
        """UPDATE ingestion_jobs SET status = $1, leased_until = NULL,
                  last_error = $2 WHERE id = $3""",
        status, err[:1000], job["id"],
    )
    # A retry is not a failure the operator should see: leave the document
    # reading so the library only turns red once the attempts are exhausted
    # (and keeps polling until then).
    if status == "failed":
        await conn.execute(
            "UPDATE manual_documents SET status = 'failed' WHERE id = $1 AND status != 'ready'",
            job["document_id"],
        )


async def main() -> None:
    pool = await db.get_pool()
    while True:
        async with pool.acquire() as conn:
            job = await claim_job(conn)
        if job is None:
            await asyncio.sleep(IDLE_SLEEP_S)
            continue
        try:
            # ponytail: no outer transaction — minutes of Gemini/Storage I/O inside a txn
            # trips statement_timeout and rolls back finished pages. Pages commit one by one.
            async with pool.acquire() as conn:
                await process_job(conn, job)
        except Exception as e:  # noqa: BLE001 — job must never die silently
            async with pool.acquire() as econn:
                await fail_job(econn, job, str(e))


if __name__ == "__main__":
    asyncio.run(main())
