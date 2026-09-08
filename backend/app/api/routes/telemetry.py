"""Dummy-first cockpit API. All machine data enters through ``machine_source``."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api import deps
from app.machine_source import source
from app.models.schemas import EventOut, Freshness, HistoryOut, MachineOut, StateOut

router = APIRouter()
EXPECTED_INTERVAL_S = 5
MAX_HISTORY_DAYS = 30


def freshness(now: datetime, source_ts: datetime | None, quality: str) -> tuple[Freshness, float | None]:
    if source_ts is None:
        return "unknown", None
    age = (now - source_ts).total_seconds()
    if quality != "good":
        return "bad_quality", age
    return ("live" if age <= 3 * EXPECTED_INTERVAL_S else "stale"), age


async def _snapshot(key: str) -> dict:
    try:
        return await source.snapshot(key)
    except KeyError:
        raise HTTPException(404, "unknown_machine")


@router.get("/machines", response_model=list[MachineOut])
async def list_machines(_=Depends(deps.require_user)):
    return [
        {"id": "00000000-0000-0000-0000-000000000001", "machine_key": "orion_1", "name": "Orion VFFS #1", "is_active": True},
        {"id": "00000000-0000-0000-0000-000000000002", "machine_key": "orion_2", "name": "Orion VFFS #2", "is_active": True},
    ]


@router.get("/machines/{key}/latest", response_model=StateOut)
async def latest(key: str, _=Depends(deps.require_user)):
    return StateOut(**await _snapshot(key), source="dummy")


@router.get("/machines/{key}/history", response_model=HistoryOut)
async def history(key: str, since: datetime, until: datetime, _=Depends(deps.require_user)):
    days = (until - since).total_seconds() / 86400
    if days <= 0 or days > MAX_HISTORY_DAYS:
        raise HTTPException(400, "bad_range")
    await _snapshot(key)
    return HistoryOut(machine_key=key, resolution="dummy", points=await source.history(key, since, until))


@router.get("/machines/{key}/events", response_model=list[EventOut])
async def events(key: str, limit: int = Query(50, ge=1, le=100), _=Depends(deps.require_user)):
    await _snapshot(key)
    return (await source.events(key))[:limit]
