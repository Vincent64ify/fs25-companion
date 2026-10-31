"""FS25 Companion: runs next to the game.

Tails the stream file the companion mod writes
(<profile>/modSettings/FS25_Companion/stream.ndjson), keeps the latest
state, and serves the dashboard and its WebSocket. The dashboard's
commands are written to cmd/ next to the stream, where the mod reads them
(commands.py).

    python -m companion
        open http://localhost:8123 (or the LAN address it prints)
    python -m companion --replay fixtures/solek_v1.ndjson
        no game needed: replay a recording (works on any OS)
    python -m companion --record session.ndjson
        also save what the game sends, for replay later

Works the same on Windows and macOS.
"""

import argparse
import asyncio
import logging
import socket
import sys
from pathlib import Path

from . import paths
from .commands import CommandWriter
from .map_assets import MapPublisher
from .server import Hub, create_app
from .tail import replay, tail

log = logging.getLogger("companion")


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="python -m companion", description="FS25 Companion")
    p.add_argument("--port", type=int, default=8123, help="dashboard port (default 8123)")
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


async def serve(app, port: int) -> None:
    import uvicorn

    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="warning")
    await uvicorn.Server(config).serve()


async def run(args) -> None:
    hub = Hub()
    maps = paths.cache_dir() / "maps"

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

    # commands go next to the stream file; a replay has no game to send them to
    commands = CommandWriter(stream.parent / "cmd" if stream is not None else None, hub.put_ack)
    hub.writer = commands
    on_hello = [commands.on_hello]
    if not args.no_map_sync:
        on_hello.append(MapPublisher(hub.announce_map, maps, profile).on_hello)

    async def sink(envelopes) -> None:
        for envelope in envelopes:
            if envelope["topic"] == "hello":
                for hook in on_hello:
                    hook(envelope["data"])
            elif envelope["topic"] == "command_ack":
                commands.on_ack(envelope["data"])
        await hub.publish(envelopes)

    tasks = [asyncio.create_task(serve(create_app(hub, maps), args.port))]
    if stream is None:
        tasks.append(asyncio.create_task(replay(args.replay, sink, speed=args.speed, loop=args.loop)))
    else:
        tasks.append(asyncio.create_task(tail(stream, sink, record, commands.fast)))

    print("=" * 64)
    print("FS25 Companion")
    print(f"  source:    {source}")
    print(f"  dashboard: http://localhost:{args.port}  (LAN: http://{lan_address()}:{args.port})")
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
