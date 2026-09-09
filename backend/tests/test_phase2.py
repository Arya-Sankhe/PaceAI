"""Phase 2 checks. Pure functions + manifest only — no DB, no network, no PLC."""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.api.routes.telemetry import freshness  # noqa: E402
from app.machine_source import source  # noqa: E402
from collector.dummy import make_sampler  # noqa: E402


def test_freshness_states():
    now = datetime.now(timezone.utc)
    assert freshness(now, now, "good")[0] == "live"
    assert freshness(now, now - timedelta(seconds=60), "good")[0] == "stale"
    assert freshness(now, now, "bad")[0] == "bad_quality"
    assert freshness(now, None, "good")[0] == "unknown"


def test_machine_source_fault_is_visible():
    state = asyncio.run(source.snapshot("orion_1"))
    assert state["values"]["fault_code"] == 32014.0
    assert state["values"]["hor_front_output"] == 100.0


def test_tags_manifest_allowlist():
    m = yaml.safe_load(open(BACKEND_DIR / "collector/config/tags.yaml"))
    assert m["manifest_version"] in m["supported_by_collector"]
    nodes = [t["node"] for t in m["tags"]]
    assert len(set(nodes)) == len(nodes), "duplicate node mapping"
    keys = {t["key"] for t in m["tags"]}
    assert {"hor_front_temp", "cs_error_id", "fault_code", "count_good",
            "heater_on", "bx_temp", "vs_powered_on", "poker_active",
            "prod_remaining", "util_0", "pdt_0", "udt_0", "web_roll_center"} <= keys
    assert {m["machine_key"] for m in m["machines"]} == {"orion_1", "orion_2"}


def _manifest():
    return yaml.safe_load(open(BACKEND_DIR / "collector/config/tags.yaml"))


def test_dummy_matches_manifest_keys():
    m = _manifest()
    out = asyncio.run(make_sampler(m, str(BACKEND_DIR / "collector/fixtures"))())
    tag_keys = {t["key"] for t in m["tags"]}
    for _mk, packed in out.items():
        values, quality, info, titles = packed
        assert set(values) == tag_keys
        assert all(isinstance(v, float) for v in values.values())
        assert set(quality.values()) == {"good"}
        assert {"model", "serial", "ip_address"} <= set(info)
        assert titles["planned_dt"] and titles["unplanned_dt"]


def test_dummy_fault_drill():
    m = _manifest()
    out = asyncio.run(make_sampler(m, str(BACKEND_DIR / "collector/fixtures"),
                                   fault="hor_front_temp")())["orion_1"][0]
    assert out["hor_front_temp"] < 100 and out["hor_front_output"] == 100.0
    assert out["hor_front_tol"] == 0.0 and out["fault_code"] == 32014.0
    assert out["heater_on"] == 1.0 and out["alarm_count"] == 1.0
    assert out["hor_front_heater_on"] == 1.0


if __name__ == "__main__":
    test_freshness_states()
    test_machine_source_fault_is_visible()
    test_tags_manifest_allowlist()
    test_dummy_matches_manifest_keys()
    test_dummy_fault_drill()
    print("Phase 2 assertions passed.")
