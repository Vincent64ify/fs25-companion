"""Replay a recorded stream (any .ndjson the mod wrote, or a fixture).

The stream file is already a recording: replay just feeds its envelopes
back with the original timing (from each envelope's game time ``t``), so
the backend and the dashboard can be developed without the game.
"""

import asyncio
import logging
from pathlib import Path
from typing import Any, Callable, Dict

from .file_tail import parse_line

log = logging.getLogger("companion.replay")

# a pause in the recording (game paused, menu) is cut to this
MAX_GAP_S = 2.0


async def replay(path: Path, sink: Callable[[Dict[str, Any]], None],
                 speed: float = 1.0, loop: bool = False) -> None:
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
            sink(envelope)
        if not loop:
            break
    log.info("replay finished")
