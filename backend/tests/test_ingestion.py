"""Ingestion checks. Pure functions only — no DB, no network."""

import io
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ingestion import pdf  # noqa: E402


def _blank_pdf(pages: int) -> bytes:
    import pypdf

    writer = pypdf.PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_extract_pages_skips_render_but_counts_every_page():
    total, pages = pdf.extract_pages(_blank_pdf(3), skip={2})
    assert total == 3
    assert [n for n, _, _ in pages] == [1, 3]
    assert all(png for _, _, png in pages)


if __name__ == "__main__":
    test_extract_pages_skips_render_but_counts_every_page()
    print("Ingestion assertions passed.")
