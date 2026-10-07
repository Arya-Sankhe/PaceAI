"""End-of-shift report: deterministic facts from the machine, plus a grounded
narrative. Every number in the PDF comes from ``collect``; the model only words
the assessment and the actions, and a rules-based fallback covers a provider miss."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.copilot import generator
from app.machine_source import source

ZONES = (("hor_front", "Horizontal Front"), ("hor_rear", "Horizontal Rear"),
         ("vert1", "Vertical 1"), ("vert2", "Vertical 2"))
AXES = (("bx", "Box Forming"), ("cs", "Cross Seal"), ("ff", "Film Feed"),
        ("pk", "Poker"), ("uw", "Unwind"), ("vs", "Vertical Seal"))
LABELS = {**{f"{p}_temp": f"{n} heater" for p, n in ZONES}, **{f"{p}_drive": f"{n} drive" for p, n in AXES}}
DEFAULT_HOURS = 8.0
MAX_HOURS = 24.0
OEE_WORLD_CLASS = 85.0
OEE_TYPICAL = 65.0

SYSTEM = """You write the assessment section of an end-of-shift report for a VFFS (vertical form-fill-seal) packaging machine, read by the shift supervisor and the maintenance team.
Rules:
- Use ONLY the numbers in <facts>. Never invent a value, cause, part number or procedure. If something is not in the facts, do not claim it.
- Be direct and specific, like a plant engineer: name the zone, drive, downtime reason and the figure. No filler, no restating the question.
- headline: one sentence, the shift in a nutshell, with the OEE figure.
- summary: 2-3 sentences: how the shift went, the biggest loss and what drove it.
- went_well: up to 3 short bullets of things that genuinely went well (with figures). Empty list if nothing did.
- watch: up to 4 short bullets of problems or risks, biggest first (with figures).
- actions: 3 to 5 actions for the NEXT shift, ordered by expected payoff. Each {title (imperative, under 9 words), why (one sentence citing the evidence), how (one or two sentences: concrete steps), impact: "high"|"medium"|"low", owner: "Operator"|"Maintenance"|"Supervisor"}. Tie each to a loss in the facts; if the shift was clean, give preventive actions and say so.
- next_shift_focus: one sentence, the single thing to watch at the start of the next shift.
- Write in plain words: never print tag names (like hor_front_temp), field names (like error_id), or the words null/None/false. Say "not reported" if a value is missing.
- Heater/drive advice must be safe: any electrical work says to lock out and let heaters cool first.
Respond as strict JSON: {headline, summary, went_well[], watch[], actions[{title,why,how,impact,owner}], next_shift_focus}."""


def _f(values: dict, key: str) -> float | None:
    v = values.get(key)
    return float(v) if isinstance(v, (int, float)) and v == v else None


def _rating(oee: float | None) -> str:
    if oee is None:
        return "unknown"
    return "world-class" if oee >= OEE_WORLD_CLASS else "typical" if oee >= OEE_TYPICAL else "needs work"


async def collect(key: str, hours: float | None = None) -> dict:
    snap = await source.snapshot(key)
    v = snap["values"]
    titles = snap.get("titles") or {}
    now = datetime.now(timezone.utc)

    # The HMI's OEE block is per shift, so the report covers the shift so far.
    shift_s = _f(v, "shift_total_time") or 0.0
    span_h = hours or (shift_s / 3600 if shift_s >= 600 else DEFAULT_HOURS)
    span_h = max(0.25, min(span_h, MAX_HOURS))
    since = now - timedelta(hours=span_h)

    oee, avail, perf, qual = (_f(v, k) for k in ("oee", "availability", "performance", "quality"))
    good, bad = _f(v, "count_good"), _f(v, "count_bad")
    total = (good or 0) + (bad or 0)
    scrap = 100 * (bad or 0) / total if total else None

    # Losses in OEE points: what each factor took off the top.
    losses = None
    if None not in (avail, perf, qual):
        a, p, q = avail / 100, perf / 100, qual / 100
        losses = {"availability": round(100 * (1 - a), 1), "performance": round(100 * a * (1 - p), 1),
                  "quality": round(100 * a * p * (1 - q), 1)}

    def downtime(prefix: str, names: list[str]) -> list[dict]:
        rows = [{"reason": n, "count": int(_f(v, f"{prefix}_{i}") or 0)} for i, n in enumerate(names)]
        return sorted((r for r in rows if r["count"] > 0), key=lambda r: -r["count"])

    unplanned = downtime("udt", titles.get("unplanned_dt") or [])
    planned = downtime("pdt", titles.get("planned_dt") or [])

    try:
        points = await source.history(key, since, now)
    except Exception:  # noqa: BLE001 — history is decoration, never a reason to fail the report
        points = []

    zones = []
    for prefix, label in ZONES:
        temps = [p["values"].get(f"{prefix}_temp") for p in points]
        temps = [t for t in temps if isinstance(t, (int, float))]
        tols = [p["values"].get(f"{prefix}_tol") for p in points]
        tols = [t for t in tols if isinstance(t, (int, float))]
        setpoint = _f(v, f"{prefix}_set")
        zones.append({
            "prefix": prefix, "label": label, "setpoint": setpoint, "now": _f(v, f"{prefix}_temp"),
            "min": min(temps) if temps else None, "max": max(temps) if temps else None,
            "avg": sum(temps) / len(temps) if temps else None,
            "in_tol_pct": 100 * sum(1 for t in tols if t) / len(tols) if tols else
                          (100.0 if _f(v, f"{prefix}_tol") else 0.0 if _f(v, f"{prefix}_tol") is not None else None),
            "series": temps[:: max(1, len(temps) // 60)] if temps else [],
            "output": _f(v, f"{prefix}_output"),
        })

    axes = []
    for prefix, label in AXES:
        err = _f(v, f"{prefix}_error_id") or 0
        axes.append({"prefix": prefix, "label": label, "rpm": _f(v, f"{prefix}_rpm"),
                     "temp": _f(v, f"{prefix}_temp"), "fault": bool(err and _f(v, f"{prefix}_error_active")),
                     "error_id": int(err)})

    running = [p["values"].get("running") for p in points]
    running = [r for r in running if isinstance(r, (int, float))]
    speeds = [p["values"].get("actual_speed") for p in points]
    speeds = [s for s in speeds if isinstance(s, (int, float)) and s > 0]

    events = []
    for e in (await source.events(key))[:200]:
        ts = e["ts"]
        if isinstance(ts, datetime) and ts >= since:
            data = {k: (LABELS.get(x, x) if isinstance(x, str) else x) for k, x in (e["data"] or {}).items()}
            events.append({"ts": ts.isoformat(), "type": e["event_type"], "severity": e["severity"], "data": data})

    name = {"orion_1": "Orion VFFS #1", "orion_2": "Orion VFFS #2"}.get(key, key)
    return {
        "has_data": bool(v), "machine_key": key, "machine": name, "source": source.mode,
        "generated_at": now.isoformat(), "since": since.isoformat(), "until": now.isoformat(),
        "hours": round(span_h, 2), "freshness": snap["freshness"], "connected": snap["collector_connected"],
        "last_data": snap["source_ts"].isoformat() if snap["source_ts"] else None,
        "oee": oee, "availability": avail, "performance": perf, "quality": qual, "rating": _rating(oee),
        "losses": losses, "good": good, "bad": bad, "total": total or None, "scrap_pct": scrap,
        "set_speed": _f(v, "set_speed"), "max_speed": _f(v, "max_speed"),
        "actual_speed": _f(v, "actual_speed"),
        "avg_speed": sum(speeds) / len(speeds) if speeds else None,
        "run_pct": 100 * sum(1 for r in running if r) / len(running) if running else None,
        "shift_seconds": shift_s or None, "bags_remaining": _f(v, "prod_remaining"),
        "unplanned": unplanned, "planned": planned, "unplanned_stops": sum(r["count"] for r in unplanned), "zones": zones, "axes": axes, "events": events,
        "fault_active": bool(_f(v, "fault_active")), "fault_code": int(_f(v, "fault_code") or 0),
        "alarm_count": int(_f(v, "alarm_count") or 0), "model": (snap.get("info") or {}).get("model", ""),
    }


def _facts_for_model(f: dict) -> str:
    """The facts the model may cite: no series, no timestamps it could mangle."""
    slim = {k: f[k] for k in (
        "hours", "oee", "availability", "performance", "quality", "rating", "losses", "good", "bad",
        "scrap_pct", "set_speed", "max_speed", "avg_speed", "run_pct", "unplanned", "planned",
        "fault_active", "fault_code", "alarm_count", "unplanned_stops")}
    slim["zones"] = [{k: (round(z[k], 1) if isinstance(z[k], float) else z[k]) for k in
                      ("label", "setpoint", "now", "min", "max", "in_tol_pct", "output")} for z in f["zones"]]
    slim["axes"] = [{k: a[k] for k in ("label", "rpm", "fault", "error_id")} for a in f["axes"]]
    slim["events"] = [{"type": e["type"], "severity": e["severity"], "data": e["data"]} for e in f["events"][:15]]
    return json.dumps(slim, default=str, indent=1)


def fallback(f: dict) -> dict:
    """Rules-based assessment, used when the model is unavailable. Same shape."""
    oee = f["oee"]
    went_well, watch, actions = [], [], []
    if oee is not None and oee >= OEE_WORLD_CLASS:
        went_well.append(f"OEE of {oee:.1f}% is at world-class level.")
    if f["scrap_pct"] is not None and f["scrap_pct"] <= 2:
        went_well.append(f"Scrap held at {f['scrap_pct']:.1f}%.")
    healthy = [z for z in f["zones"] if z["in_tol_pct"] and z["in_tol_pct"] >= 95]
    if len(healthy) == len(f["zones"]):
        went_well.append("All four heater zones stayed in tolerance.")
    if f["losses"]:
        worst = max(f["losses"], key=f["losses"].get)
        if f["losses"][worst] >= 3:
            watch.append(f"{worst.capitalize()} was the biggest loss at {f['losses'][worst]:.1f} OEE points.")
            actions.append({
                "title": f"Recover {worst} losses", "impact": "high", "owner": "Supervisor",
                "why": f"{worst.capitalize()} cost {f['losses'][worst]:.1f} OEE points this shift.",
                "how": {"availability": "Review the top unplanned stop reasons and pre-stage the parts and film they involve.",
                        "performance": "Compare actual speed with the set speed and check what is capping it (film feed, sealing time).",
                        "quality": "Check seal integrity and film tracking on rejected bags and adjust before restart."}[worst]})
    if f["unplanned"]:
        top = f["unplanned"][0]
        watch.append(f"Top unplanned stop: {top['reason']} ({top['count']}x).")
        actions.append({"title": f"Fix recurring: {top['reason'][:40]}", "impact": "high", "owner": "Maintenance",
                        "why": f"'{top['reason']}' stopped the line {top['count']} times.",
                        "how": "Inspect the root cause during the next planned stop and log the finding."})
    for z in f["zones"]:
        if z["in_tol_pct"] is not None and z["in_tol_pct"] < 90:
            watch.append(f"{z['label']} heater was in tolerance only {z['in_tol_pct']:.0f}% of the time.")
            actions.append({"title": f"Check {z['label']} heater", "impact": "high", "owner": "Maintenance",
                            "why": f"{z['label']} spent {100 - z['in_tol_pct']:.0f}% of the shift out of tolerance.",
                            "how": "Lock out power and let the jaws cool, then check the cartridge resistance and the solid-state relay output."})
    for a in f["axes"]:
        if a["fault"]:
            watch.append(f"{a['label']} drive reports error {a['error_id']}.")
            actions.append({"title": f"Clear {a['label']} drive error", "impact": "high", "owner": "Maintenance",
                            "why": f"Error {a['error_id']} is active on the {a['label']} axis.",
                            "how": "Read the drive error text on the HMI, check cabling and load, then reset and re-home."})
    if not actions:
        actions.append({"title": "Keep the current setup", "impact": "low", "owner": "Supervisor",
                        "why": "No significant losses were found this shift.",
                        "how": "Run the routine checks: seal jaw cleaning and film splice inspection."})
    head = (f"OEE {oee:.1f}% ({f['rating']})." if oee is not None else "OEE was not reported this shift.")
    return {"headline": head, "summary": head + (" " + watch[0] if watch else " No major issues were recorded."),
            "went_well": went_well[:3], "watch": watch[:4], "actions": actions[:5],
            "next_shift_focus": actions[0]["title"] + "."}


def validate(raw: object) -> dict:
    """Bound every field the PDF prints; drop anything malformed."""
    if not isinstance(raw, dict):
        raise ValueError("bad_report")

    def s(x, n): return str(x or "").strip()[:n]
    def lst(x, n, m): return [s(i, m) for i in (x if isinstance(x, list) else []) if s(i, m)][:n]

    actions = []
    for a in raw.get("actions") if isinstance(raw.get("actions"), list) else []:
        if isinstance(a, dict) and s(a.get("title"), 90):
            impact = s(a.get("impact"), 10).lower()
            actions.append({"title": s(a.get("title"), 90), "why": s(a.get("why"), 260), "how": s(a.get("how"), 380),
                            "impact": impact if impact in ("high", "medium", "low") else "medium",
                            "owner": s(a.get("owner"), 24) or "Supervisor"})
    if not actions or not s(raw.get("headline"), 200):
        raise ValueError("bad_report")
    return {"headline": s(raw.get("headline"), 200), "summary": s(raw.get("summary"), 600),
            "went_well": lst(raw.get("went_well"), 3, 200), "watch": lst(raw.get("watch"), 4, 200),
            "actions": actions[:5], "next_shift_focus": s(raw.get("next_shift_focus"), 240)}


async def narrative(facts: dict) -> dict:
    try:
        raw, _ = await generator.generate(f"<facts>\n{_facts_for_model(facts)}\n</facts>", [], SYSTEM)
        return validate(raw)
    except Exception:  # noqa: BLE001 — a report must always come out
        return fallback(facts)
