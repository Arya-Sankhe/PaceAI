"""Deterministic PDF work. No network, no LLM — pure parse/render."""

import io

RENDER_DPI = 300
MAX_LONG_EDGE_PX = 3500
MAX_PAGES = 500


class PdfError(ValueError):
    pass


def extract_pages(pdf_bytes: bytes) -> list[tuple[int, str, bytes]]:
    """Returns [(page_number, native_text, png_bytes)]. Raises PdfError on junk."""
    from PIL import Image
    import pypdf
    import pypdfium2 as pdfium

    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            raise PdfError("encrypted_pdf")
        texts = [(i + 1, (p.extract_text() or "").strip()) for i, p in enumerate(reader.pages)]
    except PdfError:
        raise
    except Exception as e:
        raise PdfError(f"unparseable_pdf: {e}")

    if not texts:
        raise PdfError("empty_pdf")
    if len(texts) > MAX_PAGES:
        raise PdfError("too_many_pages")

    try:
        doc = pdfium.PdfDocument(io.BytesIO(pdf_bytes))
    except Exception as e:
        raise PdfError(f"unrenderable_pdf: {e}")

    out = []
    scale = RENDER_DPI / 72
    for num, text in texts:
        img = doc[num - 1].render(scale=scale).to_pil().convert("RGB")
        # ponytail: bound the long edge — 300 DPI schematics stay sharp, storage stays sane
        if max(img.size) > MAX_LONG_EDGE_PX:
            img.thumbnail((MAX_LONG_EDGE_PX, MAX_LONG_EDGE_PX), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        out.append((num, text, buf.getvalue()))
    return out
