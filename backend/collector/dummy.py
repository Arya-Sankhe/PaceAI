"""Snapshot-based dummy sampler. Mirrors plc-dashboard's OFFLINE mode.

Base values come from real PLC grabs (fixtures/snapshot_orion_{1,2}.json —
same files grab_snapshot.py writes), animated with generate.py's physics so a
running machine looks alive. Emits ONLY manifest tag keys, so dummy and PLC
sources are indistinguishable downstream.

Fault drill: MOCK_FAULT=hor_front_temp pins the front heater cold.
"""

import json
import math
import os
import random
import time

# Physics constants lifted from plc-dashboard/generate.py
TEMP_NOISE = 0.15
RPM_NOISE = 0.8
TOL_BAND = 2.0
PPM = 40.0
RPM_RATIO = {"bx": 0.85, "cs": 0.92, "ff": 1.0, "pk": 0.15, "uw": 0.45, "vs": 0.78}
ZONES = ["hor_front", "hor_rear", "vert1", "vert2"]
AXES = ["bx", "cs", "ff", "pk", "uw", "vs"]


def load_fixtures(fixtures_dir: str) -> dict:
    out = {}
    for mk in ("orion_1", "orion_2"):
        with open(os.path.join(fixtures_dir, f"snapshot_{mk}.json")) as f:
            out[mk] = json.load(f)
    return out


def make_sampler(manifest: dict, fixtures_dir: str, fault: str = "",
                 clock=time.time):
    """Returns read_once() -> {machine_key: (values, quality)}. Clock injectable for seeding."""
    fixtures = load_fixtures(fixtures_dir)
    tag_keys = [t["key"] for t in manifest["tags"]]
    machines = [m["machine_key"] for m in manifest["machines"]]
    t0 = clock()

    # Start at setpoint = machine already running (idle-grab temps would demo a cold plant)
    state = {}
    for mk in machines:
        heaters = fixtures[mk]["heaters"]
        st = {"t": 0.0, "good": 129847, "bad": 312}
        for z in ZONES:
            st[f"{z}_set"] = float(heaters[f"{z}_set"])
            st[f"{z}_temp"] = float(heaters[f"{z}_set"])
        state[mk] = st

    async def read_once():
        out = {}
        for mk in machines:
            st = state[mk]
            st["t"] = clock() - t0
            values = _tick(st, st["t"], fault)
            values = {k: values[k] for k in tag_keys if k in values}
            out[mk] = (values, {k: "good" for k in values})
        return out

    return read_once


def _tick(st: dict, t: float, fault: str) -> dict:
    wobble = lambda base, amp, period: base + amp * math.sin(t / period)  # noqa: E731
    v = {}
    for z in ZONES:
        if fault == "hor_front_temp" and z == "hor_front":
            v[f"{z}_temp"] = 90.0 + random.uniform(-0.2, 0.2)
            v[f"{z}_output"] = 100.0
        else:
            v[f"{z}_temp"] = st[f"{z}_set"] + wobble(0, 1.5, 47) + random.uniform(-TEMP_NOISE, TEMP_NOISE)
            v[f"{z}_output"] = max(0.0, min(100.0, (st[f"{z}_set"] - v[f"{z}_temp"]) * 2.5 + 35))
        v[f"{z}_set"] = st[f"{z}_set"]
        v[f"{z}_tol"] = 1.0 if abs(st[f"{z}_set"] - v[f"{z}_temp"]) < TOL_BAND else 0.0
    for ax in AXES:
        rpm = PPM * RPM_RATIO[ax] + random.uniform(-RPM_NOISE, RPM_NOISE)
        v[f"{ax}_rpm"] = max(0.0, rpm)
        v[f"{ax}_current"] = round(max(0.0, 2.5 + rpm * 0.08 + random.uniform(-0.1, 0.1)), 2)
        v[f"{ax}_error_id"] = 0.0
    st["good"] += max(0, int(PPM / 60 + random.uniform(-0.1, 0.1)))
    v["count_good"] = float(st["good"])
    v["count_bad"] = float(st["bad"])
    v["running"] = 1.0
    v["alarm_cnt"] = 1.0 if fault else 0.0
    v["fault_code"] = 32014.0 if fault else 0.0
    return v
