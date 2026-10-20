"""Forward envelopes to the backend over a WebSocket.

Every topic is "latest wins", so the outbox keeps at most one pending
envelope per topic. When the client reads a backlog (it started after the
game) or the network is slow, intermediate values are skipped instead of
queued. ``hello`` always goes first, and after a reconnect the latest
envelope of every topic is sent again, since the backend may have restarted.
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

import websockets

log = logging.getLogger("companion.relay")

CLIENT_NAME = "fs25-companion-client/0.2"

Envelope = Dict[str, Any]


def endpoint_url(backend: str, pairing: str) -> str:
    """<backend>/ws?pair=<code>. A URL that already has /ws only gets the
    pairing parameter added when it's missing."""
    base = backend.rstrip("/")
    if "/ws" in base:
        if "pair=" in base:
            return base
        return base + ("&" if "?" in base else "?") + f"pair={pairing}"
    return f"{base}/ws?pair={pairing}"


class Outbox:
    def __init__(self) -> None:
        self._pending: Dict[str, Envelope] = {}
        self._latest: Dict[str, Envelope] = {}
        self._session: Optional[str] = None
        self._ready = asyncio.Event()

    def put(self, envelope: Envelope) -> None:
        topic = envelope["topic"]
        if topic == "hello":
            session = envelope["data"].get("sessionId")
            if session != self._session:
                # a new game session: nothing from the old one is worth sending
                self._session = session
                self._pending.clear()
                self._latest.clear()
            self._pending = {"hello": envelope,
                             **{k: v for k, v in self._pending.items() if k != "hello"}}
        else:
            self._pending[topic] = envelope
        self._latest[topic] = envelope
        self._ready.set()

    def resend_latest(self) -> None:
        for envelope in sorted(self._latest.values(), key=lambda e: e["topic"] != "hello"):
            self.put(envelope)

    async def take(self) -> List[Envelope]:
        await self._ready.wait()
        self._ready.clear()
        batch = list(self._pending.values())
        self._pending.clear()
        return batch


class WebSocketRelay:
    def __init__(self, backend: str, pairing: str, outbox: Outbox):
        self.url = endpoint_url(backend, pairing)
        self.pairing = pairing
        self.outbox = outbox
        self.sent = 0

    async def run(self) -> None:
        backoff = 1.0
        while True:
            try:
                async with websockets.connect(self.url, open_timeout=10) as ws:
                    await ws.send(json.dumps({
                        "type": "hello", "role": "client", "client": CLIENT_NAME,
                    }))
                    log.info("connected to %s", self.url)
                    backoff = 1.0
                    self.outbox.resend_latest()
                    while True:
                        for envelope in await self.outbox.take():
                            await ws.send(json.dumps(
                                {"type": "envelope", "envelope": envelope},
                                separators=(",", ":")))
                            self.sent += 1
            except (OSError, asyncio.TimeoutError, websockets.WebSocketException) as e:
                log.warning("backend unreachable (%s), retrying in %.0f s", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
