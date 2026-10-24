"""Forward envelopes to the backend over a WebSocket.

Every topic is "latest wins", so the outbox keeps at most one pending
envelope per topic. When the client reads a backlog (it started after the
game) or the network is slow, intermediate values are skipped instead of
queued. ``hello`` always goes first, and after a reconnect the latest
envelope of every topic is sent again, since the backend may have restarted.

Events (``command_ack``) are the exception: each one answers a command, so
they queue in order, go after the batch's state (the cab topic the mod
writes with an ack reaches the dashboard first) and are never re-sent.

The backend sends the dashboard's commands the other way
({"type": "command", "ref", "action"}); ``on_command`` handles them.
"""

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

import websockets

log = logging.getLogger("companion.relay")

CLIENT_NAME = "fs25-companion-client/0.2"

Envelope = Dict[str, Any]

EVENT_TOPICS = {"command_ack"}


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
        self._events: List[Envelope] = []
        self._latest: Dict[str, Envelope] = {}
        self._session: Optional[str] = None
        self._ready = asyncio.Event()

    def put(self, envelope: Envelope) -> None:
        topic = envelope["topic"]
        if topic in EVENT_TOPICS:
            self._events.append(envelope)
            self._ready.set()
            return
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
        batch = list(self._pending.values()) + self._events
        self._pending.clear()
        self._events = []
        return batch


class WebSocketRelay:
    """Sends the outbox to the backend. The backend answers the client's
    hello with a ``welcome`` carrying a token, which authorizes map asset
    uploads. ``on_connect`` (an async callable) runs after every connect;
    ``on_command(ref, action)`` for each command the backend forwards."""

    def __init__(self, backend: str, pairing: str, outbox: Outbox):
        self.backend = backend
        self.url = endpoint_url(backend, pairing)
        self.pairing = pairing
        self.outbox = outbox
        self.sent = 0
        self.token: Optional[str] = None
        self.on_connect: Optional[Callable[[], Awaitable[None]]] = None
        self.on_command: Optional[Callable[[str, str], None]] = None
        self._ws = None
        self._hooks: set = set()

    async def send_control(self, msg: Dict[str, Any]) -> None:
        """Send a non-envelope message now; dropped while disconnected (the
        sender repeats it from on_connect)."""
        ws = self._ws
        if ws is None:
            return
        try:
            await ws.send(json.dumps(msg))
        except websockets.WebSocketException:
            pass

    async def run(self) -> None:
        backoff = 1.0
        while True:
            try:
                async with websockets.connect(self.url, open_timeout=10) as ws:
                    await ws.send(json.dumps({
                        "type": "hello", "role": "client", "client": CLIENT_NAME,
                    }))
                    welcome = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                    self.token = welcome.get("token") if isinstance(welcome, dict) else None
                    log.info("connected to %s", self.url)
                    backoff = 1.0
                    self._ws = ws
                    self.outbox.resend_latest()
                    if self.on_connect is not None:
                        hook = asyncio.create_task(self.on_connect())
                        self._hooks.add(hook)
                        hook.add_done_callback(self._hooks.discard)
                    sender = asyncio.create_task(self._send_loop(ws))
                    receiver = asyncio.create_task(self._receive_loop(ws))
                    try:
                        done, _ = await asyncio.wait(
                            {sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
                        for task in done:
                            task.result()
                    finally:
                        for task in (sender, receiver):
                            task.cancel()
                        self._ws = None
                        self.token = None
            except (OSError, asyncio.TimeoutError, ValueError, websockets.WebSocketException) as e:
                log.warning("backend unreachable (%s), retrying in %.0f s", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _send_loop(self, ws) -> None:
        while True:
            for envelope in await self.outbox.take():
                await ws.send(json.dumps(
                    {"type": "envelope", "envelope": envelope}, separators=(",", ":")))
                self.sent += 1

    async def _receive_loop(self, ws) -> None:
        async for raw in ws:
            self.handle_message(raw)
        # closed cleanly by the backend: retry like any other disconnect
        raise OSError("connection closed")

    def handle_message(self, raw: Any) -> None:
        """A message from the backend: commands go to on_command."""
        try:
            msg = json.loads(raw)
        except ValueError:
            return
        if not isinstance(msg, dict) or msg.get("type") != "command":
            return
        ref, action = msg.get("ref"), msg.get("action")
        if isinstance(ref, str) and isinstance(action, str) and self.on_command is not None:
            self.on_command(ref, action)
