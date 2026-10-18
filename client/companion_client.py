#!/usr/bin/env python3
r"""FS25 Companion — local bridge client.

Reads the telemetry the in-game mod writes to the ``\\.\pipe\fssimx``
named pipe and relays it as JSON over a WebSocket to the companion relay
backend, which forwards it to your browser dashboard.

Usage:
    python companion_client.py --backend ws://127.0.0.1:8123
    python companion_client.py --backend wss://relay.example.com --pairing 123456
"""

import argparse
import logging
import random
import string
import sys
import threading

from pipe_server import NamedPipeServer
from protocol import FrameParser
from relay import WebSocketRelay

log = logging.getLogger("companion")


def parse_args():
    p = argparse.ArgumentParser(
        description="FS25 Companion local bridge client (pipe -> relay)")
    p.add_argument("--backend", default="ws://127.0.0.1:8123",
                   help="relay WebSocket URL (default: ws://127.0.0.1:8123)")
    p.add_argument("--pairing", default=None,
                   help="pairing code for the dashboard (random 6 digits if omitted)")
    p.add_argument("--pipe", default="\\\\.\\pipe\\fssimx",
                   help="named pipe path (default: \\\\.\\pipe\\fssimx)")
    p.add_argument("--hz", type=float, default=5.0,
                   help="telemetry send rate in Hz (default: 5)")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="debug logging")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s")

    if sys.platform != "win32":
        log.error("the telemetry pipe is a Windows named pipe; "
                  "run the client on Windows")
        sys.exit(1)

    pairing = args.pairing or "".join(random.choices(string.digits, k=6))
    parser = FrameParser()
    state = {"frame": None, "dirty": False}

    def on_data(data: bytes) -> None:
        for frame in parser.feed(data):
            state["frame"] = frame
            state["dirty"] = True

    pipe = NamedPipeServer(args.pipe, on_data)
    threading.Thread(target=pipe.run, name="pipe", daemon=True).start()

    relay = WebSocketRelay(args.backend, pairing, state, 1.0 / args.hz)

    print("=" * 60)
    print("FS25 Companion client")
    print(f"  pipe:      {args.pipe}")
    print(f"  backend:   {args.backend}")
    print(f"  pairing:   {pairing}")
    print("  dashboard:  open the web app with ?pair=" + pairing)
    print("=" * 60)

    try:
        relay.run_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
