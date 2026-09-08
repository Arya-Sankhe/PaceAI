"""Compat shim: `python -m collector.mock_edge` == SOURCE=dummy edge_collector.

Kept so existing commands/docs keep working. New code: use edge_collector directly.
"""

import os

os.environ.setdefault("SOURCE", "dummy")

from collector.edge_collector import amain  # noqa: E402

import asyncio  # noqa: E402

if __name__ == "__main__":
    asyncio.run(amain())
