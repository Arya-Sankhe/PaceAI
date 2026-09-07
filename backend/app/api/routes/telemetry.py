"""Cockpit reads. Freshness is computed here, never trusted from the edge."""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.api import deps
from app.core import db
from app.models.schemas import EventOut, Freshness, HistoryOut, MachineOut, StateOut

router = APIRouter()

EXPECTED_INTERVAL_S = 5
EDGE_TIMEOUT_S = 30
MAX_HISTORY_POINTS = 1000
MAX_HISTORY_DAYS = 370


def freshness(now: datetime, source_ts: datetime | None, quality: str) -> tuple[Freshness, float | None]:
    """Pure: single place freshness is decided. Tested in tests/test_phase2.py."""
    if source_ts is None:
        return "unknown", None
    if quality == "bad":
        return "bad_quality", (now - source_ts).total_seconds()
    age = (now - source_ts).total_seconds()
    if age <= 3 * EXPECTED_INTERVAL_S:
        return "live", age
    return "stale", age


@router.get("/machines", response_model=list[MachineOut])
async def list_machines(_=Depends(deps.require_user), conn=Depends(deps.get_conn)):
    rows = await conn.fetch(
        "SELECT id, machine_key, name, is_active FROM machines WHERE is_active ORDER BY machine_key"
    )
    return [dict(r) for r in rows]


async def _machine_id(conn, key: str):
    row = await conn.fetchrow("SELECT id FROM machines WHERE machine_key = $1", key)
    if row is None:
        raise HTTPException(404, "unknown_machine")
    return row["id"]


@router.get("/machines/{key}/latest", response_model=StateOut)
async def latest(key: str, _=Depends(deps.require_user), conn=Depends(deps.get_conn)):
    mid = await _machine_id(conn, key)
    row = await conn.fetchrow("SELECT * FROM telemetry_latest WHERE machine_id = $1", mid)
    edge = await conn.fetchval(
        "SELECT max(last_seen_at) FROM edge_devices WHERE is_active"
    )
    now = datetime.now(timezone.utc)
    connected = edge is not None and (now - edge).total_seconds() <= EDGE_TIMEOUT_S
    if row is None:
        return StateOut(machine_key=key, freshness="unknown", collector_connected=connected)
    fresh, age = freshness(now, row["source_ts"], row["quality"])
    if not connected:
        fresh = "disconnected"
    return StateOut(
        machine_key=key, freshness=fresh, source_ts=row["source_ts"], age_seconds=age,
        values=json.loads(row["metrics"]), quality={"overall": row["quality"]},
        collector_connected=connected,
    )


@router.get("/machines/{key}/history", response_model=HistoryOut)
async def history(
    key: str,
    since: datetime, until: datetime,
    _=Depends(deps.require_user), conn=Depends(deps.get_conn),
):
    days = (until - since).total_seconds() / 86400
    if days <= 0 or days > MAX_HISTORY_DAYS:
        raise HTTPException(400, "bad_range")
    mid = await _machine_id(conn, key)
    # ponytail: raw for a day, rollups beyond — one branch, no resolution param to argue about
    if days <= 1:
        rows = await conn.fetch(
            """SELECT source_ts, metrics FROM telemetry_samples
               WHERE machine_id = $1 AND source_ts >= $2 AND source_ts <= $3
               ORDER BY source_ts LIMIT $4""",
            mid, since, until, MAX_HISTORY_POINTS,
        )
        points = [{"t": r["source_ts"], "values": json.loads(r["metrics"])} for r in rows]
        return HistoryOut(machine_key=key, resolution="raw", points=points)
    rows = await conn.fetch(
        """SELECT bucket, metric_key, avg_val FROM telemetry_rollups_1m
           WHERE machine_id = $1 AND bucket >= $2 AND bucket <= $3
           ORDER BY bucket LIMIT $4""",
        mid, since, until, MAX_HISTORY_POINTS,
    )
    merged: dict = {}
    for r in rows:
        merged.setdefault(r["bucket"], {})[r["metric_key"]] = (
            float(r["avg_val"]) if r["avg_val"] is not None else None
        )
    return HistoryOut(
        machine_key=key, resolution="rollup_1m",
        points=[{"t": t, "values": v} for t, v in sorted(merged.items())],
    )


@router.get("/machines/{key}/events", response_model=list[EventOut])
async def events(
    key: str, limit: int = Query(50, le=100), _=Depends(deps.require_user),
    conn=Depends(deps.get_conn),
):
    mid = await _machine_id(conn, key)
    rows = await conn.fetch(
        """SELECT id, ts, event_type, severity, data FROM telemetry_events
           WHERE machine_id = $1 ORDER BY ts DESC LIMIT $2""",
        mid, limit,
    )
    return [{**dict(r), "data": json.loads(r["data"])} for r in rows]


@router.get("/machines/{key}/stream")
async def stream(key: str, request: Request, _=Depends(deps.require_user)):
    """SSE display channel. Best-effort — reconnect refetches /latest first."""
    pool = await db.get_pool()
    async with pool.acquire() as c:
        mid = await _machine_id(c, key)

    async def gen():
        last_ts = None
        while True:
            if await request.is_disconnected():
                break
            # ponytail: acquire per tick — holding a pool slot across sleep starves the API at 10 tabs
            async with pool.acquire() as tick:
                row = await tick.fetchrow(
                    "SELECT source_ts, quality, metrics FROM telemetry_latest WHERE machine_id = $1", mid
                )
            if row is not None and row["source_ts"] != last_ts:
                last_ts = row["source_ts"]
                fresh, _ = freshness(datetime.now(timezone.utc), row["source_ts"], row["quality"])
                yield f"event: patch\ndata: {json.dumps({
                    'machine_key': key, 'freshness': fresh,
                    'source_ts': row['source_ts'].isoformat(),
                    'values': json.loads(row['metrics']),
                })}\n\n"
            else:
                yield ": heartbeat\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")
