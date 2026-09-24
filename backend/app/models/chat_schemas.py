import re
from typing import List, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None
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


class DiagnosticOut(BaseModel):
    observed_facts: List[str] = Field(default_factory=list)
    hypotheses: List[Hypothesis] = Field(default_factory=list)
    next_checks: List[str] = Field(default_factory=list)
    safety_warning: str = ""
    freshness_warning: str = ""
    speech_summary: str = ""
    language_code: str = "en-IN"
    citations: List[Citation] = Field(default_factory=list)
