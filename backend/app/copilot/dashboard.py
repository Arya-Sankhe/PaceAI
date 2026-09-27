"""Describe-to-dashboard. The model plans widgets over the tag manifest; the
client draws every number from the machine endpoints, so nothing here can be
fabricated. A derived metric is plain arithmetic over real tags, parsed here
before it ever reaches a browser."""

import json
import re

from app.copilot.generator import DiagnosticError

# kind -> (min, max) metrics it takes; (0, 0) = a fixed panel that takes none
KINDS = {
    "stat": (1, 6), "gauge": (1, 1), "line": (1, 6), "bars": (2, 12), "split": (2, 6),
    "status": (1, 12), "table": (1, 16), "heaters": (0, 0), "drives": (0, 0), "events": (0, 0),
}
TARGETED = ("stat", "gauge", "line")
SCALED = ("gauge", "bars")
WINDOWS = ("live", "1h", "8h", "24h", "7d")
SIZES = ("s", "m", "l", "wide")
FUNCS = ("abs", "min", "max", "avg", "sum")
MAX_WIDGETS = 16
MAX_EXPR = 240

# --- catalog: the manifest in operator language --------------------------------

_DRIVES = {"bx": "Box forming", "cs": "Cross seal", "ff": "Film feed", "pk": "Poker", "uw": "Unwind", "vs": "Vertical seal"}
_ZONES = {"hor_front": "Horizontal front", "hor_rear": "Horizontal rear", "vert1": "Vertical 1", "vert2": "Vertical 2"}
_ZONE_PARTS = {"temp": "temperature", "set": "setpoint", "output": "heat output", "tol": "in tolerance", "tol_plus": "tolerance above setpoint",
               "tol_minus": "tolerance below setpoint", "heater_on": "heater on"}
_DRIVE_PARTS = {"rpm": "speed", "current": "current", "temp": "temperature", "position": "position",
                "error_id": "error ID", "error_active": "error active", "powered_on": "powered on",
                "is_homed": "homed", "in_sync": "in sync"}
_NAMED = {
    "server_state": "Controller state", "alarm_count": "Active alarm count", "web_roll_center": "Web roll centre position",
    "heater_on": "Heaters enabled", "planned_dt_remaining": "Planned downtime remaining",
    "unplanned_dt_remaining": "Unplanned downtime remaining", "prod_remaining": "Bags remaining this shift",
    "shift_total_time": "Shift time elapsed", "poker_active": "Poker active", "dancer_pos": "Unwind dancer position",
    "dia_bypass": "Diameter bypass", "stripping_active": "Box stripping active", "unwind_dia_inline": "Unwind diameter in-line",
    "advance_cycle_dump": "Advance cycle dumps", "count_good": "Good bags", "count_bad": "Rejected bags",
    "running": "Line running", "fault_code": "Fault code",
    "set_speed": "Set machine speed", "actual_speed": "Actual machine speed", "max_speed": "Maximum machine speed",
    "oee": "OEE", "availability": "OEE availability", "performance": "OEE performance", "quality": "OEE quality",
    "alarm_active": "Alarm active", "fault_active": "Fault active", "estop": "Emergency stop pressed",
    "ready_to_start": "Ready to start", "producing": "Producing",
}
_PRODUCTION = {"count_good", "count_bad", "running", "fault_code", "prod_remaining", "shift_total_time",
               "set_speed", "actual_speed", "max_speed", "oee", "availability", "performance", "quality", "producing",
               "planned_dt_remaining", "unplanned_dt_remaining", "advance_cycle_dump"}


def _label(key: str, titles: dict) -> tuple[str, str]:
    """(label, group) for a manifest key."""
    if key in _NAMED:
        return _NAMED[key], "Production" if key in _PRODUCTION else "Machine"
    for prefix, zone in _ZONES.items():
        if key.startswith(prefix + "_"):
            part = key[len(prefix) + 1:]
            return f"{zone} {_ZONE_PARTS.get(part, part.replace('_', ' '))}", "Heaters"
    head, _, part = key.partition("_")
    if head in _DRIVES:
        return f"{_DRIVES[head]} {_DRIVE_PARTS.get(part, part.replace('_', ' '))}", "Drives"
    m = re.fullmatch(r"(util|pdt|udt)_(\d+)", key)
    if m:
        kind, i = m.group(1), int(m.group(2))
        if kind == "util":
            return f"Utilization channel {i + 1}", "Utilization"
        names = titles.get("planned_dt" if kind == "pdt" else "unplanned_dt") or []
        name = names[i] if i < len(names) and names[i] else f"reason {i + 1}"
        return f"{'Planned' if kind == 'pdt' else 'Unplanned'} downtime: {name}", "Downtime"
    return key.replace("_", " ").capitalize(), "Machine"


def catalog(tags: list[dict], titles: dict | None = None) -> list[dict]:
    """Every chartable signal with a human label, group, unit and kind."""
    out = []
    for t in tags:
        label, group = _label(t["key"], titles or {})
        out.append({
            "key": t["key"], "label": label, "group": group, "unit": t.get("unit") or "",
            "kind": "bool" if t.get("type") == "Bool" else "number",
            **({"range": t["range"]} if t.get("range") else {}),
        })
    return out


# --- derived metrics: + - * / ( ) numbers, tags and a few functions -------------

_TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\S))")


def parse_expr(src: str, allowed: set[str]) -> str | None:
    """Pure: the normalised expression if it is well-formed arithmetic over known
    tags, else None. Mirrors the client evaluator's grammar exactly. Tested."""
    if not isinstance(src, str) or not src.strip() or len(src) > MAX_EXPR:
        return None
    toks: list[tuple[str, str]] = []
    for num, name, op in _TOKEN.findall(src):
        if num:
            toks.append(("num", num))
        elif name:
            toks.append(("fn" if name in FUNCS else "tag", name))
        elif op in "+-*/(),":
            toks.append(("op", op))
        else:
            return None
    pos, refs = 0, set()

    def peek() -> tuple[str, str] | None:
        return toks[pos] if pos < len(toks) else None

    def take(value: str) -> bool:
        nonlocal pos
        if peek() == ("op", value):
            pos += 1
            return True
        return False

    def expr() -> bool:
        if not term():
            return False
        while take("+") or take("-"):
            if not term():
                return False
        return True

    def term() -> bool:
        if not factor():
            return False
        while take("*") or take("/"):
            if not factor():
                return False
        return True

    def factor() -> bool:
        nonlocal pos
        tok = peek()
        if tok is None:
            return False
        if take("-"):
            return factor()
        if take("("):
            return expr() and take(")")
        kind, value = tok
        pos += 1
        if kind == "num":
            return True
        if kind == "tag":
            if value not in allowed:
                return False
            refs.add(value)
            return True
        if kind == "fn":
            if not take("(") or not expr():
                return False
            while take(","):
                if not expr():
                    return False
            return take(")")
        return False

    if not expr() or pos != len(toks) or not refs:
        return None
    return " ".join(v for _, v in toks)


# --- the planner ------------------------------------------------------------

SYSTEM = """You are PaceAI's dashboard builder for an Orion VFFS packaging machine. The operator asks for anything they want to watch; you turn it into widgets over the machine's real signals.

Widget kinds (metrics = what it plots):
- "stat": big live numbers with sparklines, 1-6 metrics. Best for a headline value or a few KPIs.
- "gauge": one metric on a dial, 1 metric. Good for % outputs, speeds, anything with a natural range. Set "min"/"max" when you know them.
- "line": a time chart, 1-6 metrics. "window" is "live" (rolling last minutes, default) or "1h", "8h", "24h", "7d" for history. Keep metrics of one unit together; mixed units are drawn as stacked panels.
- "bars": compare 2-12 metrics side by side right now (e.g. all six drive currents). Same unit only.
- "split": part-of-a-whole, 2-6 metrics that add up to a total (e.g. good vs rejected bags).
- "status": on/off lights for 1-12 boolean signals (heater on, in tolerance, error active, running).
- "table": 1-16 metrics listed with now / min / max / average.
- "heaters": the four heater zones: temperature vs setpoint, output, tolerance. No metrics.
- "drives": the six servo drives: speed, current, temperature, faults. No metrics.
- "events": recent machine events and faults. No metrics.

A metric is {"key": "<tag>", "label": "..."} or a derived one {"expr": "<arithmetic>", "label": "...", "unit": "..."}.
- "key" must be a tag from <signals>. Never invent a tag.
- "expr" is arithmetic over tags from <signals> using + - * / ( ), numbers and abs(), min(), max(), avg(), sum(). Use it for anything the machine does not report directly but can be computed: reject rate = count_bad / (count_good + count_bad) * 100, heater deviation = hor_front_temp - hor_front_set, average drive current = avg(bx_current, cs_current, ff_current, pk_current, uw_current, vs_current).
- Labels are short operator language ("Front heater", "Reject rate"), never tag keys.
- "stat", "gauge" and "line" may take "target": {"key": "<tag>"} or {"value": number}, plus optional "band" (allowed deviation). Use the matching setpoint tag for a temperature.
- Pick the kind that answers the question at a glance. Booleans go in "status", never a chart.
- Optional "size": "s", "m", "l" or "wide" hints how much room a widget deserves.

Editing: <current_dashboard> lists what is on the board, each widget with its "id". Return only the changes:
- "add": new widgets.
- "update": full replacement widgets for existing ones, each with its "id".
- "remove": ids to take off.
A request for a whole new dashboard removes the old widgets and adds new ones. When <focus_widget> is given, the request is about that widget: update it (or remove it if asked) and leave the others alone.
Keep the board focused: the fewest widgets that answer the request.

"message": one or two short sentences to the operator saying what you did. If they asked for something the machine does not measure, say so plainly and suggest the closest real signal; never pretend.
"title": a short dashboard name, only when building a new dashboard; otherwise omit it.

Respond as strict JSON: {"title": string?, "message": string, "add": [widget], "update": [widget], "remove": [string]}
widget = {"id": string?, "type": string, "title": string, "metrics": [metric]?, "window": string?, "target": {...}?, "band": number?, "min": number?, "max": number?, "size": string?}"""


def build_user(request: str, signals: list[dict], current: list[dict] | None, focus: str | None) -> str:
    lines = "\n".join(
        f"- {s['key']} | {s['label']} | {s['unit'] or '-'} | {s['kind']}" + (f" | range {s['range'][0]}-{s['range'][1]}" if s.get("range") else "")
        for s in signals
    )
    board = f"<current_dashboard>\n{json.dumps(current)}\n</current_dashboard>\n" if current else ""
    focused = f"<focus_widget>{focus}</focus_widget>\n" if focus else ""
    return f"<request>{request}</request>\n{board}{focused}<signals>\n{lines}\n</signals>"


def _number(v) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v) if abs(v) < 1e9 else None


def _metric(m, by_key: dict[str, dict]) -> dict | None:
    if not isinstance(m, dict):
        return None
    key = str(m.get("key") or "").strip()
    if key:
        if key not in by_key:
            return None
        sig = by_key[key]
        return {"key": key, "label": str(m.get("label") or sig["label"])[:48], "unit": sig["unit"]}
    expr = parse_expr(str(m.get("expr") or ""), set(by_key))
    if not expr:
        return None
    return {"expr": expr, "label": str(m.get("label") or "Derived")[:48], "unit": str(m.get("unit") or "")[:10]}


def _widget(w, by_key: dict[str, dict]) -> dict | None:
    if not isinstance(w, dict):
        return None
    kind = str(w.get("type", "")).strip()
    if kind not in KINDS:
        return None
    lo, hi = KINDS[kind]
    metrics = []
    for m in w.get("metrics") or []:
        clean = _metric(m, by_key)
        if clean and clean not in metrics:
            metrics.append(clean)
    metrics = metrics[:hi]
    # A data widget without enough real metrics has nothing honest to draw — drop it, never repair it.
    if len(metrics) < lo:
        return None
    out = {"type": kind, "title": str(w.get("title") or (metrics[0]["label"] if metrics else kind.title()))[:60]}
    if metrics:
        out["metrics"] = metrics
    if kind == "line":
        window = str(w.get("window") or "live")
        out["window"] = window if window in WINDOWS else "live"
    if kind in TARGETED and isinstance(w.get("target"), dict):
        t = w["target"]
        if str(t.get("key") or "") in by_key:
            out["target"] = {"key": str(t["key"])}
        elif _number(t.get("value")) is not None:
            out["target"] = {"value": _number(t["value"])}
        band = _number(w.get("band"))
        if "target" in out and band is not None and band > 0:
            out["band"] = band
    if kind in SCALED:
        for bound in ("min", "max"):
            if _number(w.get(bound)) is not None:
                out[bound] = _number(w[bound])
        if "min" in out and "max" in out and out["min"] >= out["max"]:
            out.pop("min"), out.pop("max")
    if w.get("size") in SIZES:
        out["size"] = w["size"]
    return out


def validate_plan(raw: dict, signals: list[dict], current_ids: set[str] | None = None) -> dict:
    """Pure: keeps known kinds, real tags and well-formed expressions; ops may
    only touch widgets that exist. Tested."""
    if not isinstance(raw, dict):
        raise DiagnosticError("bad_model_output")
    current_ids = current_ids or set()
    by_key = {s["key"]: s for s in signals}

    remove = [i for i in dict.fromkeys(str(x) for x in (raw.get("remove") or [])) if i in current_ids]
    update = []
    for w in raw.get("update") or []:
        wid = str(w.get("id", "")) if isinstance(w, dict) else ""
        clean = _widget(w, by_key)
        if clean and wid in current_ids and wid not in remove and all(u["id"] != wid for u in update):
            update.append({"id": wid, **clean})
    room = MAX_WIDGETS - (len(current_ids) - len(remove))
    add = [c for c in (_widget(w, by_key) for w in raw.get("add") or []) if c][: max(0, room)]

    plan = {"message": str(raw.get("message") or "")[:400], "add": add, "update": update, "remove": remove}
    if raw.get("title"):
        plan["title"] = str(raw["title"])[:60]
    return plan
