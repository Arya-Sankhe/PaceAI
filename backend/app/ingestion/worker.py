"""One-manual-at-a-time ingestion + rollups + retention. Run: python -m app.ingestion.worker."""

import asyncio
import time

import anyio

from app.core import db, gemini, storage
from app.core.config import settings
from app.ingestion import pdf, profiler

LEASE_S = 600
MAX_ATTEMPTS = 5
IDLE_SLEEP_S = 5
MAINTENANCE_EVERY_S = 300
RAW_RETENTION_DAYS = 30


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
    pages = await anyio.to_thread.run_sync(pdf.extract_pages, raw)
    await conn.execute(
        "UPDATE manual_documents SET total_pages = $1, status = 'processing' WHERE id = $2",
        len(pages), doc["id"],
    )
    for num, text, png in pages:
        meta, _warning = await anyio.to_thread.run_sync(profiler.profile_page, png, text)
        # ponytail: sequential embed calls — batch only when quota bills prove it matters
        text_vec = await anyio.to_thread.run_sync(
            gemini.embed_texts, [f"{meta['summary']}\n{text[:6000]}"]
        )
        img_vec = await anyio.to_thread.run_sync(gemini.embed_image, png)
        path = storage.page_path(str(doc["id"]), num)
        await anyio.to_thread.run_sync(
            storage.put_object, settings.SUPABASE_STORAGE_BUCKET_PAGES, path, png, "image/png"
        )
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
    await conn.execute(
        "UPDATE manual_documents SET status = 'failed' WHERE id = $1 AND status != 'ready'",
        job["document_id"],
    )


async def rollup_and_expire(conn) -> None:
    """Per-metric 1-minute rollups, then bulk-expire raw samples. Idempotent reruns."""
    await conn.execute(
        """INSERT INTO telemetry_rollups_1m
             (machine_id, bucket, metric_key, min_val, max_val, avg_val, sample_count)
           SELECT machine_id, date_trunc('minute', source_ts), kv.key,
                  MIN(kv.value::numeric), MAX(kv.value::numeric),
                  AVG(kv.value::numeric), COUNT(*)
           FROM telemetry_samples, LATERAL jsonb_each_text(metrics) kv
           WHERE source_ts < date_trunc('minute', now())
             AND kv.value ~ '^-?[0-9]+(\\.[0-9]+)?$'
             AND NOT EXISTS (
                 SELECT 1 FROM telemetry_rollups_1m r
                 WHERE r.machine_id = telemetry_samples.machine_id
                   AND r.bucket = date_trunc('minute', telemetry_samples.source_ts)
                   AND r.metric_key = kv.key)
           GROUP BY 1, 2, 3"""
    )
    await conn.execute(
        "DELETE FROM telemetry_samples WHERE source_ts < now() - make_interval(days => $1)",
        RAW_RETENTION_DAYS,
    )


async def main() -> None:
    pool = await db.get_pool()
    last_maintenance = 0.0
    while True:
        async with pool.acquire() as conn:
            job = await claim_job(conn)
        if job is None:
            if time.time() - last_maintenance > MAINTENANCE_EVERY_S:
                async with pool.acquire() as mconn:
                    async with mconn.transaction():
                        await rollup_and_expire(mconn)
                last_maintenance = time.time()
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
