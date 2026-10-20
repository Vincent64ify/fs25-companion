"""Map assets: the overview images and meta.json the client uploads.

    PUT  /api/maps/{mapId}/{hash}/{name}   Authorization: Bearer <client token>
    GET  /api/maps/{mapId}/{hash}/{name}

Content-addressed: a hash names one exact set of files, so a stored file is
never replaced and GET responses are cacheable forever. Only a connected
game client may upload (its token comes in the backend's ``welcome``), so
random visitors can't fill a hosted relay's disk.
"""

import json
import os
import re
import secrets
from pathlib import Path
from typing import Callable, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

MAP_ID_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\-]{0,127}$")
HASH_RE = re.compile(r"^[0-9a-f]{16,64}$")
ASSET_TYPES = {
    "overview.png": "image/png",
    "overview_2048.png": "image/png",
    "meta.json": "application/json",
}
MAX_ASSET_BYTES = 64 * 1024 * 1024
MAX_META_BYTES = 64 * 1024


def valid_ref(map_id: str, digest: str) -> bool:
    return bool(MAP_ID_RE.match(map_id) and HASH_RE.match(digest))


class AssetStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    def path(self, map_id: str, digest: str, name: str) -> Optional[Path]:
        if not valid_ref(map_id, digest) or name not in ASSET_TYPES:
            return None
        return self.root / map_id / digest / name


def create_assets_router(store: AssetStore, token_valid: Callable[[str], bool]) -> APIRouter:
    router = APIRouter()

    @router.api_route("/api/maps/{map_id}/{digest}/{name}", methods=["GET", "HEAD"])
    async def get_asset(map_id: str, digest: str, name: str):
        path = store.path(map_id, digest, name)
        if path is None or not path.is_file():
            raise HTTPException(404)
        return FileResponse(path, media_type=ASSET_TYPES[name], headers={
            "Cache-Control": "public, max-age=31536000, immutable"})

    @router.put("/api/maps/{map_id}/{digest}/{name}")
    async def put_asset(request: Request, map_id: str, digest: str, name: str,
                        authorization: str = Header(default="")):
        token = authorization.removeprefix("Bearer ").strip()
        if not token or not token_valid(token):
            raise HTTPException(401, "a connected companion client's token is required")
        path = store.path(map_id, digest, name)
        if path is None:
            raise HTTPException(404)
        limit = MAX_META_BYTES if name == "meta.json" else MAX_ASSET_BYTES
        length = request.headers.get("content-length")
        if length is not None and length.isdigit() and int(length) > limit:
            raise HTTPException(413)
        if path.is_file():
            return JSONResponse({"stored": False}, status_code=200)

        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{name}.{secrets.token_hex(4)}.tmp")
        size = 0
        try:
            with open(tmp, "wb") as f:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > limit:
                        raise HTTPException(413)
                    f.write(chunk)
            if name == "meta.json":
                try:
                    json.loads(tmp.read_bytes())
                except ValueError:
                    raise HTTPException(400, "meta.json is not JSON")
            os.replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)
        return JSONResponse({"stored": True}, status_code=201)

    return router
