"""Tail the mod's stream file, or replay a recorded one.

The mod writes whole lines and flushes once per frame. The reader polls:

* it keeps a byte offset and buffers a trailing partial line until the
  rest arrives
* a new file (the mod rotated it or the game restarted; reopened with
  "w"): start again from 0 and drop the partial line. It is new when it
  is smaller than the offset, or when its first line (always a hello,
  unique to that file) isn't the one read before: a new file may already
  have grown past the old offset by the next poll (specs/0005)
* a missing file just yields nothing until the game creates it
* every 50 ms, or every 10 ms for 2 s after a dashboard command
  (FAST_POLL_INTERVAL_S, see commands.py), so its ack and the new
  cab state go out as soon as the mod writes them

Pure Python, no OS-specific code: FS25 doesn't lock the file on Windows
(verified in Phase 0), and macOS doesn't lock files.

Both ``tail`` and ``replay`` hand ``sink`` one list of envelopes per read:
the lines one poll brought, or one envelope of a replay.
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, TextIO

log = logging.getLogger("companion.tail")

Envelope = Dict[str, Any]
Sink = Callable[[List[Envelope]], Awaitable[None]]

POLL_INTERVAL_S = 0.05
FAST_POLL_INTERVAL_S = 0.01
MAX_READ_BYTES = 4 * 1024 * 1024
# the first line kept to know the file again (hello: about 1 KB)
MAX_HEAD_BYTES = 64 * 1024


class FileTail:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.offset = 0
        self.rotations = 0
        self._partial = b""
        # the file's first line with its newline, once read whole
        self._head = b""

    def poll(self) -> List[str]:
        """Complete new lines since the last poll."""
        try:
            size = os.path.getsize(self.path)
        except OSError:
            self._reset()
            return []
        try:
            with open(self.path, "rb") as f:
                if size < self.offset or (self._head and f.read(len(self._head)) != self._head):
                    self.rotations += 1
                    self._reset()
                if size <= self.offset:
                    return []
                f.seek(self.offset)
                chunk = f.read(min(size - self.offset, MAX_READ_BYTES))
        except OSError:
            return []
        start = self.offset
        self.offset += len(chunk)
        if not self._head and start < MAX_HEAD_BYTES:
            # no newline read yet: the partial line is the file from its top
            self._head = self._first_line(self._partial + chunk)
        pieces = (self._partial + chunk).split(b"\n")
        self._partial = pieces.pop()
        return [p.decode("utf-8", "replace").rstrip("\r") for p in pieces if p.strip()]

    def skip_to_end(self) -> None:
        """Start after what the file holds now (scripts/livewatch.py)."""
        try:
            with open(self.path, "rb") as f:
                self._head = self._first_line(f.read(MAX_HEAD_BYTES))
                self.offset = f.seek(0, os.SEEK_END)
        except OSError:
            return
        self._partial = b""

    @staticmethod
    def _first_line(head: bytes) -> bytes:
        """The first line with its newline, once the read reaches its end."""
        end = head.find(b"\n", 0, MAX_HEAD_BYTES)
        return head[:end + 1] if end >= 0 else b""

    def _reset(self) -> None:
        self.offset = 0
        self._partial = b""
        self._head = b""


def parse_line(line: str) -> Optional[Dict[str, Any]]:
    """Decode one envelope, or None for a line that isn't one (for example
    a line cut off by a rotation). The server does the full validation."""
    try:
        envelope = json.loads(line)
    except ValueError:
        return None
    if (not isinstance(envelope, dict) or not isinstance(envelope.get("topic"), str)
            or not isinstance(envelope.get("data"), dict)):
        return None
    return envelope


async def tail(stream: Path, sink: Sink, record: Optional[TextIO] = None,
               fast: Callable[[], bool] = lambda: False) -> None:
    """Follow the stream file forever; ``record`` gets every line read."""
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
        if lines:
            waiting_logged = False
            if record is not None:
                record.write("".join(line + "\n" for line in lines))
                record.flush()
            envelopes = [e for e in map(parse_line, lines) if e is not None]
            if envelopes:
                await sink(envelopes)
        await asyncio.sleep(FAST_POLL_INTERVAL_S if fast() else POLL_INTERVAL_S)


# a pause in the recording (game paused, menu) is cut to this
MAX_GAP_S = 2.0


async def replay(path: Path, sink: Sink, speed: float = 1.0, loop: bool = False) -> None:
    """Feed a recorded stream (any .ndjson the mod wrote, or a fixture) back
    with its original timing, from each envelope's game time ``t``: the
    dashboard can be developed without the game."""
    with open(path, encoding="utf-8") as f:
        envelopes = [e for e in map(parse_line, f) if e is not None]
    if not envelopes:
        raise ValueError(f"no envelopes in {path}")
    log.info("replaying %d envelopes from %s at %gx%s",
             len(envelopes), path, speed, ", looping" if loop else "")
    while True:
        prev_t = None
        for envelope in envelopes:
            t = envelope.get("t")
            if isinstance(t, (int, float)) and prev_t is not None:
                gap = min(max(t - prev_t, 0) / 1000 / speed, MAX_GAP_S)
                if gap > 0:
                    await asyncio.sleep(gap)
            if isinstance(t, (int, float)):
                prev_t = t
            await sink([envelope])
        if not loop:
            break
    log.info("replay finished")
