"""FS25 Companion backend: pairing relay, state store and dashboard host.

Run from the repository root:

    python -m backend.app.main                 # http://localhost:8123
    python -m backend.app.main --port 9000

The companion client can also start it in-process (``--local``), with a
fixed pairing code the dashboard picks up without ``?pair=``.
"""

import argparse
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .protocol import PROTOCOL_VERSION
from .sessions import SessionRegistry
from .ws import create_router

VERSION = "0.2.0"
WEB_DIR = Path(__file__).resolve().parents[2] / "web"


def create_app(local_pairing: Optional[str] = None, web_dir: Path = WEB_DIR) -> FastAPI:
    """Build the app. ``local_pairing`` is advertised by /api/info so the
    dashboard can connect without ``?pair=`` (local mode only: on a hosted
    relay it would let anyone join that session)."""
    app = FastAPI(title="FS25 Companion")
    registry = SessionRegistry()
    app.state.registry = registry
    app.include_router(create_router(registry))

    @app.get("/api/info")
    async def api_info():
        return {
            "name": "fs25-companion",
            "version": VERSION,
            "protocolVersion": PROTOCOL_VERSION,
            "activeSessions": len(registry),
            "localPairing": local_pairing,
        }

    # Mounted last so /ws and /api/* match first; html=True serves index.html at /
    app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")
    return app


app = create_app()


def main() -> None:
    import uvicorn

    p = argparse.ArgumentParser(description="FS25 Companion backend")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8123)
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
