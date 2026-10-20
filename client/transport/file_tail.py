"""Tail the mod's stream file.

The mod writes whole lines and flushes once per frame. The reader polls:

* it keeps a byte offset and buffers a trailing partial line until the
  rest arrives
* when the file is smaller than the offset, the mod rotated it (reopened
  with "w"): start again from 0 and drop the partial line
* a missing file just yields nothing until the game creates it

Pure Python, no OS-specific code: FS25 doesn't lock the file on Windows
(verified in Phase 0), and macOS doesn't lock files.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

POLL_INTERVAL_S = 0.05
MAX_READ_BYTES = 4 * 1024 * 1024


class FileTail:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.offset = 0
        self.rotations = 0
        self._partial = b""

    def poll(self) -> List[str]:
        """Complete new lines since the last poll."""
        try:
            size = os.path.getsize(self.path)
        except OSError:
            self._reset()
            return []
        if size < self.offset:
            self.rotations += 1
            self._reset()
        if size == self.offset:
            return []
        try:
            with open(self.path, "rb") as f:
                f.seek(self.offset)
                chunk = f.read(min(size - self.offset, MAX_READ_BYTES))
        except OSError:
            return []
        self.offset += len(chunk)
        pieces = (self._partial + chunk).split(b"\n")
        self._partial = pieces.pop()
        return [p.decode("utf-8", "replace").rstrip("\r") for p in pieces if p.strip()]

    def _reset(self) -> None:
        self.offset = 0
        self._partial = b""


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
