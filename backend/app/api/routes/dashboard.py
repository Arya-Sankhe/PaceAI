"""Describe-to-dashboard endpoints. Planning only — data comes from telemetry."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api import deps
from app.copilot import dashboard, generator
from app.machine_source import manifest_tags, source

router = APIRouter()


class PlanIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)
    current: list[dict] = Field(default_factory=list, max_length=dashboard.MAX_WIDGETS)
    focus: str | None = Field(default=None, max_length=64)


async def _signals(key: str) -> list[dict]:
    try:
        snap = await source.snapshot(key)
    except KeyError:
        raise HTTPException(404, "unknown_machine")
    # Live PLC: offer only tags it actually reports (unmapped ::TBD: tags are absent).
    live = snap.get("values") if source.mode == "plc" else None
    tags = [t for t in manifest_tags() if not live or t["key"] in live]
    return dashboard.catalog(tags, snap.get("titles") or {})


@router.get("/machines/{key}/dashboard/catalog")
async def catalog(key: str, _=Depends(deps.require_user)):
    """Every signal a widget may draw, in operator language."""
    return await _signals(key)


@router.post("/machines/{key}/dashboard/plan")
async def plan(key: str, body: PlanIn, _=Depends(deps.require_user)):
    """The request in, validated add/update/remove operations out."""
    signals = await _signals(key)
    ids = {str(w.get("id")) for w in body.current if w.get("id")}
    focus = body.focus if body.focus in ids else None
    try:
        user = dashboard.build_user(body.prompt, signals, body.current or None, focus)
        raw, _meta = await generator.generate(user, [], dashboard.SYSTEM)
    except Exception:  # noqa: BLE001 — provider fault or bad JSON
        raise HTTPException(503, "planner_unavailable")
    result = dashboard.validate_plan(raw, signals, ids)
    if not (result["add"] or result["update"] or result["remove"] or result["message"]):
        raise HTTPException(422, "no_widgets")
    return result
