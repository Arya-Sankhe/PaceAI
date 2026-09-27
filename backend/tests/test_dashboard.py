"""Dashboard planner checks. Pure functions only — no DB, no Gemini, no network."""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.copilot.dashboard import catalog, parse_expr, validate_plan  # noqa: E402

SIGNALS = catalog([
    {"key": "hor_front_temp", "unit": "°C", "type": "Float"},
    {"key": "hor_front_set", "unit": "°C", "type": "Float"},
    {"key": "hor_front_output", "unit": "%", "type": "Float", "range": [0, 100]},
    {"key": "bx_rpm", "unit": "rpm", "type": "Float"},
    {"key": "bx_error_active", "type": "Bool"},
    {"key": "count_good", "unit": "bags", "type": "UDInt"},
    {"key": "count_bad", "unit": "bags", "type": "UDInt"},
    {"key": "pdt_0", "type": "UDInt"},
], {"planned_dt": ["Changeover"]})
TAGS = {s["key"] for s in SIGNALS}


def test_catalog_speaks_operator_language():
    by = {s["key"]: s for s in SIGNALS}
    assert by["hor_front_temp"]["label"] == "Horizontal front temperature"
    assert by["hor_front_temp"]["group"] == "Heaters"
    assert by["bx_error_active"] == {"key": "bx_error_active", "label": "Box forming error active",
                                     "group": "Drives", "unit": "", "kind": "bool"}
    assert by["hor_front_output"]["range"] == [0, 100]
    assert by["pdt_0"]["label"] == "Planned downtime: Changeover"
    assert by["count_good"]["group"] == "Production"


def test_expressions_parse_only_arithmetic_over_known_tags():
    assert parse_expr("count_bad / (count_good + count_bad) * 100", TAGS) == "count_bad / ( count_good + count_bad ) * 100"
    assert parse_expr("abs(hor_front_temp - hor_front_set)", TAGS)
    assert parse_expr("max(bx_rpm, 0.5, -count_good)", TAGS)
    for bad in ("", "42", "nope + 1", "count_good +", "(count_good", "count_good; drop",
                "__import__('os')", "count_good ** 2", "pow(count_good, 2)", "count_good count_bad",
                "x" * 300):
        assert parse_expr(bad, TAGS) is None, bad


def test_plan_keeps_valid_widgets_and_fills_labels_and_units():
    plan = validate_plan({
        "title": "Heater watch",
        "message": "Added the front heater.",
        "add": [
            {"type": "line", "title": "Front heater", "window": "8h",
             "metrics": [{"key": "hor_front_temp", "label": "Front"}, {"key": "hor_front_temp"}],
             "target": {"key": "hor_front_set"}, "band": 3},
            {"type": "stat", "metrics": [{"expr": "count_bad / (count_good + count_bad) * 100", "label": "Reject rate", "unit": "%"}]},
            {"type": "heaters", "title": "Zones", "metrics": [{"key": "bx_rpm"}]},
        ],
    }, SIGNALS)
    line, stat, zones = plan["add"]
    assert plan["title"] == "Heater watch" and plan["message"] == "Added the front heater."
    assert line == {
        "type": "line", "title": "Front heater", "window": "8h",
        "metrics": [{"key": "hor_front_temp", "label": "Front", "unit": "°C"},
                    {"key": "hor_front_temp", "label": "Horizontal front temperature", "unit": "°C"}],
        "target": {"key": "hor_front_set"}, "band": 3.0,
    }
    assert stat["metrics"][0]["unit"] == "%" and stat["title"] == "Reject rate"
    assert zones == {"type": "heaters", "title": "Zones"}


def test_plan_drops_unknown_kinds_tags_and_underfilled_widgets():
    plan = validate_plan({"add": [
        {"type": "drop table", "metrics": [{"key": "bx_rpm"}]},
        {"type": "line", "metrics": [{"key": "fabricated_tag"}]},
        {"type": "bars", "metrics": [{"key": "bx_rpm"}]},
        {"type": "gauge", "metrics": [{"key": "bx_rpm"}, {"key": "count_good"}], "min": 10, "max": 5, "window": "8h"},
        {"type": "line", "metrics": [{"key": "bx_rpm"}], "window": "99y", "size": "huge"},
    ]}, SIGNALS)
    gauge, line = plan["add"]
    assert gauge == {"type": "gauge", "title": "Box forming speed", "metrics": [{"key": "bx_rpm", "label": "Box forming speed", "unit": "rpm"}]}
    assert line["window"] == "live" and "size" not in line


def test_plan_ops_only_touch_existing_widgets_and_respect_the_cap():
    plan = validate_plan({
        "update": [{"id": "a", "type": "stat", "metrics": [{"key": "bx_rpm"}]},
                   {"id": "ghost", "type": "stat", "metrics": [{"key": "bx_rpm"}]}],
        "remove": ["b", "b", "ghost"],
        "add": [{"type": "events"}] * 40,
    }, SIGNALS, {"a", "b"})
    assert [u["id"] for u in plan["update"]] == ["a"]
    assert plan["remove"] == ["b"]
    assert len(plan["add"]) == 15
    assert "title" not in plan


if __name__ == "__main__":
    test_catalog_speaks_operator_language()
    test_expressions_parse_only_arithmetic_over_known_tags()
    test_plan_keeps_valid_widgets_and_fills_labels_and_units()
    test_plan_drops_unknown_kinds_tags_and_underfilled_widgets()
    test_plan_ops_only_touch_existing_widgets_and_respect_the_cap()
    print("Dashboard assertions passed.")
