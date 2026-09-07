"""Outbound-only edge ingest. Duplicates are 200 no-ops, never errors."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.api import deps
from app.models.schemas import BatchIn, BatchOut

router = APIRouter()

# ponytail: trust boundary — drop absurd batches before touching the DB
MAX_SKEW_FUTURE_S = 300


@router.post("/collector/ingest", response_model=BatchOut)
async def ingest(batch: BatchIn, edge=Depends(deps.require_edge), conn=Depends(deps.get_conn)):
    if batch.schema_version != "orion-v1":
        raise HTTPException(400, "unknown_schema")
    if edge["id"] != batch.edge_id:
        raise HTTPException(403, "edge_mismatch")
    now = datetime.now(timezone.utc)
    for s in batch.samples:
        if (s.source_ts - now).total_seconds() > MAX_SKEW_FUTURE_S:
            raise HTTPException(400, "clock_skew")

    machine = await conn.fetchrow(
        "SELECT id FROM machines WHERE machine_key = $1 AND is_active", batch.machine_key
    )
    if machine is None:
        raise HTTPException(404, "unknown_machine")
    mid = machine["id"]

    accepted = 0
    async with conn.transaction():
        for s in batch.samples:
            ins = await conn.execute(
                """INSERT INTO collector_records
                   (edge_id, machine_id, boot_id, sequence, source_ts, edge_ts)
                   VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING""",
                batch.edge_id, mid, batch.boot_id, s.sequence, s.source_ts, s.edge_ts,
            )
            if ins == "INSERT 0 0":
                continue  # replayed record — idempotent no-op
            accepted += 1
            metrics_json = json.dumps(s.values)
            await conn.execute(
                """INSERT INTO telemetry_samples
                   (machine_id, source_ts, edge_ts, quality, metrics)
                   VALUES ($1,$2,$3,$4,$5::jsonb)""",
                mid, s.source_ts, s.edge_ts,
                _worst(s.quality.values()), metrics_json,
            )
            # Latest moves forward only — replayed history never rewinds the cockpit
            await conn.execute(
                """INSERT INTO telemetry_latest AS l
                   (machine_id, source_ts, edge_ts, quality, metrics)
                   VALUES ($1,$2,$3,$4,$5::jsonb)
                   ON CONFLICT (machine_id) DO UPDATE
                   SET source_ts = EXCLUDED.source_ts, edge_ts = EXCLUDED.edge_ts,
                       quality = EXCLUDED.quality, metrics = EXCLUDED.metrics,
                       received_at = now()
                   WHERE EXCLUDED.source_ts > l.source_ts""",
                mid, s.source_ts, s.edge_ts, _worst(s.quality.values()), metrics_json,
            )
        for e in batch.events:
            await conn.execute(
                """INSERT INTO telemetry_events (machine_id, ts, event_type, severity, data)
                   VALUES ($1,$2,$3,$4,$5::jsonb)""",
                mid, e.ts, e.kind, e.severity, json.dumps(e.data),
            )
    return BatchOut(accepted=accepted, duplicate=accepted == 0 and len(batch.samples) > 0)


def _worst(qualities) -> str:
    q = set(qualities or ["good"])
    if "bad" in q:
        return "bad"
    if "uncertain" in q:
        return "uncertain"
    return "good"
