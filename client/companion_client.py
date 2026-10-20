#!/usr/bin/env python3
"""FS25 Companion client: runs next to the game.

Tails the stream file the companion mod writes
(<profile>/modSettings/FS25_Companion/stream.ndjson) and forwards every
envelope to the backend, which serves the browser dashboard.

    python client/companion_client.py --local
        start the backend in this process too; open http://localhost:8123
    python client/companion_client.py --backend wss://relay.example.com
        use a hosted relay; the dashboard needs ?pair=<code>
    python client/companion_client.py --local --replay fixtures/solek_v1.ndjson
        no game needed: replay a recording (works on any OS)
    python client/companion_client.py --local --record session.ndjson
        also save what the game sends, for replay later

Works the same on Windows and macOS.
"""

import argparse
import asyncio
import logging
import random
import socket
import string
import sys
from pathlib import Path

CLIENT_DIR = Path(__file__).resolve().parent
REPO = CLIENT_DIR.parent
sys.path.insert(0, str(CLIENT_DIR))

import paths  # noqa: E402
from map_assets import MapPublisher  # noqa: E402
from relay import Outbox, WebSocketRelay  # noqa: E402
from transport.file_tail import POLL_INTERVAL_S, FileTail, parse_line  # noqa: E402
from transport.replay import replay  # noqa: E402

log = logging.getLogger("companion")

LOCAL_PAIRING = "LOCAL"


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="FS25 Companion client (game -> backend)")
    p.add_argument("--local", action="store_true",
                   help="run the backend in this process (one program, LAN only)")
    p.add_argument("--port", type=int, default=8123,
                   help="backend port with --local (default 8123)")
    p.add_argument("--backend", default=None,
                   help="backend WebSocket URL (default ws://127.0.0.1:8123)")
    p.add_argument("--pairing", default=None,
                   help="pairing code (default: LOCAL with --local, else 6 random digits)")
    p.add_argument("--profile-dir", type=Path, default=None,
                   help="FS25 profile folder (the one with mods/ and modSettings/)")
    p.add_argument("--stream", type=Path, default=None,
                   help="stream file to tail (overrides --profile-dir)")
    p.add_argument("--replay", type=Path, default=None, metavar="FILE",
                   help="replay a recorded .ndjson instead of tailing the game")
    p.add_argument("--speed", type=float, default=1.0, help="replay speed factor")
    p.add_argument("--loop", action="store_true", help="replay forever")
    p.add_argument("--record", type=Path, default=None, metavar="FILE",
                   help="append every line read from the game to FILE")
    p.add_argument("--no-map-sync", action="store_true",
                   help="don't send the map's overview image to the dashboard")
    p.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    return p.parse_args(argv)


def resolve_stream(args) -> Path:
    if args.stream is not None:
        return args.stream
    profile = args.profile_dir or paths.find_profile_dir()
    if profile is None:
        tried = "\n  ".join(str(c) for c in paths.candidate_profile_dirs())
        sys.exit("FS25 profile folder not found. Tried:\n  " + tried +
                 "\nPass --profile-dir <folder> (the one that contains mods/).")
    return paths.stream_path(profile)


def lan_address() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # no packet is sent
            return s.getsockname()[0]
    except OSError:
        return "localhost"


def forwarder(outbox: Outbox, on_hello=None):
    """put(envelope): queue it for the backend and pass each hello on."""
    def put(envelope) -> None:
        outbox.put(envelope)
        if on_hello is not None and envelope["topic"] == "hello":
            on_hello(envelope["data"])
    return put


async def tail(stream: Path, put, record) -> None:
    reader = FileTail(stream)
    waiting_logged = False
    rotations = 0
    while True:
        lines = reader.poll()
        if not lines and not stream.exists() and not waiting_logged:
            log.info("waiting for the game to create %s", stream)
            waiting_logged = True
        if reader.rotations != rotations:
            rotations = reader.rotations
            log.debug("stream file rotated")
        for line in lines:
            waiting_logged = False
            if record is not None:
                record.write(line + "\n")
            envelope = parse_line(line)
            if envelope is not None:
                put(envelope)
        if record is not None and lines:
            record.flush()
        await asyncio.sleep(POLL_INTERVAL_S)


async def serve_backend(port: int, pairing: str, assets_dir: Path) -> None:
    try:
        import uvicorn
        sys.path.insert(0, str(REPO))
        from backend.app.main import create_app
    except ImportError as e:
        sys.exit(f"--local needs the backend packages ({e}). "
                 "Run: pip install -r backend/requirements.txt")
    config = uvicorn.Config(create_app(local_pairing=pairing, assets_dir=assets_dir),
                            host="0.0.0.0", port=port, log_level="warning")
    await uvicorn.Server(config).serve()


async def run(args) -> None:
    pairing = args.pairing or (LOCAL_PAIRING if args.local
                               else "".join(random.choices(string.digits, k=6)))
    backend = args.backend or f"ws://127.0.0.1:{args.port}"
    outbox = Outbox()
    relay = WebSocketRelay(backend, pairing, outbox)
    cache = paths.cache_dir()
    tasks = []

    if args.local:
        tasks.append(asyncio.create_task(
            serve_backend(args.port, pairing, cache / "backend-assets")))
        dashboard = f"http://localhost:{args.port}  (LAN: http://{lan_address()}:{args.port})"
    else:
        http = backend.replace("wss://", "https://").replace("ws://", "http://")
        dashboard = f"{http.rstrip('/')}/?pair={pairing}"

    record = None
    if args.replay is not None:
        stream = None
        source = f"replay {args.replay}"
        # a recording carries no paths of this machine: find maps by id
        profile = args.profile_dir or paths.find_profile_dir()
    else:
        stream = resolve_stream(args)
        source = str(stream)
        if args.record is not None:
            record = open(args.record, "a", encoding="utf-8", newline="\n")
        # the stream file normally sits in <profile>/modSettings/FS25_Companion/
        profile = stream.parents[2] if (stream.parents[2] / "mods").is_dir() else None

    on_hello = None
    if not args.no_map_sync:
        on_hello = MapPublisher(relay, cache / "maps", profile).on_hello
    put = forwarder(outbox, on_hello)
    if stream is None:
        tasks.append(asyncio.create_task(
            replay(args.replay, put, speed=args.speed, loop=args.loop)))
    else:
        tasks.append(asyncio.create_task(tail(stream, put, record)))
    tasks.append(asyncio.create_task(relay.run()))

    print("=" * 64)
    print("FS25 Companion client")
    print(f"  source:    {source}")
    print(f"  backend:   {backend}{'  (in this process)' if args.local else ''}")
    print(f"  pairing:   {pairing}")
    print(f"  dashboard: {dashboard}")
    print("=" * 64)

    try:
        # run until Ctrl+C or a task fails; a finished replay keeps its last
        # state on the dashboard
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
        for task in done:
            task.result()
    finally:
        if record is not None:
            record.close()


def main(argv=None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
