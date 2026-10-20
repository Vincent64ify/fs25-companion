"""WebSocket endpoint: /ws?pair=<CODE>.

The first message names the role.

    client -> backend:  {"type": "hello", "role": "client", "client": "..."}
    client -> backend:  {"type": "envelope", "envelope": {v, seq, t, topic, data}}
    viewer -> backend:  {"type": "hello", "role": "viewer"}

    backend -> viewer:  {"type": "snapshot", "topics": {topic: envelope}}
                        sent on connect, and again when a new game session
                        starts (it replaces everything the viewer holds)
    backend -> viewer:  {"type": "update", "envelope": {...}}
    backend -> viewer:  {"type": "client_status", "connected": bool}
    backend -> viewer:  {"type": "protocol_error", "message": str}
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from .protocol import ProtocolVersionError, ValidationError, parse_envelope
from .sessions import Session, SessionRegistry, safe_send

log = logging.getLogger("companion.ws")

HELLO_TIMEOUT_S = 10


def create_router(registry: SessionRegistry) -> APIRouter:
    router = APIRouter()

    @router.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket, pair: str = ""):
        code = pair.strip().upper()
        if not code:
            await websocket.close(code=4000)
            return
        await websocket.accept()
        try:
            hello = json.loads(await asyncio.wait_for(
                websocket.receive_text(), timeout=HELLO_TIMEOUT_S))
        except Exception:
            await websocket.close(code=4001)
            return

        session = registry.get_or_create(code)
        try:
            if isinstance(hello, dict) and hello.get("role") == "client":
                await handle_client(websocket, session)
            else:
                await handle_viewer(websocket, session)
        finally:
            registry.drop_if_empty(session)

    return router


async def handle_client(ws: WebSocket, session: Session) -> None:
    async with session.lock:
        old = session.client
        session.client = ws
    if old is not None and old is not ws:
        await safe_send(old, {"type": "replaced"})
        try:
            await old.close()
        except Exception:
            pass
    await session.broadcast({"type": "client_status", "connected": True})
    log.info("client connected to %s (%d viewers)", session.code, len(session.viewers))
    invalid = 0
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict) or msg.get("type") != "envelope":
                continue
            try:
                envelope = parse_envelope(msg.get("envelope"))
            except ProtocolVersionError as e:
                if session.protocol_error != str(e):
                    session.protocol_error = str(e)
                    log.warning("%s: %s", session.code, e)
                    await session.broadcast({"type": "protocol_error", "message": str(e)})
                continue
            except ValidationError as e:
                invalid += 1
                if invalid == 1 or invalid % 100 == 0:
                    log.warning("%s: dropped %d invalid envelope(s), latest: %s",
                                session.code, invalid, e.errors()[:1])
                continue
            session.protocol_error = None
            if session.store.apply(envelope):
                await session.broadcast(session.snapshot_message())
            else:
                await session.broadcast({"type": "update", "envelope": envelope})
    except WebSocketDisconnect:
        pass
    finally:
        async with session.lock:
            if session.client is ws:
                session.client = None
                still_connected = False
            else:
                still_connected = session.client is not None
        if not still_connected:
            await session.broadcast({"type": "client_status", "connected": False})
        log.info("client disconnected from %s", session.code)


async def handle_viewer(ws: WebSocket, session: Session) -> None:
    async with session.lock:
        session.viewers.add(ws)
    await safe_send(ws, session.snapshot_message())
    await safe_send(ws, {"type": "client_status", "connected": session.client is not None})
    if session.protocol_error:
        await safe_send(ws, {"type": "protocol_error", "message": session.protocol_error})
    log.info("viewer connected to %s", session.code)
    try:
        while True:
            # viewers are read-only; ignore anything they send
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        async with session.lock:
            session.viewers.discard(ws)
