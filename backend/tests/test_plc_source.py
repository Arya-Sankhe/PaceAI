"""PLC source checks without a PLC: node plan, value mapping, switch, offline shape."""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.machine_source import PlcMachineSource, SwitchableSource  # noqa: E402
from collector.plc import _num, _plan  # noqa: E402

MANIFEST = yaml.safe_load(open(BACKEND_DIR / "collector/config/tags.yaml"))


def test_plan_reads_arrays_whole_and_skips_tbd():
    nodes, tags = _plan(MANIFEST)
    keys = {k for k, _, _ in tags}
    assert "fault_code" not in keys and "util_0" in keys and "count_good" in keys
    util = {k: (nodes[i], idx) for k, i, idx in tags if k.startswith("util_")}
    assert util["util_0"] == ("ns=6;s=::DataHandle:iVa_OEEUTILIZETime", 0)
    assert util["util_6"][1] == 6
    assert len(set(nodes)) == len(nodes)


def test_value_mapping():
    assert _num(True) == 1.0 and _num(False) == 0.0
    assert _num(7) == 7.0 and _num(1.5) == 1.5
    assert _num("00 : 45 : 07") == 2707.0
    assert _num(None) is None and _num("") is None


def test_unreachable_plc_reports_disconnected():
    async def run():
        plc = PlcMachineSource()
        snap = await plc.snapshot("orion_2")  # no endpoint configured for orion_2
        assert snap["freshness"] == "disconnected" and snap["values"] == {}
        assert snap["collector_connected"] is False
        now = datetime.now(timezone.utc)
        assert await plc.history("orion_2", now - timedelta(hours=1), now) == []
        try:
            await plc.snapshot("nope")
        except KeyError:
            pass
        else:
            raise AssertionError("unknown machine must raise")
    asyncio.run(run())


def test_switch_defaults_to_dummy_and_flips():
    async def run():
        src = SwitchableSource("dummy")
        assert src.status()["mode"] == "dummy"
        assert (await src.snapshot("orion_1"))["freshness"] == "live"
        await src.set_mode("dummy")
        assert src.mode == "dummy"
    asyncio.run(run())


def test_tolerance_uses_hmi_band_with_default_10():
    from collector.tolerance import apply_tolerance
    v = {"hor_front_temp": 164.0, "hor_front_set": 155.0}  # no band read → ±10
    apply_tolerance(v)
    assert v["hor_front_tol"] == 1.0 and v["hor_front_tol_plus"] == 10.0
    v = {"hor_front_temp": 150.0, "hor_front_set": 155.0, "hor_front_tol_plus": 2.0, "hor_front_tol_minus": 3.0}
    apply_tolerance(v)
    assert v["hor_front_tol"] == 0.0  # 5° below with an HMI band of −3
