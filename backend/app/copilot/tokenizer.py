"""Deterministic query understanding. Regex first, model never changes scope."""

import re

CODE_RE = re.compile(r"\b\d{4,6}\b")
COMP_RE = re.compile(
    r"\b(?:SSR|SSR\d*|X\d{1,3}|T\d{1,2}|Axis_[A-Z]{2}|[A-Z]{2,6}\s?\d{1,3})\b",
    re.IGNORECASE,
)


def extract(question: str) -> dict:
    """Returns {codes, components, text}. Pure — tested in test_phase3.py."""
    codes = sorted(set(CODE_RE.findall(question or "")))
    comps = sorted({c.upper().replace(" ", "") for c in COMP_RE.findall(question or "")})
    return {"codes": codes[:10], "components": comps[:20], "text": (question or "")[:1000]}
