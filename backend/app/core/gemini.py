"""Thin Gemini wrappers. Sync SDK calls — callers use anyio.to_thread."""

from __future__ import annotations

from app.core.config import settings


def _client():
    from google import genai

    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY must be set.")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def embed_texts(texts: list[str]) -> list[list[float]]:
    client = _client()
    out: list[list[float]] = []
    for text in texts:
        # ponytail: one call per chunk, batch only when quota errors prove it matters
        res = client.models.embed_content(
            model=settings.EMBEDDING_MODEL, contents=[text or " "]
        )
        out.append(list(res.embeddings[0].values))
    return out


def embed_image(png_bytes: bytes) -> list[float]:
    from google.genai import types

    client = _client()
    res = client.models.embed_content(
        model=settings.EMBEDDING_MODEL,
        contents=[types.Part.from_bytes(data=png_bytes, mime_type="image/png")],
    )
    return list(res.embeddings[0].values)


def generate_json(prompt: str, image_png: bytes | list[bytes] | None = None) -> str:
    """Returns raw JSON text; parsing/validation lives with the caller."""
    from google.genai import types

    client = _client()
    parts: list = [prompt]
    if image_png is not None:
        for png in (image_png if isinstance(image_png, list) else [image_png]):
            parts.append(types.Part.from_bytes(data=png, mime_type="image/png"))
    res = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=parts,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", temperature=0.1
        ),
    )
    return res.text or "{}"


def generate_json_multi(prompt: str, images: list[bytes]) -> str:
    return generate_json(prompt, images or None)
