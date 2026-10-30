"""Tail the mod's stream file.

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
  (FAST_POLL_INTERVAL_S, see client/commands.py), so its ack and the new
  cab state go out as soon as the mod writes them

Pure Python, no OS-specific code: FS25 doesn't lock the file on Windows
(verified in Phase 0), and macOS doesn't lock files.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

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
    a line cut off by a rotation). The backend does the full validation."""
    try:
        envelope = json.loads(line)
    except ValueError:
        return None
    if (not isinstance(envelope, dict) or not isinstance(envelope.get("topic"), str)
            or not isinstance(envelope.get("data"), dict)):
        return None
    return envelope
