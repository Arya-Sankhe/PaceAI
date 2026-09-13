"""Microphone dictation — relays browser audio to Sarvam's realtime streaming STT.

The subscription key never leaves the server: the browser talks only to this
endpoint, which owns the upstream socket.

Why streaming rather than REST: Sarvam's REST endpoint rejects audio over 30s,
and the streaming socket has no session length cap. It takes 16kHz mono
`linear16` PCM, which is what the browser captures. `stream_type=balanced` is
Sarvam's default latency/accuracy tradeoff — `fast` drops accuracy, `simulated`
emits no partials at all.
"""

import asyncio
import base64
import contextlib
import json
from urllib.parse import urlencode

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api import deps
from app.core.config import settings

router = APIRouter()

SARVAM_WS_URL = "wss://api.sarvam.ai/speech-to-text-realtime/ws"
SARVAM_MODEL = "saaras:v3-realtime"
SARVAM_STREAM_TYPE = "balanced"
SAMPLE_RATE = 16000
# Terminology hint applied to the final transcript. Without it the recogniser
# mangles machine jargon (SSR, setpoint, tag names) into everyday words.
PROMPT = (
    "Orion VFFS packaging machine diagnostics. Terminology: heater zone, setpoint, "
    "SSR, solid-state relay, servo axis, fault code, hor_front_temp, vert1_temp."
)
# A turn ends after this much silence in the audio stream. Pinned explicitly
# because it decides how long a mid-sentence pause may be before the transcript
# is split into a second turn (the client appends every final, so nothing is lost).
SILENCE_DURATION_MS = 500
# How long to keep reading after the client stops, so the last utterance's
# transcript.final still lands before we close.
FLUSH_TIMEOUT_S = 4.0


def _upstream_url() -> str:
    return f"{SARVAM_WS_URL}?" + urlencode(
        {
            "language_code": settings.SARVAM_STT_LANGUAGE,
            "model": SARVAM_MODEL,
            "stream_type": SARVAM_STREAM_TYPE,
            "encoding": "linear16",
            "sample_rate": SAMPLE_RATE,
            "endpointing": "vad",
            "silence_duration_ms": SILENCE_DURATION_MS,
            "prompt": PROMPT,
        }
    )


@router.websocket("/speech/stream")
async def speech_stream(ws: WebSocket):
    await ws.accept()

    if not settings.SARVAM_API_KEY:
        await ws.send_text(json.dumps({"event": "error", "message": "speech_not_configured", "is_fatal": True}))
        await ws.close()
        return

    if not settings.DEMO_MODE:
        token = ws.query_params.get("token", "")
        try:
            await deps.user_from_token(token)
        except Exception:  # noqa: BLE001 — any failure here is a bad token
            await ws.close(code=1008)
            return

    try:
        async with websockets.connect(
            _upstream_url(),
            additional_headers={"api-subscription-key": settings.SARVAM_API_KEY},
            max_size=None,
        ) as upstream:
            await _relay(ws, upstream)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001 — hand any upstream fault to the client
        with contextlib.suppress(Exception):
            await ws.send_text(
                json.dumps({"event": "error", "message": f"speech_unavailable: {exc}", "is_fatal": True})
            )
    finally:
        with contextlib.suppress(Exception):
            await ws.close()


async def _relay(client: WebSocket, upstream) -> None:
    """Pump audio up and events down until the client stops talking."""
    audio = asyncio.create_task(_pump_audio(client, upstream))
    events = asyncio.create_task(_pump_events(client, upstream))
    try:
        await audio
        with contextlib.suppress(Exception):
            await upstream.send(json.dumps({"event": "end"}))
        with contextlib.suppress(Exception):
            await asyncio.wait_for(asyncio.shield(events), FLUSH_TIMEOUT_S)
    finally:
        for task in (audio, events):
            task.cancel()
        await asyncio.gather(audio, events, return_exceptions=True)


async def _pump_audio(client: WebSocket, upstream) -> None:
    while True:
        message = await client.receive()
        if message["type"] == "websocket.disconnect":
            return
        audio = message.get("bytes")
        if audio:
            await upstream.send(
                json.dumps({"event": "audio_input", "audio": base64.b64encode(audio).decode()})
            )
        elif message.get("text"):
            try:
                stopped = json.loads(message["text"]).get("event") == "stop"
            except ValueError:
                stopped = False
            if stopped:
                return


async def _pump_events(client: WebSocket, upstream) -> None:
    async for message in upstream:
        if not isinstance(message, str):
            continue
        await client.send_text(message)
        # session.end is terminal: Sarvam finalises the last utterance before
        # sending it, so waiting past this point only delays the close.
        try:
            if json.loads(message).get("event") == "session.end":
                return
        except ValueError:
            pass
