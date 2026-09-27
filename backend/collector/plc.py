"""Read-only OPC UA reader for one Orion PLC (B&R embedded server).

Emits the same (values, quality, info, titles) shape as ``dummy.make_sampler``
so the API cannot tell the two apart. Reads only the manifest allowlist; it
never writes a node.

Array tags (``Foo[3]``) are read as one whole array and indexed 0-based here:
B&R exposes element nodes 1-based, so reading ``Foo[0]`` directly fails.
``::TBD:`` tags have no node yet and are simply absent.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from asyncua import Client, ua

from collector.dummy import AXES, _join_error_text, _parse_hms
from collector.tolerance import apply_tolerance

_ARRAY = re.compile(r"^(.*)\[(\d+)\]$")
_TITLES = {
    "planned_dt": "ns=6;s=::DataHandle:iVa_OEEPDTSortedTitle",
    "unplanned_dt": "ns=6;s=::DataHandle:iVa_OEEUPDTSortedTitle",
}
_ERROR_TEXT = "ns=6;s=::AsGlobalPV:Axis_{}.Status.ErrorText"
_BUILD_INFO = ua.NodeId(ua.ObjectIds.Server_ServerStatus_BuildInfo)
_SERVER_TIME = ua.NodeId(ua.ObjectIds.Server_ServerStatus_CurrentTime)


def _plan(manifest: dict) -> tuple[list[str], list[tuple[str, int, int | None]]]:
    """Unique node ids to read, and (tag key, node index, array index) for each tag."""
    nodes: list[str] = []
    where: dict[str, int] = {}
    tags = []
    for t in manifest["tags"]:
        node = t["node"]
        if node.startswith("::TBD"):
            continue
        m = _ARRAY.match(node)
        base, idx = (m.group(1), int(m.group(2))) if m else (node, None)
        if base not in where:
            where[base] = len(nodes)
            nodes.append(base)
        tags.append((t["key"], where[base], idx))
    extra = list(_TITLES.values()) + [_ERROR_TEXT.format(ax.upper()) for ax in AXES]
    return nodes + extra, tags


def _num(v) -> float | None:
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and ":" in v:
        return _parse_hms(v)  # utilization arrives as "hh : mm : ss"
    return None


class PlcReader:
    """One persistent session per PLC. ``read()`` raises on any transport fault;
    the caller owns retry and backoff."""

    def __init__(self, endpoint: str, manifest: dict, identity: dict | None = None,
                 timeout: float = 4.0) -> None:
        self.endpoint = endpoint
        self._timeout = timeout
        self._client: Client | None = None
        self._nodes, self._tags = _plan(manifest)
        self._node_ids = [ua.NodeId.from_string(n) for n in self._nodes]
        self._identity = {k: str(v) for k, v in (identity or {}).items()}
        self._build: dict[str, str] = {}

    async def _connect(self) -> Client:
        if self._client is None:
            client = Client(self.endpoint, timeout=self._timeout)
            await client.connect()
            self._client = client
            try:
                b = await client.get_node(_BUILD_INFO).read_value()
                self._build = {"manufacturer": b.ManufacturerName or "", "software": b.SoftwareVersion or ""}
            except Exception:  # noqa: BLE001 — identity is cosmetic
                self._build = {}
        return self._client

    async def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            try:
                await client.disconnect()
            except Exception:  # noqa: BLE001 — the session is already gone
                pass

    async def read(self) -> tuple[dict, dict, dict, dict, datetime]:
        try:
            client = await self._connect()
            res = await client.uaclient.read_attributes(
                self._node_ids + [_SERVER_TIME], ua.AttributeIds.Value)
        except Exception:
            await self.close()
            raise
        raw = [r.Value.Value if r.StatusCode.is_good() else None for r in res]
        server_time = raw.pop() or datetime.now(timezone.utc)
        if server_time.tzinfo is None:
            server_time = server_time.replace(tzinfo=timezone.utc)

        values: dict[str, float] = {}
        quality: dict[str, str] = {}
        for key, i, idx in self._tags:
            v = raw[i]
            if idx is not None:
                v = v[idx] if isinstance(v, list) and idx < len(v) else None
            n = _num(v)
            if n is None:
                quality[key] = "bad"
            else:
                values[key] = n
                quality[key] = "good"
        apply_tolerance(values, quality)

        tail = raw[-(len(_TITLES) + len(AXES)):]
        titles = {k: [str(t).strip() for t in (tail[j] or [])] for j, k in enumerate(_TITLES)}
        info = {
            **self._identity,
            **{k: v for k, v in self._build.items() if v},
            "ip_address": urlparse(self.endpoint).hostname or "",
            "server_time": server_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "date_time": server_time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        for j, ax in enumerate(AXES):
            info[f"{ax}_error_text"] = _join_error_text(tail[len(_TITLES) + j])
        return values, quality, info, titles, server_time
