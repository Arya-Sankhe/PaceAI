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
from datetime import datetime, timezone

TEMP_NOISE = 0.15
RPM_NOISE = 0.8
TOL_BAND = 2.0
PPM = 40.0
RPM_RATIO = {"bx": 0.85, "cs": 0.92, "ff": 1.0, "pk": 0.15, "uw": 0.45, "vs": 0.78}
ZONES = ["hor_front", "hor_rear", "vert1", "vert2"]
AXES = ["bx", "cs", "ff", "pk", "uw", "vs"]
AXIS_HAS_POS = {"bx", "pk", "vs"}
INFO_KEYS = ("manufacturer", "model", "serial", "software", "ip_address")


def load_fixtures(fixtures_dir: str) -> dict:
    out = {}
    for mk in ("orion_1", "orion_2"):
        with open(os.path.join(fixtures_dir, f"snapshot_{mk}.json")) as f:
            out[mk] = json.load(f)
    return out


def _parse_hms(s) -> float:
    if not isinstance(s, str):
        return 0.0
    parts = [p.strip() for p in s.split(":")]
    if len(parts) != 3:
        return 0.0
    try:
        h, m, sec = (int(p) for p in parts)
    except ValueError:
        return 0.0
    return float(h * 3600 + m * 60 + sec)


def _join_error_text(val) -> str:
    if isinstance(val, list):
        return " · ".join(str(t).strip() for t in val if t and str(t).strip())
    return str(val).strip() if val else ""


def _b(v) -> float:
    return 1.0 if v else 0.0


def make_sampler(manifest: dict, fixtures_dir: str, fault: str = "",
                 clock=time.time):
    """Returns read_once() -> {machine_key: (values, quality, info, titles)}."""
    fixtures = load_fixtures(fixtures_dir)
    tag_keys = [t["key"] for t in manifest["tags"]]
    machines = [m["machine_key"] for m in manifest["machines"]]
    t0 = clock()

    state = {}
    for mk in machines:
        fx = fixtures[mk]
        heaters, drives, oee, io = fx["heaters"], fx["drives"], fx["oee"], fx["io"]
        st = {
            "t": 0.0,
            "good": 129847.0 if mk == "orion_1" else 88421.0,
            "bad": 312.0 if mk == "orion_1" else 190.0,
            "web_roll_center": float(fx["machine"]["web_roll_center"]),
            "dancer_pos": float(io["dancer_pos"]),
            "poker_active": _b(io["poker_active"]),
            "dia_bypass": _b(io["dia_bypass"]),
            "stripping_active": _b(io["stripping_active"]),
            "unwind_dia_inline": _b(io["unwind_dia_inline"]),
            "advance_cycle_dump": float(io["advance_cycle_dump"]),
            "planned_dt_remaining": float(oee["planned_dt_remaining"]),
            "unplanned_dt_remaining": float(oee["unplanned_dt_remaining"]),
            "prod_remaining": float(oee["prod_remaining"]),
            "shift_total_time": float(oee["shift_total_time"]),
            "util": [_parse_hms(x) for x in oee["utilization_time"]],
            "pdt": [float(x) for x in oee["planned_dt_sorted_counts"]],
            "udt": [float(x) for x in oee["unplanned_dt_sorted_counts"]],
            "pdt_titles": list(oee["planned_dt_sorted_titles"]),
            "udt_titles": list(oee["unplanned_dt_sorted_titles"]),
            "machine": fx["machine"],
            "error_text": {ax: _join_error_text(drives.get(f"{ax}_error_text")) for ax in AXES},
        }
        for z in ZONES:
            st[f"{z}_set"] = float(heaters[f"{z}_set"])
            st[f"{z}_temp"] = float(heaters[f"{z}_set"])
        for ax in AXES:
            st[f"{ax}_temp"] = float(drives.get(f"{ax}_temp") or 36.0)
            st[f"{ax}_pos"] = float(drives.get(f"{ax}_position") or 0.0)
        state[mk] = st

    async def read_once():
        out = {}
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        for mk in machines:
            st = state[mk]
            st["t"] = clock() - t0
            values, info, titles = _tick(st, st["t"], fault, now)
            values = {k: values[k] for k in tag_keys if k in values}
            out[mk] = (values, {k: "good" for k in values}, info, titles)
        return out

    return read_once


def _tick(st: dict, t: float, fault: str, now: str) -> tuple[dict, dict, dict]:
    wobble = lambda base, amp, period: base + amp * math.sin(t / period)  # noqa: E731
    v = {}
    v["heater_on"] = 1.0
    v["running"] = 1.0
    v["server_state"] = 0.0

    for z in ZONES:
        if fault == "hor_front_temp" and z == "hor_front":
            v[f"{z}_temp"] = 90.0 + random.uniform(-0.2, 0.2)
            v[f"{z}_output"] = 100.0
        else:
            v[f"{z}_temp"] = st[f"{z}_set"] + wobble(0, 1.5, 47) + random.uniform(-TEMP_NOISE, TEMP_NOISE)
            v[f"{z}_output"] = max(0.0, min(100.0, (st[f"{z}_set"] - v[f"{z}_temp"]) * 2.5 + 35))
        v[f"{z}_set"] = st[f"{z}_set"]
        v[f"{z}_tol"] = 1.0 if abs(st[f"{z}_set"] - v[f"{z}_temp"]) < TOL_BAND else 0.0
        v[f"{z}_heater_on"] = 1.0 if v[f"{z}_output"] > 1.0 else 0.0

    for ax in AXES:
        rpm = PPM * RPM_RATIO[ax] + random.uniform(-RPM_NOISE, RPM_NOISE)
        v[f"{ax}_rpm"] = max(0.0, rpm)
        v[f"{ax}_current"] = round(max(0.0, 2.5 + rpm * 0.08 + random.uniform(-0.1, 0.1)), 2)
        v[f"{ax}_error_id"] = 0.0
        v[f"{ax}_error_active"] = 0.0
        v[f"{ax}_temp"] = st[f"{ax}_temp"] + wobble(0, 0.4, 71) + random.uniform(-0.05, 0.05)
        if ax in AXIS_HAS_POS:
            st[f"{ax}_pos"] = (st[f"{ax}_pos"] + rpm * 6 / 60) % 360
            v[f"{ax}_position"] = st[f"{ax}_pos"]

    v["vs_powered_on"] = 1.0
    v["vs_is_homed"] = 1.0
    v["vs_in_sync"] = 1.0

    st["good"] += max(0, int(PPM / 60 + random.uniform(-0.1, 0.1)))
    v["count_good"] = float(st["good"])
    v["count_bad"] = float(st["bad"])
    v["fault_code"] = 32014.0 if fault else 0.0
    v["alarm_count"] = 1.0 if fault else 0.0
    v["web_roll_center"] = st["web_roll_center"] + wobble(0, 0.4, 83)

    v["poker_active"] = st["poker_active"]
    v["dancer_pos"] = st["dancer_pos"]
    v["dia_bypass"] = st["dia_bypass"]
    v["stripping_active"] = st["stripping_active"]
    v["unwind_dia_inline"] = st["unwind_dia_inline"]
    v["advance_cycle_dump"] = st["advance_cycle_dump"]

    st["util"][0] += 1.0
    st["prod_remaining"] = max(0.0, st["prod_remaining"] - PPM / 60)
    v["planned_dt_remaining"] = st["planned_dt_remaining"]
    v["unplanned_dt_remaining"] = st["unplanned_dt_remaining"]
    v["prod_remaining"] = st["prod_remaining"]
    v["shift_total_time"] = st["shift_total_time"]
    for i, sec in enumerate(st["util"]):
        v[f"util_{i}"] = float(sec)
    udt = list(st["udt"])
    if fault:
        for i, title in enumerate(st["udt_titles"]):
            if title.strip().lower() == "fault":
                udt[i] = st["udt"][i] + 1.0
                break
    for i, c in enumerate(st["pdt"]):
        v[f"pdt_{i}"] = float(c)
    for i, c in enumerate(udt):
        v[f"udt_{i}"] = float(c)

    m = st["machine"]
    info = {k: str(m.get(k, "")) for k in INFO_KEYS}
    info["date_time"] = now
    info["server_time"] = now
    for ax in AXES:
        info[f"{ax}_error_text"] = "" if not fault else st["error_text"][ax]
    titles = {"planned_dt": list(st["pdt_titles"]), "unplanned_dt": list(st["udt_titles"])}
    return v, info, titles
