from typing import List, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None


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
    citations: List[Citation] = Field(default_factory=list)
