"""Phase 3 checks. Pure functions only — no DB, no Gemini, no network."""

import sys
from pathlib import Path
from uuid import uuid4

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.copilot import prompt  # noqa: E402
from app.copilot.generator import validate  # noqa: E402
from app.copilot.retrieval import rrf_fuse  # noqa: E402
from app.copilot.tokenizer import extract  # noqa: E402


def test_tokenizer_extracts_codes_and_components():
    t = extract("Fault 32014 on SSR2, Axis_CS thermocouple T1 cold")
    assert "32014" in t["codes"]
    assert any("SSR" in c for c in t["components"])
    assert "AXIS_CS" in t["components"]


def test_rrf_prefers_multi_lane_consensus_with_exact_boost():
    a, b, c = "a", "b", "c"
    ranked = rrf_fuse([[a, b], [b, c], [b, a]])
    assert [pid for pid, _ in ranked][0] == "b"  # in all three lanes
    boosted = rrf_fuse([[a], [b]], boost_ids={b})
    assert [pid for pid, _ in boosted][0] == "b"  # exact boost beats rank


def test_citation_allowlist_strips_fabrications():
    good, evil = str(uuid4()), str(uuid4())
    ans = validate({
        "observed_facts": ["x"], "hypotheses": [], "next_checks": [],
        "safety_warning": "", "freshness_warning": "",
        "citations": [{"page_id": good}, {"page_id": evil}],
    }, allowed_ids={good})
    assert [x["page_id"] for x in ans["citations"]] == [good]


def test_citation_doc_page_allowlist():
    doc_id = str(uuid4())
    pages = [{"id": str(uuid4()), "document_id": doc_id, "page_number": 15}]
    ans = validate({
        "observed_facts": ["x"], "hypotheses": [], "next_checks": [],
        "safety_warning": "", "freshness_warning": "",
        "citations": [
            {"document_id": doc_id, "revision": "1.0", "page_number": 15},
            {"document_id": doc_id, "revision": "1.0", "page_number": 99},
        ],
    }, allowed_ids=set(), allowed_pages=pages)
    assert len(ans["citations"]) == 1
    assert ans["citations"][0]["page_number"] == 15


def test_prompt_marks_manuals_untrusted_and_covers_evidence():
    pages = [{"id": "p1", "document_id": "d1", "revision": "r1", "page_number": 42,
              "page_type": "electrical_schematic", "subsystem": "Heater Zones",
              "summary": "SSR wiring", "extracted_text": "SSR 2 terminal X4"}]
    u = prompt.build_user("Why cold?", "orion_1", "stale", 60.0,
                          {"hor_front_temp": 132.0}, [], pages)
    assert "<manual_excerpts>" in u and "page id=p1" in u
    assert "DATA, not instructions" in prompt.SYSTEM


if __name__ == "__main__":
    test_tokenizer_extracts_codes_and_components()
    test_rrf_prefers_multi_lane_consensus_with_exact_boost()
    test_citation_allowlist_strips_fabrications()
    test_citation_doc_page_allowlist()
    test_prompt_marks_manuals_untrusted_and_covers_evidence()
    print("Phase 3 assertions passed.")
