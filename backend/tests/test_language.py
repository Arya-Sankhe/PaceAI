"""Language mapping and speech policy. Pure — no DB, no Gemini, no network."""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.language import tts_language  # noqa: E402
from app.copilot.generator import validate  # noqa: E402


def test_tts_language_normalizes_codes_and_aliases():
    assert tts_language("or-IN") == "od-IN"  # the recogniser's spelling of Odia
    assert tts_language("Hi-IN") == "hi-IN"
    assert tts_language("hi") == "hi-IN"
    assert tts_language("ta_IN") == "ta-IN"


def test_tts_language_rejects_unspeakable():
    assert tts_language("ur-IN") == ""  # a recogniser language Bulbul cannot voice
    assert tts_language("fr-FR") == ""
    assert tts_language("") == ""
    assert tts_language(None) == ""


def _answer(question_language: str = "", **overrides):
    base = {
        "observed_facts": [],
        "hypotheses": [{"cause": "SSR 2 stuck on", "supports": "", "conflicts": ""}],
        "next_checks": ["Check SSR 2 gate voltage"],
        "safety_warning": "",
        "freshness_warning": "",
        "speech_summary": "Spoken gist.",
        "language_code": "hi-IN",
        "citations": [],
    }
    base.update(overrides)
    return validate(base, allowed_ids=set(), question_language=question_language)


def test_validate_keeps_speakable_language():
    ans = _answer()
    assert ans["language_code"] == "hi-IN"
    assert ans["speech_summary"] == "Spoken gist."


def test_validate_defaults_missing_language_to_english():
    ans = _answer(language_code="")
    assert ans["language_code"] == "en-IN"
    assert ans["speech_summary"] == "Spoken gist."


def test_validate_normalizes_aliases():
    assert _answer(language_code="or-IN")["language_code"] == "od-IN"


def test_validate_silences_unspeakable_language():
    ans = _answer(language_code="ur-IN", speech_summary="اردو متن")
    assert ans["language_code"] == ""
    assert ans["speech_summary"] == ""


def test_validate_falls_back_to_question_language():
    spoken = _answer(question_language="hi-in", language_code="")
    assert spoken["language_code"] == "hi-IN"
    assert spoken["speech_summary"] == "Spoken gist."
    muted = _answer(question_language="ur-in", language_code="", speech_summary="اردو متن")
    assert muted["language_code"] == ""
    assert muted["speech_summary"] == ""


def test_chat_language_is_canonicalized_or_dropped():
    from app.models.chat_schemas import ChatIn

    assert ChatIn(message="x", language="ta_IN").language == "ta_in"
    assert ChatIn(message="x", language='hi-IN" onload="x').language == ""


def test_settings_normalize_speech_languages():
    from app.core.config import Settings

    assert Settings(SARVAM_STT_LANGUAGE="od-IN").SARVAM_STT_LANGUAGE == "or-IN"
    assert Settings(SARVAM_TTS_LANGUAGE="hi").SARVAM_TTS_LANGUAGE == "hi-IN"
    assert Settings(SARVAM_TTS_SPEAKER="Shubh").SARVAM_TTS_SPEAKER == "shubh"


if __name__ == "__main__":
    test_tts_language_normalizes_codes_and_aliases()
    test_tts_language_rejects_unspeakable()
    test_validate_keeps_speakable_language()
    test_validate_defaults_missing_language_to_english()
    test_validate_normalizes_aliases()
    test_validate_silences_unspeakable_language()
    test_validate_falls_back_to_question_language()
    test_chat_language_is_canonicalized_or_dropped()
    test_settings_normalize_speech_languages()
    print("Language assertions passed.")
