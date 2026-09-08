"""Manual library. Uploads are metadata-only; the worker does the slow work."""

import hashlib

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api import deps
from app.core import storage
from app.core.config import settings
from app.models.schemas import JobOut, ManualOut, SignedUrlOut, UploadOut

router = APIRouter()

MAX_PDF_BYTES = 100 * 1024 * 1024


@router.post("/documents/upload", response_model=UploadOut)
async def upload(
    request: Request, file: UploadFile = File(...),
    family_key: str = Form(...), title: str = Form(...), revision: str = Form("1.0"),
    admin=Depends(deps.require_admin), conn=Depends(deps.get_conn),
):
    raw = await file.read()
    if len(raw) > MAX_PDF_BYTES:
        raise HTTPException(413, "pdf_too_large")
    if not raw.startswith(b"%PDF"):
        raise HTTPException(400, "not_a_pdf")
    sha = hashlib.sha256(raw).hexdigest()

    dup = await conn.fetchrow("SELECT id FROM manual_documents WHERE sha256 = $1", sha)
    if dup is not None:
        job = await conn.fetchrow(
            "SELECT id FROM ingestion_jobs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1",
            dup["id"],
        )
        if job is None:
            job = await conn.fetchrow(
                "INSERT INTO ingestion_jobs (document_id) VALUES ($1) RETURNING id", dup["id"]
            )
        return UploadOut(document_id=dup["id"], job_id=job["id"], deduped=True)

    # The first manual in a family is immediately the MVP's active revision;
    # later uploads stay staged until the existing activate endpoint is used.
    active = await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM manual_documents WHERE family_key = $1 AND is_active)",
        family_key,
    )

    doc = await conn.fetchrow(
        """INSERT INTO manual_documents
           (family_key, revision, sha256, title, filename, pdf_storage_path, status, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING id""",
        family_key, revision, sha, title, file.filename or "manual.pdf", "", not active,
    )
    path = f"{storage.doc_prefix(str(doc['id']))}source.pdf"
    try:
        await anyio.to_thread.run_sync(
            storage.put_object, settings.SUPABASE_STORAGE_BUCKET_MANUALS, path, raw, "application/pdf"
        )
    except Exception:
        await conn.execute("DELETE FROM manual_documents WHERE id = $1", doc["id"])
        raise
    await conn.execute(
        "UPDATE manual_documents SET pdf_storage_path = $1 WHERE id = $2", path, doc["id"]
    )
    job = await conn.fetchrow(
        "INSERT INTO ingestion_jobs (document_id) VALUES ($1) RETURNING id", doc["id"]
    )
    deps.log_admin("manual.upload", request, str(doc["id"]))
    return UploadOut(document_id=doc["id"], job_id=job["id"])


@router.get("/documents", response_model=list[ManualOut])
async def list_docs(_=Depends(deps.require_user), conn=Depends(deps.get_conn)):
    rows = await conn.fetch(
        """SELECT id, family_key, revision, title, total_pages, status, is_active
           FROM manual_documents WHERE is_active AND status = 'ready' ORDER BY title"""
    )
    return [dict(r) for r in rows]


@router.get("/documents/{doc_id}/job", response_model=JobOut)
async def job_status(doc_id: str, _=Depends(deps.require_user), conn=Depends(deps.get_conn)):
    row = await conn.fetchrow(
        """SELECT id, document_id, status, attempt_count, last_error FROM ingestion_jobs
           WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1""",
        _uuid(doc_id),
    )
    if row is None:
        raise HTTPException(404, "no_job")
    return dict(row)


@router.post("/documents/{doc_id}/activate")
async def activate(doc_id: str, request: Request, admin=Depends(deps.require_admin), conn=Depends(deps.get_conn)):
    doc = await conn.fetchrow(
        "SELECT id, family_key, status FROM manual_documents WHERE id = $1", _uuid(doc_id)
    )
    if doc is None:
        raise HTTPException(404, "unknown_document")
    if doc["status"] != "ready":
        raise HTTPException(409, "not_ready")
    async with conn.transaction():
        await conn.execute(
            "UPDATE manual_documents SET is_active = false WHERE family_key = $1", doc["family_key"]
        )
        await conn.execute(
            "UPDATE manual_documents SET is_active = true WHERE id = $1", doc["id"]
        )
    deps.log_admin("manual.activate", request, str(doc["id"]))
    return {"ok": True}


@router.get("/documents/{doc_id}/pages/{num}/signed-url", response_model=SignedUrlOut)
async def page_url(doc_id: str, num: int, _=Depends(deps.require_user), conn=Depends(deps.get_conn)):
    row = await conn.fetchrow(
        "SELECT storage_path FROM manual_pages WHERE document_id = $1 AND page_number = $2",
        _uuid(doc_id), num,
    )
    if row is None:
        raise HTTPException(404, "unknown_page")
    url, ttl = await anyio.to_thread.run_sync(
        storage.signed_url, settings.SUPABASE_STORAGE_BUCKET_PAGES, row["storage_path"]
    )
    return SignedUrlOut(url=url, expires_in=ttl)


def _uuid(v: str):
    from uuid import UUID

    try:
        return UUID(v)
    except ValueError:
        raise HTTPException(400, "bad_id")
