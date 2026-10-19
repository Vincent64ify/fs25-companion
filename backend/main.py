"""FS25 Companion relay backend.

A tiny WebSocket relay: the local game client connects with a pairing code,
browsers connect with the same code, and telemetry is forwarded
client -> viewers. No accounts, no storage — sessions live in memory only.

Protocol (JSON over WebSocket at /ws?pair=<CODE>):

  client -> relay:  {"type": "hello", "role": "client", "pairing": CODE}
  client -> relay:  {"type": "telemetry", "data": {...}}
  viewer -> relay:  {"type": "hello", "role": "viewer"}
  relay  -> viewer: {"type": "telemetry", "data": {...}}
  relay  -> viewer: {"type": "client_status", "connected": bool}

The bundled dashboard (../web) is served from this same process, so the
viewer URL is simply http://<host>:8123/?pair=<CODE> — no separate
static server and no ?backend= parameter needed (app.js already
defaults the relay URL to the page's own origin).
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("relay")

app = FastAPI(title="FS25 Companion Relay")


class Session:
    """One pairing code: at most one game client, any number of viewers."""

    def __init__(self, code: str):
        self.code = code
        self.client: Optional[WebSocket] = None
        self.viewers: set = set()
        self.last_telemetry: Optional[dict] = None
        self.lock = asyncio.Lock()


sessions: Dict[str, Session] = {}


async def safe_send(ws: WebSocket, msg) -> None:
    try:
        await ws.send_text(msg if isinstance(msg, str) else json.dumps(msg))
    except Exception:
        pass


async def broadcast(session: Session, msg: dict) -> None:
    payload = json.dumps(msg)
    async with session.lock:
        targets = list(session.viewers)
    for viewer in targets:
        await safe_send(viewer, payload)


def maybe_drop_empty(session: Session) -> None:
    if session.client is None and not session.viewers:
        sessions.pop(session.code, None)


@app.get("/api/info")
async def api_info():
    return {
        "name": "fs25-companion relay",
        "version": "0.1.0",
        "active_sessions": len(sessions),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, pair: str = ""):
    code = pair.strip().upper()
    if not code:
        await websocket.close(code=4000)
        return

    await websocket.accept()
    session = sessions.setdefault(code, Session(code))

    # First message must be a hello carrying the role
    try:
        hello = json.loads(
            await asyncio.wait_for(websocket.receive_text(), timeout=10))
    except Exception:
        await websocket.close(code=4001)
        return

    if hello.get("role") == "client":
        await handle_client(websocket, session)
    else:
        await handle_viewer(websocket, session)


async def handle_client(ws: WebSocket, session: Session) -> None:
    async with session.lock:
        old = session.client
        session.client = ws
    if old is not None and old is not ws:
        await safe_send(old, {"type": "replaced"})
        await old.close()
    await broadcast(session, {"type": "client_status", "connected": True})
    log.info("client connected to %s (%d viewers)",
             session.code, len(session.viewers))
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "telemetry" and isinstance(msg.get("data"), dict):
                session.last_telemetry = msg["data"]
                await broadcast(session, msg)
    except WebSocketDisconnect:
        pass
    finally:
        async with session.lock:
            if session.client is ws:
                session.client = None
        await broadcast(session, {"type": "client_status", "connected": False})
        log.info("client disconnected from %s", session.code)
        maybe_drop_empty(session)


async def handle_viewer(ws: WebSocket, session: Session) -> None:
    async with session.lock:
        session.viewers.add(ws)
    # send the latest frame immediately so the dashboard populates at once
    if session.last_telemetry is not None:
        await safe_send(ws, {"type": "telemetry", "data": session.last_telemetry})
    await safe_send(ws, {"type": "client_status",
                         "connected": session.client is not None})
    log.info("viewer connected to %s", session.code)
    try:
        while True:
            # viewers are read-only for now; ignore anything they send
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        async with session.lock:
            session.viewers.discard(ws)
        maybe_drop_empty(session)


# --- static dashboard ---------------------------------------------------
# Mounted LAST (after all API routes) so /, /ws and /api/info are matched
# first; anything else falls through to the web directory. html=True makes
# "/" serve index.html. Since app.js defaults the relay WS URL to the
# page's own origin, the standalone http.server on :8000 is no longer
# needed and the dashboard has no ?backend= parameter.
WEB_DIR = Path(__file__).resolve().parent.parent / "web"
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8123)
