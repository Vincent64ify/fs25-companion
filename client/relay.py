"""WebSocket relay: sends parsed telemetry frames to the backend."""

import asyncio
import json
import logging

import websockets

from protocol import endpoint_url

log = logging.getLogger("companion.relay")


class WebSocketRelay:
    """Forwards the latest telemetry frame to the relay backend.

    :param backend: relay WebSocket URL, e.g. ``ws://127.0.0.1:8123``
    :param pairing: pairing code shared with the browser dashboard
    :param state: dict with ``frame`` (latest parsed dict) and ``dirty``
                  (bool), updated by the pipe reader
    :param interval: seconds between telemetry sends
    """

    def __init__(self, backend: str, pairing: str, state: dict, interval: float):
        self.backend = backend
        self.pairing = pairing
        self.state = state
        self.interval = interval

    def run_forever(self) -> None:
        asyncio.run(self._run())

    async def _run(self) -> None:
        backoff = 1.0
        while True:
            try:
                async with websockets.connect(
                        endpoint_url(self.backend, self.pairing), open_timeout=10) as ws:
                    await ws.send(json.dumps({
                        "type": "hello",
                        "role": "client",
                        "pairing": self.pairing,
                        "client": "fs25-companion/0.1",
                    }))
                    log.info("connected to %s (pairing %s)", self.backend, self.pairing)
                    backoff = 1.0
                    while True:
                        await asyncio.sleep(self.interval)
                        if self.state.get("dirty"):
                            self.state["dirty"] = False
                            frame = self.state.get("frame")
                            if frame is not None:
                                await ws.send(json.dumps(
                                    {"type": "telemetry", "data": frame}))
            except (OSError, websockets.WebSocketException) as e:
                log.warning("relay error: %s — retrying in %.0f s", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
