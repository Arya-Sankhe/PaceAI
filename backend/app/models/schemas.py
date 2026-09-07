from datetime import datetime, timezone
from typing import Dict, List, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Quality = Literal["good", "uncertain", "bad"]
Freshness = Literal["live", "stale", "disconnected", "bad_quality", "unknown"]


def _as_utc(v: datetime) -> datetime:
    # ponytail: one guard at the trust boundary — naive edge clocks become UTC instead of 500ing
    return v.replace(tzinfo=timezone.utc) if isinstance(v, datetime) and v.tzinfo is None else v


class SampleIn(BaseModel):
    sequence: int = Field(ge=0)
    source_ts: datetime
    edge_ts: datetime
    values: Dict[str, float] = Field(max_length=200)
    quality: Dict[str, Quality] = Field(default_factory=dict, max_length=200)

    @field_validator("source_ts", "edge_ts")
    @classmethod
    def _utc_ts(cls, v: datetime) -> datetime:
        return _as_utc(v)


class EventIn(BaseModel):
    ts: datetime
    kind: str = Field(max_length=64)  # maps to telemetry_events.event_type
    severity: Literal["info", "warn", "error", "critical"] = "info"
    data: Dict = Field(default_factory=dict, max_length=50)

    @field_validator("ts")
    @classmethod
    def _utc_ts(cls, v: datetime) -> datetime:
        return _as_utc(v)


class BatchIn(BaseModel):
    edge_id: UUID
    boot_id: UUID
    machine_key: str = Field(max_length=64)
    schema_version: str = "orion-v1"
    samples: List[SampleIn] = Field(max_length=500)
    events: List[EventIn] = Field(default_factory=list, max_length=100)


class BatchOut(BaseModel):
    accepted: int
    duplicate: bool


class MachineOut(BaseModel):
    id: UUID
    machine_key: str
    name: str
    is_active: bool


class StateOut(BaseModel):
    machine_key: str
    freshness: Freshness
    source_ts: datetime | None = None
    age_seconds: float | None = None
    values: Dict[str, float] = {}
    quality: Dict[str, str] = {}
    collector_connected: bool = True


class HistoryPoint(BaseModel):
    t: datetime
    values: Dict[str, float | None]


class HistoryOut(BaseModel):
    machine_key: str
    resolution: Literal["raw", "rollup_1m"]
    points: List[HistoryPoint]


class EventOut(BaseModel):
    id: int
    ts: datetime
    event_type: str
    severity: str
    data: Dict


class ManualOut(BaseModel):
    id: UUID
    family_key: str
    revision: str
    title: str
    total_pages: int
    status: str
    is_active: bool


class UploadOut(BaseModel):
    document_id: UUID
    job_id: UUID
    deduped: bool = False


class JobOut(BaseModel):
    id: UUID
    document_id: UUID
    status: str
    attempt_count: int
    last_error: str | None = None


class SignedUrlOut(BaseModel):
    url: str
    expires_in: int
