"""Outbound-only edge collector. Reads OPC UA, buffers in SQLite, POSTs batches.

Read-only by construction: only read_values() exists here — no write/method call.
The VPS never dials in; all traffic is collector-initiated HTTPS.
"""

import asyncio
import json
import logging
import os
import random
import sqlite3
import time
import uuid
from datetime import datetime, timezone

import httpx
import yaml

log = logging.getLogger("edge")

SNAPSHOT_S = 1.0
FLUSH_S = 5.0
FLUSH_MAX = 100
OUTBOX_LIMIT_ROWS = 200_000  # ~7 days at 1 snapshot/s/machine; oldest routine rows drop first


def load_manifest(path: str) -> dict:
    with open(path) as f:
        m = yaml.safe_load(f)
    if m.get("manifest_version") not in (m.get("supported_by_collector") or []):
        raise SystemExit(f"refusing unknown manifest version: {m.get('manifest_version')}")
    nodes = [t["node"] for t in m["tags"]]
    if len(set(nodes)) != len(nodes):
        raise SystemExit("duplicate node mapping in manifest")
    if any("PLC-ADDRESS-HERE" in n for n in nodes):
        raise SystemExit("manifest still has placeholder nodes — commission first")
    return m


class Outbox:
    """SQLite WAL outbox. Rows keep their original boot/seq — replays dedupe server-side."""

    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS outbox (
                 id INTEGER PRIMARY KEY AUTOINCREMENT, boot_id TEXT NOT NULL,
                 seq INTEGER NOT NULL, machine_key TEXT NOT NULL,
                 source_ts TEXT NOT NULL, edge_ts TEXT NOT NULL,
                 values_json TEXT NOT NULL, quality_json TEXT NOT NULL,
                 events_json TEXT NOT NULL DEFAULT '[]')"""
        )
        self.db.commit()

    def append(self, boot_id, seq, machine_key, source_ts, edge_ts, values, quality, events=()):
        self.db.execute(
            "INSERT INTO outbox (boot_id,seq,machine_key,source_ts,edge_ts,values_json,quality_json,events_json)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (boot_id, seq, machine_key, source_ts, edge_ts,
             json.dumps(values), json.dumps(quality), json.dumps(list(events))),
        )
        # ponytail: full-table guard — transitions are rare, routine snapshots are expendable
        n = self.db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
        if n > OUTBOX_LIMIT_ROWS:
            self.db.execute(
                "DELETE FROM outbox WHERE id IN (SELECT id FROM outbox ORDER BY id LIMIT ?)",
                (n - OUTBOX_LIMIT_ROWS,),
            )
            log.warning("outbox_full: dropped oldest snapshots, gap will show in cloud")
        self.db.commit()

    def batch(self, n: int) -> list[sqlite3.Row]:
        self.db.row_factory = sqlite3.Row
        return self.db.execute("SELECT * FROM outbox ORDER BY id LIMIT ?", (n,)).fetchall()

    def ack(self, ids: list[int]) -> None:
        self.db.execute(f"DELETE FROM outbox WHERE id IN ({','.join('?' * len(ids))})", ids)
        self.db.commit()

    def depth(self) -> int:
        return self.db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]


async def post_batch(api: str, edge_id: str, secret: str, machine_key: str,
                     boot_id: str, rows: list) -> bool:
    samples = [{
        "sequence": r["seq"], "source_ts": r["source_ts"], "edge_ts": r["edge_ts"],
        "values": json.loads(r["values_json"]), "quality": json.loads(r["quality_json"]),
    } for r in rows]
    events = [e for r in rows for e in json.loads(r["events_json"])]
    body = {"edge_id": edge_id, "boot_id": boot_id, "machine_key": machine_key,
            "schema_version": "orion-v1", "samples": samples, "events": events}
    delay = 1.0
    for _ in range(6):
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.post(f"{api}/api/v1/collector/ingest", json=body,
                                    headers={"X-Edge-Id": edge_id, "X-Edge-Secret": secret})
            if r.status_code == 200:
                return True
            log.warning("ingest http=%s body=%s", r.status_code, r.text[:200])
        except Exception as e:  # noqa: BLE001 — link down, keep buffering
            log.warning("ingest link down: %s", e)
        await asyncio.sleep(delay + random.uniform(0, delay * 0.5))
        delay = min(delay * 2, 30.0)
    return False


def _opc_client(url: str):
    """Encrypted read-only session. Plaintext only behind an explicit dev flag."""
    from asyncua import Client
    from asyncua.crypto import security_policies as sec

    cert, key = os.environ.get("EDGE_CERT"), os.environ.get("EDGE_KEY")
    client = Client(url)
    if cert and key:
        client.set_security(sec.SecurityPolicyBasic256Sha256,
                            certificate_path=cert, private_key_path=key)
    elif os.environ.get("PACE_ALLOW_INSECURE") != "1":
        raise SystemExit("refusing plaintext OPC UA — set EDGE_CERT/EDGE_KEY or PACE_ALLOW_INSECURE=1 for bench only")
    else:
        log.warning("INSECURE opcua: bench mode only, never on plant")
    return client


async def read_snapshot(client, nodes: dict) -> tuple[dict, dict]:
    """Single batched read. Returns (values, quality). Read-only: read_values only."""
    from asyncua import ua

    keys = list(nodes)
    try:
        data = await client.read_values([nodes[k] for k in keys])
    except Exception as e:  # noqa: BLE001 — PLC hiccup, next tick retries
        log.warning("opc read failed: %s", e)
        return {}, {}
    values, quality = {}, {}
    for k, dv in zip(keys, data):
        v = dv.Value.Value if isinstance(dv, ua.DataValue) else dv
        if isinstance(v, bool):  # running/intol flags ride as 1.0/0.0 (server values are float)
            values[k], quality[k] = float(v), "good"
        else:
            try:
                values[k], quality[k] = float(v), "good"
            except (TypeError, ValueError):
                quality[k] = "bad"
    return values, quality


async def run_loop(manifest, api: str, edge_id: str, secret: str, outbox: Outbox,
                   read_once) -> None:
    """Shared poll → outbox → flush loop. read_once() returns {machine_key: (values, quality)}."""
    boot_id = str(uuid.uuid4())
    seq = 0
    last_flush = time.time()
    prev_event_vals: dict = {}
    event_tags = {t["key"] for t in manifest["tags"] if t.get("class") == "event"}
    machines = [m["machine_key"] for m in manifest["machines"]]

    while True:
        tick = time.time()
        now = datetime.now(timezone.utc).isoformat()
        for mk, (values, quality) in (await read_once()).items():
            events = []
            prev = prev_event_vals.setdefault(mk, {})
            for k in event_tags:
                if k in values and prev.get(k) != values[k]:
                    events.append({"ts": now, "kind": "state_change",
                                   "severity": "warn" if values[k] else "info",
                                   "data": {"key": k, "value": values[k]}})
            prev.update({k: values[k] for k in event_tags if k in values})
            if values:
                outbox.append(boot_id, seq, mk, now, now, values, quality, events)
                seq += 1
        if outbox.depth() >= FLUSH_MAX or tick - last_flush >= FLUSH_S:
            for mk in machines:
                rows = [r for r in outbox.batch(FLUSH_MAX) if r["machine_key"] == mk]
                if rows and await post_batch(api, edge_id, secret, mk, boot_id, rows):
                    outbox.ack([r["id"] for r in rows])
            last_flush = tick
        await asyncio.sleep(max(0.0, SNAPSHOT_S - (time.time() - tick)))


async def amain() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    manifest = load_manifest(os.environ.get("TAGS_MANIFEST", "config/tags.yaml"))
    api = os.environ["PACE_API"]; edge_id = os.environ["EDGE_ID"]; secret = os.environ["EDGE_SECRET"]
    outbox = Outbox(os.environ.get("OUTBOX_PATH", "outbox.db"))
    plc_urls = {m["machine_key"]: os.environ[f"PLC_URL_{m['machine_key'].upper()}"]
                for m in manifest["machines"]}

    clients = {}
    for mk, url in plc_urls.items():
        client = _opc_client(url)
        await client.connect()
        nodes = {t["key"]: client.get_node(f"ns=6;s={t['node']}")
                 for t in manifest["tags"]}
        clients[mk] = (client, nodes)
    log.info("connected: %s (outbox depth %d)", list(clients), outbox.depth())

    async def read_once():
        return {mk: await read_snapshot(client, nodes) for mk, (client, nodes) in clients.items()}

    try:
        await run_loop(manifest, api, edge_id, secret, outbox, read_once)
    finally:
        for client, _ in clients.values():
            try:
                await client.disconnect()
            except Exception:  # noqa: BLE001 — shutting down anyway
                pass


if __name__ == "__main__":
    asyncio.run(amain())
