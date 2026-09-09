"""Current machine data seam. Replace ``source`` when a real PLC is needed."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from pathlib import Path

import yaml

from app.core.config import settings
from collector.dummy import make_sampler

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


# ponytail: process-local dummy source; replace with OPC UA only when commissioned.
source = DummyMachineSource()
