"""Seed N hours of dummy history through the real ingest API. Past timestamps only.

Usage: PACE_API=.. EDGE_ID=.. EDGE_SECRET=.. python -m collector.seed_history [hours]
Gives charts, rollups, and the copilot something to chew on without waiting.
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

import httpx

STEP_S = 5
BATCH = 200


async def amain(hours: float) -> None:
    from collector.dummy import make_sampler
    from collector.edge_collector import load_manifest

    manifest = load_manifest(os.environ.get("TAGS_MANIFEST", "config/tags.yaml"))
    fixtures = os.environ.get("FIXTURES_DIR", os.path.join(os.path.dirname(__file__), "fixtures"))
    api, edge_id, secret = os.environ["PACE_API"], os.environ["EDGE_ID"], os.environ["EDGE_SECRET"]

    now = datetime.now(timezone.utc).timestamp()
    vt = [now - hours * 3600]
    sampler = make_sampler(manifest, fixtures,
                           fault=os.environ.get("MOCK_FAULT", ""), clock=lambda: vt[0])
    boot_id = str(uuid.uuid4())
    machines = [m["machine_key"] for m in manifest["machines"]]
    n = int(hours * 3600 / STEP_S)

    def _post(http, mk, samples):
        r = http.post(f"{api}/api/v1/collector/ingest",
                      json={"edge_id": edge_id, "boot_id": boot_id, "machine_key": mk,
                            "schema_version": "orion-v1", "samples": samples, "events": []},
                      headers={"X-Edge-Id": edge_id, "X-Edge-Secret": secret})
        r.raise_for_status()

    total = 0
    seq = 0  # global across machines: PK is (edge_id, boot_id, sequence)
    with httpx.Client(timeout=30) as http:
        batches: dict = {mk: [] for mk in machines}
        for _ in range(n):
            vt[0] += STEP_S
            snap = await sampler()
            ts = datetime.fromtimestamp(vt[0], timezone.utc).isoformat()
            for mk in machines:
                values, quality = snap[mk]
                batches[mk].append({"sequence": seq, "source_ts": ts, "edge_ts": ts,
                                    "values": values, "quality": quality})
                seq += 1
                if len(batches[mk]) >= BATCH:
                    await asyncio.to_thread(_post, http, mk, batches[mk])
                    total += len(batches[mk])
                    batches[mk] = []
            print(f"\rseeded {total} samples", end="", flush=True)
        for mk in machines:
            if batches[mk]:
                await asyncio.to_thread(_post, http, mk, batches[mk])
                total += len(batches[mk])
        print(f"\rdone: {total} samples over {hours}h")


if __name__ == "__main__":
    asyncio.run(amain(float(sys.argv[1]) if len(sys.argv) > 1 else 4.0))
