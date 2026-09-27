"""Heater zone tolerance, judged against the band the operator set on the HMI.

The PLC's own ``ZoneInTol`` flag is only evaluated while the zone error check
is active; with ``ZoneErrorCheckBypass`` on it stays False even at setpoint.
So in-tolerance is derived here from the HMI's own band (``STpTol`` above,
``STmTol`` below setpoint). The band is read-only to this app: it is changed
on the HMI, never from here. Default ±10 °C when the band is not readable.
"""

ZONES = ("hor_front", "hor_rear", "vert1", "vert2")
DEFAULT_TOL = 10.0


def apply_tolerance(values: dict, quality: dict | None = None) -> None:
    for z in ZONES:
        temp, set_ = values.get(f"{z}_temp"), values.get(f"{z}_set")
        plus = values.setdefault(f"{z}_tol_plus", DEFAULT_TOL)
        minus = values.setdefault(f"{z}_tol_minus", DEFAULT_TOL)
        if temp is None or set_ is None:
            continue
        values[f"{z}_tol"] = 1.0 if set_ - abs(minus) <= temp <= set_ + abs(plus) else 0.0
        if quality is not None:
            quality[f"{z}_tol"] = "good"
            quality.setdefault(f"{z}_tol_plus", "good")
            quality.setdefault(f"{z}_tol_minus", "good")
