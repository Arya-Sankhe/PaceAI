"""Diagnostic copilot endpoint. Fixed workflow — no tools, no agent loop."""

import json
import time
from datetime import datetime, timezone
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api import deps
from app.api.routes.telemetry import freshness
from app.copilot import generator, prompt, retrieval
from app.models.chat_schemas import ChatIn

router = APIRouter()

HISTORY_EVENTS = 20


@router.post("/machines/{key}/chat")
async def chat(key: str, body: ChatIn, request_user=Depends(deps.require_user)):
    from app.core import db

    pool = await db.get_pool()
    async with pool.acquire() as conn:
        machine = await conn.fetchrow(
            "SELECT id FROM machines WHERE machine_key = $1 AND is_active", key
        )
        if machine is None:
            raise HTTPException(404, "unknown_machine")
        mid = machine["id"]
        state = await conn.fetchrow(
            "SELECT source_ts, quality, metrics FROM telemetry_latest WHERE machine_id = $1", mid
        )
        ev_rows = await conn.fetch(
            """SELECT id, ts, event_type, severity, data FROM telemetry_events
               WHERE machine_id = $1 ORDER BY ts DESC LIMIT $2""",
            mid, HISTORY_EVENTS,
        )
        if body.conversation_id is not None:
            conv = await conn.fetchrow(
                "SELECT id, user_id FROM conversations WHERE id = $1", body.conversation_id
            )
            if conv is None or (conv["user_id"] != request_user and not await _is_admin(conn, request_user)):
                raise HTTPException(404, "unknown_conversation")
            conv_id = conv["id"]
        else:
            conv = await conn.fetchrow(
                "INSERT INTO conversations (user_id, machine_id) VALUES ($1,$2) RETURNING id",
                request_user, mid,
            )
            conv_id = conv["id"]
        await conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES ($1,'user',$2)",
            conv_id, body.message,
        )

    async def gen():
        yield _sse("status", "reading telemetry")
        now = datetime.now(timezone.utc)
        if state is None:
            fresh, age = "unknown", None
            values: dict = {}
        else:
            fresh, age = freshness(now, state["source_ts"], state["quality"])
            values = json.loads(state["metrics"])
        events = [{**dict(r), "ts": r["ts"].isoformat(), "data": json.loads(r["data"])} for r in ev_rows]

        yield _sse("status", "retrieving manuals")
        # ponytail: fresh pool connection per stage — chat holds none across Gemini seconds
        async with pool.acquire() as conn:
            pages, images = await retrieval.retrieve(conn, body.message)
        for p in pages:
            yield _sse("citation", {"document_id": str(p["document_id"]),
                                    "revision": p["revision"], "page_number": p["page_number"]})
        user_prompt = prompt.build_user(body.message, key, fresh, age, values, events, pages)

        yield _sse("status", "generating")
        t0 = time.time()
        try:
            acc: list[str] = []
            async for delta in generator.stream_generate(user_prompt, [png for _, png in images]):
                acc.append(delta)
                yield _sse("delta", delta)
            answer = generator.validate(
                json.loads("".join(acc)),
                {str(p["id"]) for p in pages},
                pages,
            )
        except Exception:  # noqa: BLE001 — invalid JSON, empty evidence, or provider fault
            yield _sse("error", "diagnostic_unavailable")
            return
        evidence = {
            "machine_key": key, "source_ts": state["source_ts"].isoformat() if state else None,
            "freshness": fresh, "event_ids": [r["id"] for r in ev_rows],
            "page_ids": [str(p["id"]) for p in pages],
            "scores": [p.get("score") for p in pages],
            "model": "gemini-3.8-flash", "latency_ms": int((time.time() - t0) * 1000),
        }
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO messages (conversation_id, role, content, evidence)
                   VALUES ($1,'assistant',$2,$3::jsonb)""",
                conv_id, json.dumps(answer), json.dumps(evidence),
            )
        yield _sse("completed", {"conversation_id": str(conv_id), "answer": answer})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/conversations")
async def list_conversations(
    machine_key: str | None = None, limit: int = Query(20, le=50),
    user=Depends(deps.require_user), conn=Depends(deps.get_conn),
):
    if machine_key is None:
        rows = await conn.fetch(
            "SELECT id, machine_id, title, created_at FROM conversations"
            " WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
            user, limit,
        )
    else:
        rows = await conn.fetch(
            """SELECT c.id, c.machine_id, c.title, c.created_at FROM conversations c
               JOIN machines m ON m.id = c.machine_id
               WHERE c.user_id = $1 AND m.machine_key = $2
               ORDER BY c.created_at DESC LIMIT $3""",
            user, machine_key, limit,
        )
    return [{**dict(r), "id": str(r["id"]),
             "machine_id": str(r["machine_id"]) if r["machine_id"] is not None else None,
             "created_at": r["created_at"].isoformat()} for r in rows]


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: UUID, user=Depends(deps.require_user), conn=Depends(deps.get_conn)):
    conv = await conn.fetchrow("SELECT * FROM conversations WHERE id = $1", conv_id)
    if conv is None or (conv["user_id"] != user and not await _is_admin(conn, user)):
        raise HTTPException(404, "unknown_conversation")
    msgs = await conn.fetch(
        "SELECT role, content, evidence, created_at FROM messages"
        " WHERE conversation_id = $1 ORDER BY created_at",
        conv_id,
    )
    return {
        "id": str(conv["id"]), "title": conv["title"],
        "messages": [
            {
                **dict(m),
                "created_at": m["created_at"].isoformat(),
                "evidence": json.loads(m["evidence"]) if m["evidence"] else {},
            }
            for m in msgs
        ],
    }


async def _is_admin(conn, user_id) -> bool:
    row = await conn.fetchrow("SELECT role FROM app_users WHERE id = $1", user_id)
    return row is not None and row["role"] == "admin"


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
