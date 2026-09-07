"""Dev collector without a PLC. Reuses edge_collector's outbox + flush loop.

Usage: EDGE_ID=.. EDGE_SECRET=.. PACE_API=http://localhost:8000 python -m collector.mock_edge
Fault drill: set MOCK_FAULT=hor_front_temp to pin the front heater cold.
"""

import asyncio
import logging
import math
import os
import random
import time

from collector.edge_collector import Outbox, load_manifest, run_loop

log = logging.getLogger("mock")


def make_sampler():
    t0 = time.time()
    fault = os.environ.get("MOCK_FAULT", "")

    async def read_once():
        t = time.time() - t0
        wobble = lambda base, amp, period: base + amp * math.sin(t / period)  # noqa: E731
        values = {
            "hor_front_temp": 90.0 if fault == "hor_front_temp" else wobble(164, 2, 47),
            "hor_front_set": 165.0,
            "hor_front_out": 100.0 if fault == "hor_front_temp" else wobble(38, 6, 47),
            "hor_front_intol": fault != "hor_front_temp",
            "hor_rear_temp": wobble(165, 1.5, 53),
            "hor_rear_set": 165.0,
            "hor_rear_out": wobble(35, 5, 53),
            "hor_rear_intol": True,
            "ver1_temp": wobble(150, 1.2, 61),
            "ver1_set": 150.0,
            "ver1_out": wobble(30, 4, 61),
            "ver1_intol": True,
            "ver2_temp": wobble(150, 1.4, 59),
            "ver2_set": 150.0,
            "ver2_out": wobble(31, 4, 59),
            "ver2_intol": True,
            "bx_vel": 1200.0, "bx_cur": wobble(4.1, 0.3, 9), "bx_err": 0,
            "cs_vel": 1180.0, "cs_cur": wobble(5.2, 0.4, 11), "cs_err": 0,
            "ff_vel": 850.0, "ff_cur": wobble(3.3, 0.3, 13), "ff_err": 0,
            "pk_vel": 600.0, "pk_cur": wobble(2.1, 0.2, 17), "pk_err": 0,
            "uw_vel": 400.0, "uw_cur": wobble(1.6, 0.2, 19), "uw_err": 0,
            "vs_vel": 900.0, "vs_cur": wobble(3.8, 0.3, 15), "vs_err": 0,
            "count_good": 1000 + int(t / 3), "count_bad": int(t / 120),
            "running": True, "alarm_cnt": 1 if fault else 0,
            "fault_code": 32014 if fault else 0,
        }
        noisy = {}
        for k, v in values.items():
            if isinstance(v, bool):
                noisy[k] = float(v)
            elif isinstance(v, float):
                noisy[k] = v + random.uniform(-0.05, 0.05)
            else:
                noisy[k] = v
        quality = {k: "good" for k in values}
        # ponytail: machine 2 runs 3°C hotter — identical twins hide per-machine bugs
        m2 = {k: (v + 3.0 if "temp" in k and isinstance(v, float) else v)
              for k, v in noisy.items()}
        return {"orion_1": (noisy, quality), "orion_2": (m2, quality)}

    return read_once


async def amain() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    manifest = load_manifest(os.environ.get("TAGS_MANIFEST", "config/tags.yaml"))
    await run_loop(
        manifest,
        os.environ["PACE_API"], os.environ["EDGE_ID"], os.environ["EDGE_SECRET"],
        Outbox(os.environ.get("OUTBOX_PATH", "mock_outbox.db")), make_sampler(),
    )


if __name__ == "__main__":
    asyncio.run(amain())
