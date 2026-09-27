"""Machine data seam. ``source`` serves either generated dummy data or the live
PLC over OPC UA, switchable at runtime; both emit the same snapshot shape."""

from __future__ import annotations

import asyncio
import json
import math
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import yaml

from app.core.config import settings
from collector.dummy import make_sampler
from collector.plc import PlcReader

_ROOT = Path(__file__).resolve().parents[1]
_MANIFEST = yaml.safe_load((_ROOT / "collector/config/tags.yaml").read_text())
_FIXTURES = str(_ROOT / "collector/fixtures")


class DummyMachineSource:
    def __init__(self) -> None:
        self._healthy = make_sampler(_MANIFEST, _FIXTURES)
        self._faulted = make_sampler(_MANIFEST, _FIXTURES, fault=settings.MOCK_FAULT)

    async def snapshot(self, machine_key: str) -> dict:
        if machine_key not in {m["machine_key"] for m in _MANIFEST["machines"]}:
            raise KeyError(machine_key)
        sampler = self._faulted if machine_key == settings.MOCK_FAULT_MACHINE else self._healthy
        values, quality, info, titles = (await sampler())[machine_key]
        return {
            "machine_key": machine_key,
            "source_ts": datetime.now(timezone.utc),
            "values": values,
            "quality": quality,
            "info": info,
            "titles": titles,
            "freshness": "live",
            "age_seconds": 0.0,
            "collector_connected": True,
        }

    async def history(self, machine_key: str, since: datetime, until: datetime) -> list[dict]:
        current = await self.snapshot(machine_key)
        span = (until - since).total_seconds()
        points = min(200, max(2, int(span // 60) + 1))
        out = []
        for index in range(points):
            ratio = index / (points - 1)
            ts = since + (until - since) * ratio
            values = dict(current["values"])
            wave = math.sin(ts.timestamp() / 47)
            for key in tuple(values):
                if key.endswith("_temp") and not (
                    machine_key == settings.MOCK_FAULT_MACHINE and key == settings.MOCK_FAULT
                ):
                    values[key] += wave
            out.append({"t": ts, "values": values})
        return out

    async def events(self, machine_key: str) -> list[dict]:
        if machine_key != settings.MOCK_FAULT_MACHINE or not settings.MOCK_FAULT:
            return []
        return [{
            "id": 32014,
            "ts": datetime.now(timezone.utc),
            "event_type": "fault",
            "severity": "error",
            "data": {"code": 32014, "component": settings.MOCK_FAULT},
        }]


def manifest_tags() -> list[dict]:
    """Public read of the signed tag manifest: what may be charted, its unit, type and range."""
    return [
        {"key": t["key"], "unit": t.get("unit"), "type": t.get("type", "Float"), "range": t.get("range")}
        for t in _MANIFEST["tags"]
    ]



LIVE_AGE_S = 15
FINE_S = 15 * 60          # every poll kept this long …
COARSE_S = 7 * 86400      # … then one sample a minute for a week
MAX_POINTS = 300
MAX_EVENTS = 100


def _endpoints() -> dict[str, str]:
    """``orion_1=opc.tcp://host:4840,orion_2=…`` → {machine_key: endpoint}."""
    out = {}
    for part in settings.PLC_ENDPOINTS.split(","):
        key, _, url = part.partition("=")
        if key.strip() and url.strip():
            out[key.strip()] = url.strip()
    return out


def _identity(machine_key: str) -> dict:
    # The real PLC does not publish model/serial over OPC UA; the commissioning
    # grab (same file the dummy animates) is the record of what is installed.
    try:
        machine = json.loads(Path(_FIXTURES, f"snapshot_{machine_key}.json").read_text())["machine"]
    except (OSError, KeyError, ValueError):
        return {}
    return {k: machine[k] for k in ("manufacturer", "model", "serial") if k in machine}


class _PlcMachine:
    """Polls one PLC in the background, keeps the last good read, a history
    buffer and edge-derived events. Never writes to the machine."""

    def __init__(self, machine_key: str, endpoint: str) -> None:
        self.key = machine_key
        self.reader = PlcReader(endpoint, _MANIFEST, _identity(machine_key))
        self.last: dict | None = None
        self.connected = False
        self.error = ""
        self.fine: deque = deque()
        self.coarse: deque = deque()
        self.events: deque = deque(maxlen=MAX_EVENTS)
        self._task: asyncio.Task | None = None
        self._event_id = 0

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.get_running_loop().create_task(self._run())

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        await self.reader.close()
        self.connected = False

    async def _run(self) -> None:
        backoff = 1.0
        while True:
            try:
                values, quality, info, titles, _ = await self.reader.read()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — network, session or server fault
                self.connected = False
                self.error = type(exc).__name__
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 15.0)
                continue
            backoff = 1.0
            now = datetime.now(timezone.utc)
            self._edges(now, values, info)
            self.last = {"ts": now, "values": values, "quality": quality, "info": info, "titles": titles}
            self.connected, self.error = True, ""
            self._remember(now, values)
            await asyncio.sleep(settings.PLC_POLL_SECONDS)

    def _remember(self, now: datetime, values: dict) -> None:
        self.fine.append((now, values))
        while self.fine and (now - self.fine[0][0]).total_seconds() > FINE_S:
            self.fine.popleft()
        if not self.coarse or (now - self.coarse[-1][0]).total_seconds() >= 60:
            self.coarse.append((now, values))
        while self.coarse and (now - self.coarse[0][0]).total_seconds() > COARSE_S:
            self.coarse.popleft()

    def _edges(self, now: datetime, values: dict, info: dict) -> None:
        prev = self.last["values"] if self.last else None
        if prev is None:
            return
        for ax in ("bx", "cs", "ff", "pk", "uw", "vs"):
            if values.get(f"{ax}_error_active") == 1.0 and prev.get(f"{ax}_error_active") != 1.0:
                self._event(now, "fault", "error", {
                    "code": int(values.get(f"{ax}_error_id") or 0), "component": f"{ax}_drive",
                    "text": info.get(f"{ax}_error_text", "")})
        if (values.get("alarm_count") or 0) > (prev.get("alarm_count") or 0):
            self._event(now, "alarm", "warning", {"alarm_count": int(values["alarm_count"])})
        for z in ("hor_front", "hor_rear", "vert1", "vert2"):
            key = f"{z}_tol"
            if key in values and key in prev and values[key] != prev[key]:
                self._event(now, "tolerance", "info" if values[key] else "warning",
                            {"component": f"{z}_temp", "in_tolerance": bool(values[key])})

    def _event(self, ts: datetime, event_type: str, severity: str, data: dict) -> None:
        self._event_id += 1
        self.events.appendleft({"id": self._event_id, "ts": ts, "event_type": event_type,
                                "severity": severity, "data": data})


class PlcMachineSource:
    def __init__(self) -> None:
        self._machines = {k: _PlcMachine(k, url) for k, url in _endpoints().items()}
        self._keys = {m["machine_key"] for m in _MANIFEST["machines"]}

    def start(self) -> None:
        for m in self._machines.values():
            m.start()

    async def stop(self) -> None:
        for m in self._machines.values():
            await m.stop()

    def _machine(self, machine_key: str) -> _PlcMachine | None:
        if machine_key not in self._keys:
            raise KeyError(machine_key)
        m = self._machines.get(machine_key)
        if m is not None:
            m.start()
        return m

    async def snapshot(self, machine_key: str) -> dict:
        m = self._machine(machine_key)
        if m is not None and m.last is None and m.connected is False and not m.error:
            await asyncio.sleep(1.5)  # first request after a switch: give the session a beat
        last = m.last if m else None
        now = datetime.now(timezone.utc)
        age = (now - last["ts"]).total_seconds() if last else None
        connected = bool(m and m.connected)
        if not connected:
            fresh = "disconnected"
        elif age is not None and age <= LIVE_AGE_S:
            fresh = "live"
        else:
            fresh = "stale"
        info = dict(last["info"]) if last else {}
        if m and not info:
            info["ip_address"] = m.reader.endpoint
        return {
            "machine_key": machine_key,
            "source_ts": last["ts"] if last else None,
            "values": dict(last["values"]) if last else {},
            "quality": dict(last["quality"]) if last else {},
            "info": info,
            "titles": dict(last["titles"]) if last else {},
            "freshness": fresh,
            "age_seconds": age,
            "collector_connected": connected,
        }

    async def history(self, machine_key: str, since: datetime, until: datetime) -> list[dict]:
        m = self._machine(machine_key)
        if m is None:
            return []
        fine_start = m.fine[0][0] if m.fine else until
        pts = [p for p in m.coarse if since <= p[0] < min(fine_start, until)]
        pts += [p for p in m.fine if since <= p[0] <= until]
        if len(pts) > MAX_POINTS:
            step = len(pts) / MAX_POINTS
            pts = [pts[int(i * step)] for i in range(MAX_POINTS - 1)] + [pts[-1]]
        return [{"t": t, "values": v} for t, v in pts]

    async def events(self, machine_key: str) -> list[dict]:
        m = self._machine(machine_key)
        return list(m.events) if m else []

    def status(self) -> dict:
        return {k: {"endpoint": m.reader.endpoint, "connected": m.connected, "error": m.error}
                for k, m in self._machines.items()}


Mode = Literal["dummy", "plc"]


class SwitchableSource:
    """What the API calls ``source``: dummy or live PLC, flipped at runtime."""

    def __init__(self, mode: str) -> None:
        self.dummy = DummyMachineSource()
        self.plc = PlcMachineSource()
        self.mode: Mode = "plc" if mode == "plc" else "dummy"

    @property
    def _active(self):
        return self.plc if self.mode == "plc" else self.dummy

    async def set_mode(self, mode: Mode) -> None:
        self.mode = mode
        if mode == "plc":
            self.plc.start()
        else:
            await self.plc.stop()

    def start(self) -> None:
        if self.mode == "plc":
            self.plc.start()

    async def snapshot(self, machine_key: str) -> dict:
        return await self._active.snapshot(machine_key)

    async def history(self, machine_key: str, since: datetime, until: datetime) -> list[dict]:
        return await self._active.history(machine_key, since, until)

    async def events(self, machine_key: str) -> list[dict]:
        return await self._active.events(machine_key)

    def status(self) -> dict:
        return {"mode": self.mode, "machines": self.plc.status()}


source = SwitchableSource(settings.MACHINE_SOURCE)
