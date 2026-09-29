import re
from typing import List, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class Turn(BaseModel):
    question: str = Field(max_length=500)
    answer: str = Field(max_length=1200)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None
    # Earlier turns of this thread, oldest first. The client owns the thread, so
    # follow-ups work without a stored conversation (and in demo mode).
    history: list[Turn] = Field(default_factory=list, max_length=6)
    # Spoken questions carry the recogniser's language so the answer matches it
    # even when the text alone is ambiguous (short or code-mixed utterances).
    # Canonicalised below: it is interpolated into the prompt as an attribute.
    language: str = Field(default="", max_length=16)

    @field_validator("language")
    @classmethod
    def canonical_language(cls, v: str) -> str:
        low = str(v or "").strip().lower()
        return low if re.fullmatch(r"[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?", low) else ""


class Citation(BaseModel):
    document_id: UUID
    revision: str
    page_number: int


class Hypothesis(BaseModel):
    cause: str
    supports: str = ""
    conflicts: str = ""


class Visual(BaseModel):
    """Which chart to draw under the answer. The values are fetched client-side."""

    kind: Literal["temp_trend", "zone_status", "shift_summary", "drive_speed"]
    window: Literal["1h", "8h", "24h", "7d"] | None = None


class DiagnosticOut(BaseModel):
    verdict: str = ""
    observed_facts: List[str] = Field(default_factory=list)
    hypotheses: List[Hypothesis] = Field(default_factory=list)
    next_checks: List[str] = Field(default_factory=list)
    safety_warning: str = ""
    freshness_warning: str = ""
    speech_summary: str = ""
    language_code: str = "en-IN"
    citations: List[Citation] = Field(default_factory=list)
    visual: Visual | None = None
