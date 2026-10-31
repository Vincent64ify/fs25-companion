"""The dashboard's server: its files, /ws for viewers, the map images.

    viewer -> server:  {"type": "command", "id": str, "action": str, "value"?: number}
                       a tap on a control; the action must be in
                       protocol.COMMAND_ACTIONS ("lights.toggle"), and a
                       value only for an action in COMMAND_VALUES, in its
                       range ("cruise.set": km/h). Anything else a viewer
                       sends is ignored.

    server -> viewer:  {"type": "snapshot", "topics": {topic: envelope}}
                       on connect, and again when a new game session starts
                       (it replaces everything the viewer holds)
    server -> viewer:  {"type": "update", "envelope": {...}}
    server -> viewer:  {"type": "map_assets", "mapId": str, "hash": str}
                       on connect too; the images are at
                       /api/maps/<mapId>/<hash>/overview.png
    server -> viewer:  {"type": "client_status", "connected": true}
                       on connect: the tailer is in this process
    server -> viewer:  {"type": "protocol_error", "message": str|null}
                       on connect while there is one; null once the mod's
                       envelopes are good again
    server -> viewer:  {"type": "command_ack", "id": str, "ok": bool,
                       "reason": str|null, "via"?: str, "checked"?: true,
                       "unmoved"?: [...]}
                       via: what ran, the key's input action or "setter";
                       checked: the mod waited for the tools to move;
                       unmoved: those that didn't, {id, name, why}
                       to the viewer that sent the command, with its own
                       id: from the mod, from the command writer (replay,
                       superseded...), or straight from here when the
                       action isn't allowed. The new state follows as the
                       cab topic.

    GET /api/maps/<mapId>/<hash>/{overview.png, overview_2048.png, meta.json}
                       from the map cache (map_assets.py)
"""

import json
import logging
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, FastAPI, HTTPException, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect

from .map_assets import FILE_TYPES, cached_file
from .protocol import (COMMAND_ACTIONS, EVENT_TOPICS, ProtocolVersionError, ValidationError,
                       command_value_ok, parse_envelope)
from .state import StateStore

log = logging.getLogger("companion.server")

WEB_DIR = Path(__file__).resolve().parents[1] / "web"
# unanswered commands kept; the oldest is dropped beyond this
MAX_PENDING_COMMANDS = 32
MAX_COMMAND_ID = 64

Envelope = Dict[str, Any]


async def safe_send(ws: WebSocket, msg: Any) -> None:
    try:
        await ws.send_text(msg if isinstance(msg, str) else json.dumps(msg))
    except Exception:
        pass


def in_order(envelopes: List[Envelope], session: Optional[str]) -> List[Envelope]:
    """One read of the stream as it goes out: the latest envelope per topic,
    hello first, then the events (command_ack) in order, so the cab state an
    ack's command changed is there when the answer comes. A hello of a new
    session drops what came before it in the read. ``session``: the
    sessionId held now."""
    state: Dict[str, Envelope] = {}
    events: List[Envelope] = []
    for envelope in envelopes:
        topic = envelope.get("topic")
        if topic in EVENT_TOPICS:
            events.append(envelope)
        elif topic == "hello":
            new = envelope["data"].get("sessionId")
            if new != session:
                session = new
                state.clear()
            state = {"hello": envelope, **{k: v for k, v in state.items() if k != "hello"}}
        else:
            state[topic] = envelope
    return list(state.values()) + events


class Hub:
    """The viewers, the latest state and the commands waiting for an answer.
    ``writer`` (commands.CommandWriter) gets the commands; its own acks come
    back through put_ack."""

    def __init__(self) -> None:
        self.viewers: Set[WebSocket] = set()
        self.store = StateStore()
        self.writer: Any = None
        self.protocol_error: Optional[str] = None
        self.map_assets: Optional[Dict[str, Any]] = None
        # server ref -> (viewer socket, the viewer's own id)
        self.commands: "OrderedDict[str, Tuple[WebSocket, str]]" = OrderedDict()
        self.command_seq = 0
        self.invalid = 0
        self._own_acks: List[Envelope] = []

    async def broadcast(self, msg: Any) -> None:
        payload = msg if isinstance(msg, str) else json.dumps(msg)
        for viewer in list(self.viewers):
            await safe_send(viewer, payload)

    def snapshot_message(self) -> Dict[str, Any]:
        return {"type": "snapshot", "topics": self.store.snapshot()}

    # from the game

    async def publish(self, envelopes: List[Envelope]) -> None:
        """One read of the stream file (tail.py): check, keep, send on."""
        valid = []
        for raw in envelopes:
            try:
                valid.append(parse_envelope(raw))
            except ProtocolVersionError as e:
                if self.protocol_error != str(e):
                    self.protocol_error = str(e)
                    log.warning("%s", e)
                    await self.broadcast({"type": "protocol_error", "message": str(e)})
            except ValidationError as e:
                self.invalid += 1
                if self.invalid == 1 or self.invalid % 100 == 0:
                    log.warning("dropped %d invalid envelope(s), latest: %s", self.invalid, e.errors()[:1])
        if valid and self.protocol_error is not None:
            self.protocol_error = None
            log.info("protocol error cleared")
            await self.broadcast({"type": "protocol_error", "message": None})
        for envelope in in_order(valid, self.store.session_id):
            if envelope["topic"] in EVENT_TOPICS:
                await self.answer(envelope["data"])
            elif self.store.apply(envelope):
                await self.broadcast(self.snapshot_message())
            else:
                await self.broadcast({"type": "update", "envelope": envelope})
        await self.flush()

    async def announce_map(self, map_id: str, digest: str) -> None:
        self.map_assets = {"type": "map_assets", "mapId": map_id, "hash": digest}
        await self.broadcast(self.map_assets)

    # commands

    def put_ack(self, envelope: Envelope) -> None:
        """A command_ack the command writer made itself; sent by flush."""
        self._own_acks.append(envelope)

    async def flush(self) -> None:
        while self._own_acks:
            await self.answer(self._own_acks.pop(0)["data"])

    async def answer(self, ack: Dict[str, Any]) -> None:
        """Send a command_ack to the viewer whose command it answers."""
        pending = self.commands.pop(str(ack.get("ref")), None)
        if pending is None:
            return
        viewer, viewer_id = pending
        answer = {"type": "command_ack", "id": viewer_id, "ok": ack.get("ok") is True,
                  "reason": ack.get("reason")}
        # which way it went: the key's input action, or "setter" (specs/0003, scripts/rig_check.py)
        if isinstance(ack.get("via"), str):
            answer["via"] = ack["via"]
        # specs/0003 revision 2: whether the mod checked the tools moved, and which didn't
        if ack.get("checked") is True:
            answer["checked"] = True
            answer["unmoved"] = ack.get("unmoved") if isinstance(ack.get("unmoved"), list) else []
        await safe_send(viewer, answer)

    async def command(self, ws: WebSocket, msg: Dict[str, Any]) -> None:
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
        self.command_seq += 1
        ref = str(self.command_seq)
        self.commands[ref] = (ws, viewer_id)
        while len(self.commands) > MAX_PENDING_COMMANDS:
            self.commands.popitem(last=False)
        self.writer.submit(ref, action, value)
        await self.flush()

    # viewers

    async def serve_viewer(self, ws: WebSocket) -> None:
        await ws.accept()
        self.viewers.add(ws)
        await safe_send(ws, self.snapshot_message())
        if self.map_assets is not None:
            await safe_send(ws, self.map_assets)
        await safe_send(ws, {"type": "client_status", "connected": True})
        if self.protocol_error:
            await safe_send(ws, {"type": "protocol_error", "message": self.protocol_error})
        try:
            while True:
                # viewers send only commands; anything else is ignored
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict) and msg.get("type") == "command":
                    await self.command(ws, msg)
        except WebSocketDisconnect:
            pass
        finally:
            self.viewers.discard(ws)


class DashboardFiles(StaticFiles):
    """The dashboard's files, revalidated on every load (usually a cheap
    304). The ES modules are fetched one by one: a browser that kept some
    from an older version would run a broken mix of the two."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


def create_app(hub: Hub, maps_dir: Path, web_dir: Path = WEB_DIR) -> FastAPI:
    """``maps_dir``: map_assets.py's cache folder."""
    app = FastAPI(title="FS25 Companion")
    app.state.hub = hub
    router = APIRouter()

    @router.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await hub.serve_viewer(websocket)

    @router.api_route("/api/maps/{map_id}/{digest}/{name}", methods=["GET", "HEAD"])
    async def map_file(map_id: str, digest: str, name: str):
        path = cached_file(maps_dir, map_id, digest, name)
        if path is None:
            raise HTTPException(404)
        # a hash names one exact set of files: cacheable forever
        return FileResponse(path, media_type=FILE_TYPES[name], headers={
            "Cache-Control": "public, max-age=31536000, immutable"})

    app.include_router(router)
    # mounted last so /ws and /api/* match first; html=True serves index.html at /
    app.mount("/", DashboardFiles(directory=web_dir, html=True), name="web")
    return app
