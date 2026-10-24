"""Pairing sessions: one game client and any number of viewers per code.

Sessions live in memory only and disappear when the last socket leaves.
"""

import asyncio
import json
import secrets
from collections import OrderedDict
from typing import Any, Dict, Optional, Set, Tuple

from fastapi import WebSocket

from .state_store import StateStore


async def safe_send(ws: WebSocket, msg: Any) -> None:
    try:
        await ws.send_text(msg if isinstance(msg, str) else json.dumps(msg))
    except Exception:
        pass


class Session:
    def __init__(self, code: str):
        self.code = code
        self.client: Optional[WebSocket] = None
        self.viewers: Set[WebSocket] = set()
        self.store = StateStore()
        self.protocol_error: Optional[str] = None
        # issued to the connected client; authorizes map asset uploads
        self.client_token: Optional[str] = None
        # {"type": "map_assets", "mapId", "hash"}: the map images in use
        self.map_assets: Optional[Dict[str, Any]] = None
        # commands sent to the client and not answered yet:
        # backend ref -> (viewer socket, the viewer's own id)
        self.commands: "OrderedDict[str, Tuple[WebSocket, str]]" = OrderedDict()
        self.command_seq = 0
        self.lock = asyncio.Lock()

    async def broadcast(self, msg: Any) -> None:
        payload = msg if isinstance(msg, str) else json.dumps(msg)
        async with self.lock:
            targets = list(self.viewers)
        for viewer in targets:
            await safe_send(viewer, payload)

    def snapshot_message(self) -> Dict[str, Any]:
        return {"type": "snapshot", "topics": self.store.snapshot()}


class SessionRegistry:
    def __init__(self) -> None:
        self._sessions: Dict[str, Session] = {}

    def get_or_create(self, code: str) -> Session:
        return self._sessions.setdefault(code, Session(code))

    def token_valid(self, token: str) -> bool:
        return any(s.client_token is not None and secrets.compare_digest(s.client_token, token)
                   for s in self._sessions.values())

    def drop_if_empty(self, session: Session) -> None:
        if session.client is None and not session.viewers:
            if self._sessions.get(session.code) is session:
                del self._sessions[session.code]

    def __len__(self) -> int:
        return len(self._sessions)
