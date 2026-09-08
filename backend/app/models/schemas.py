from datetime import datetime
from typing import Dict, List, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Freshness = Literal["live", "stale", "disconnected", "bad_quality", "unknown"]


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
    values: Dict[str, float] = Field(default_factory=dict)
    quality: Dict[str, str] = Field(default_factory=dict)
    collector_connected: bool = True
    source: Literal["dummy", "plc"] = "dummy"


class HistoryPoint(BaseModel):
    t: datetime
    values: Dict[str, float | None]


class HistoryOut(BaseModel):
    machine_key: str
    resolution: Literal["dummy", "raw", "rollup_1m"]
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
