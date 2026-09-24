"""The languages Bulbul can speak and how anything maps onto them.

Keep in sync with the CHROME keys in web/lib/voice.ts and the code list in
app/copilot/prompt.py — all three must agree.
"""

# Canonical Bulbul codes keyed by ISO 639-1 base. "or" is the recogniser's
# spelling of Odia ("od" is the synthesiser's), accepted as an alias.
SPEAKABLE = {
    "en": "en-IN", "hi": "hi-IN", "bn": "bn-IN", "ta": "ta-IN", "te": "te-IN",
    "kn": "kn-IN", "ml": "ml-IN", "mr": "mr-IN", "gu": "gu-IN", "pa": "pa-IN",
    "od": "od-IN", "or": "od-IN",
}


def tts_language(code: str | None) -> str:
    """Canonical Bulbul code for `code`, or "" when Bulbul cannot speak it."""
    base = str(code or "").strip().lower().replace("_", "-").split("-")[0]
    return SPEAKABLE.get(base, "")
