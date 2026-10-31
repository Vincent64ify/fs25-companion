"""WebSocket endpoint: /ws?pair=<CODE>.

The first message names the role.

    client -> backend:  {"type": "hello", "role": "client", "client": "..."}
    backend -> client:  {"type": "welcome", "token": str}
                        the token authorizes map asset uploads (assets.py)
    client -> backend:  {"type": "envelope", "envelope": {v, seq, t, topic, data}}
    client -> backend:  {"type": "map_assets", "mapId": str, "hash": str}
                        after uploading; relayed to viewers
    viewer -> backend:  {"type": "hello", "role": "viewer"}
    viewer -> backend:  {"type": "command", "id": str, "action": str, "value"?: number}
                        a tap on a control; the action must be in
                        protocol.COMMAND_ACTIONS ("lights.toggle"), and a
                        value only for an action in COMMAND_VALUES, in its
                        range ("cruise.set": km/h). Anything else a viewer
                        sends is ignored.
    backend -> client:  {"type": "command", "ref": str, "action": str, "value"?: number}
                        to the paired client only; ref is the backend's own
                        reference (viewers' ids may clash)
    client -> backend:  {"type": "envelope", "envelope": {topic: "command_ack",
                        data: {id, ref, ok, reason}}}
                        the mod's answer, sent to the viewer that asked

    backend -> viewer:  {"type": "snapshot", "topics": {topic: envelope}}
                        sent on connect, and again when a new game session
                        starts (it replaces everything the viewer holds)
    backend -> viewer:  {"type": "update", "envelope": {...}}
    backend -> viewer:  {"type": "map_assets", "mapId": str, "hash": str}
                        on connect too; the images are at
                        /api/maps/<mapId>/<hash>/overview.png
    backend -> viewer:  {"type": "client_status", "connected": bool}
    backend -> viewer:  {"type": "protocol_error", "message": str|null}
                        on connect while there is one; null once the
                        client's envelopes are good again
    backend -> viewer:  {"type": "command_ack", "id": str, "ok": bool,
                        "reason": str|null, "via"?: str, "checked"?: true,
                        "unmoved"?: [...]}
                        via: what ran, the key's input action or "setter";
                        checked: the mod waited for the tools to move;
                        unmoved: those that didn't, {id, name, why}
                        to the viewer that sent the command, with its own
                        id: from the mod, or straight from the backend when
                        the action isn't allowed or no game client is
                        connected. The new state follows as the cab topic.

Hosted relay and local mode run this same code.
"""

import asyncio
import json
import logging
import secrets

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from .assets import valid_ref
from .protocol import (COMMAND_ACTIONS, EVENT_TOPICS, ProtocolVersionError, ValidationError,
                       command_value_ok, parse_envelope)
from .sessions import Session, SessionRegistry, safe_send

log = logging.getLogger("companion.ws")

HELLO_TIMEOUT_S = 10
# unanswered commands kept per session; the oldest is dropped beyond this
MAX_PENDING_COMMANDS = 32
MAX_COMMAND_ID = 64


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
    token = secrets.token_urlsafe(24)
    async with session.lock:
        old = session.client
        session.client = ws
        session.client_token = token
    await safe_send(ws, {"type": "welcome", "token": token})
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
            if not isinstance(msg, dict):
                continue
            if msg.get("type") == "map_assets":
                map_id, digest = msg.get("mapId"), msg.get("hash")
                if isinstance(map_id, str) and isinstance(digest, str) and                         valid_ref(map_id, digest):
                    session.map_assets = {"type": "map_assets", "mapId": map_id, "hash": digest}
                    await session.broadcast(session.map_assets)
                continue
            if msg.get("type") != "envelope":
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
            if session.protocol_error is not None:
                session.protocol_error = None
                log.info("%s: protocol error cleared", session.code)
                await session.broadcast({"type": "protocol_error", "message": None})
            if envelope["topic"] in EVENT_TOPICS:
                await answer_command(session, envelope["data"])
                continue
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
                session.client_token = None
                still_connected = False
            else:
                still_connected = session.client is not None
        if not still_connected:
            await session.broadcast({"type": "client_status", "connected": False})
            for ref in list(session.commands):
                await answer_command(session, {"ref": ref, "ok": False,
                                                "reason": "game client disconnected"})
        log.info("client disconnected from %s", session.code)


async def answer_command(session: Session, ack: dict) -> None:
    """Send a command_ack to the viewer whose command it answers."""
    pending = session.commands.pop(str(ack.get("ref")), None)
    if pending is None:
        return
    viewer, viewer_id = pending
    answer = {"type": "command_ack", "id": viewer_id, "ok": ack.get("ok") is True, "reason": ack.get("reason")}
    # which way it went: the key's input action, or "setter" (specs/0003, scripts/rig_check.py)
    if isinstance(ack.get("via"), str):
        answer["via"] = ack["via"]
    # specs/0003 revision 2: whether the mod checked the tools moved, and which didn't
    if ack.get("checked") is True:
        answer["checked"] = True
        answer["unmoved"] = ack.get("unmoved") if isinstance(ack.get("unmoved"), list) else []
    await safe_send(viewer, answer)


async def handle_command(ws: WebSocket, session: Session, msg: dict) -> None:
    viewer_id = msg.get("id")
    if not isinstance(viewer_id, str) or not 0 < len(viewer_id) <= MAX_COMMAND_ID:
        return

    async def refuse(reason: str) -> None:
        await safe_send(ws, {"type": "command_ack", "id": viewer_id, "ok": False, "reason": reason})

    action = msg.get("action")
    # a list or object isn't hashable: check the type before the lookup
    if not isinstance(action, str) or action not in COMMAND_ACTIONS:
        await refuse("action not allowed")
        return
    value = msg.get("value")
    if not command_value_ok(action, value):
        await refuse("value not allowed")
        return
    client = session.client
    if client is None:
        await refuse("game client not connected")
        return
    session.command_seq += 1
    ref = str(session.command_seq)
    session.commands[ref] = (ws, viewer_id)
    while len(session.commands) > MAX_PENDING_COMMANDS:
        session.commands.popitem(last=False)
    forward = {"type": "command", "ref": ref, "action": action}
    if value is not None:
        forward["value"] = value
    await safe_send(client, forward)


async def handle_viewer(ws: WebSocket, session: Session) -> None:
    async with session.lock:
        session.viewers.add(ws)
    await safe_send(ws, session.snapshot_message())
    if session.map_assets is not None:
        await safe_send(ws, session.map_assets)
    await safe_send(ws, {"type": "client_status", "connected": session.client is not None})
    if session.protocol_error:
        await safe_send(ws, {"type": "protocol_error", "message": session.protocol_error})
    log.info("viewer connected to %s", session.code)
    try:
        while True:
            # viewers send only commands; anything else is ignored
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict) and msg.get("type") == "command":
                await handle_command(ws, session, msg)
    except WebSocketDisconnect:
        pass
    finally:
        async with session.lock:
            session.viewers.discard(ws)
