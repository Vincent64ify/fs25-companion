"""Write the dashboard's commands where the mod reads them.

The server hands a viewer's command over as (ref, action, value, tool),
its shape checked. This module writes it as it is; the mod checks the
action and its value against its own list (specs/0007):

    <profile>/modSettings/FS25_Companion/cmd/<n>.xml
    <command session="<sessionId>" id="<n>" action="beacon.set" ref="<ref>" value="1.000"/>
    <command ... action="tool.lower" ref="<ref>" value="1.000" tool="9"/>

numbered from 1 per game session (the hello's sessionId), continuing from
hello.commands.next when the companion starts mid-session. Each file is
written as <n>.xml.tmp, read back once, then renamed: the rename makes it
appear whole, and the read-back takes the ~4 ms first-open cost off the
game's frame (C0, docs/PLAN.md). The mod answers with a command_ack in the
stream; the file is deleted then.

A command that can't be written (no game session, replay, a mod before
0.10.0 that reads toggles or the game's names: hello.commands has no
actions 3) is answered at once with a command_ack of our own, so the
dashboard isn't left waiting.

Every command is written as it comes (specs/0008): each says the state it
wants, so a doubled or late one does nothing ("already"), and the web
sends one cruise.set at a time while a −/+ button is held.
"""

import logging
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from xml.sax.saxutils import quoteattr

log = logging.getLogger("companion.commands")

# poll the stream fast for this long after a command, so the ack and the
# new cab state go out as soon as the mod writes them
FAST_POLL_S = 2.0

Envelope = Dict[str, Any]


def ack_envelope(ref: str, reason: str) -> Envelope:
    """A command_ack of our own (seq 0: not the mod's)."""
    return {"v": 1, "seq": 0, "t": 0, "topic": "command_ack",
            "data": {"ref": ref, "ok": False, "reason": reason}}


class CommandWriter:
    """cmd_dir: the folder the mod reads, or None (replay: no game).
    put: where our own acks go (the server's Hub.put_ack)."""

    def __init__(self, cmd_dir: Optional[Path], put: Callable[[Envelope], None],
                 clock: Callable[[], float] = time.monotonic):
        self.cmd_dir = Path(cmd_dir) if cmd_dir is not None else None
        self.put = put
        self.clock = clock
        self.session: Optional[str] = None
        # the mod reads the dashboard's set actions (hello.commands.actions
        # 3, specs/0008); a mod before 0.10.0 reads toggles or the game's names
        self.mod_reads_names = True
        self.next_id = 1
        self.fast_until = 0.0
        # id -> ref of the files written this session and not answered yet:
        # an ack the mod sends by number only (it couldn't read the file)
        # still reaches its viewer
        self._refs: Dict[int, str] = {}

    def on_hello(self, hello: Dict[str, Any]) -> None:
        session = hello.get("sessionId")
        info = hello.get("commands") if isinstance(hello.get("commands"), dict) else {}
        mod_next = info.get("next") if isinstance(info.get("next"), int) else 1
        # a hello without commands (a replay) has no mod to ask
        self.mod_reads_names = not info or info.get("actions") == 3
        if session != self.session:
            self.session = session
            self.next_id = mod_next
            self._refs.clear()
            if mod_next == 1:
                # a new game session: what's left in cmd/ belongs to an older one
                self._clear()
        else:
            self.next_id = max(self.next_id, mod_next)

    def on_ack(self, ack: Dict[str, Any]) -> None:
        """The mod answered command <id>: delete its file. An ack without
        its ref gets the one written with that number."""
        cid = ack.get("id")
        if not isinstance(cid, int) or self.cmd_dir is None:
            return
        ref = self._refs.pop(cid, None)
        if ref is not None and ack.get("ref") is None:
            ack["ref"] = ref
        self.next_id = max(self.next_id, cid + 1)
        try:
            (self.cmd_dir / f"{cid}.xml").unlink()
        except OSError:
            pass

    def submit(self, ref: str, action: str, value: Any = None, tool: Optional[int] = None) -> None:
        """The server checked the shape; the mod checks the action, its
        value and its tool (specs/0007, 0008)."""
        if self.cmd_dir is None:
            self.put(ack_envelope(ref, "no game (replay)"))
            return
        if self.session is None:
            self.put(ack_envelope(ref, "game not running"))
            return
        if not self.mod_reads_names:
            self.put(ack_envelope(ref, "update the mod"))
            return
        cid = self.next_id
        try:
            self.write(cid, action, ref, value, tool)
        except OSError as e:
            log.warning("cannot write command %d: %s", cid, e)
            self.put(ack_envelope(ref, "cannot write the command file"))
            return
        self.next_id = cid + 1
        self._refs[cid] = ref
        self.fast_until = self.clock() + FAST_POLL_S

    def write(self, cid: int, action: str, ref: str, value: Any = None, tool: Optional[int] = None) -> Path:
        assert self.cmd_dir is not None
        self.cmd_dir.mkdir(parents=True, exist_ok=True)
        path = self.cmd_dir / f"{cid}.xml"
        tmp = path.with_name(path.name + ".tmp")
        text = ('<?xml version="1.0" encoding="utf-8" standalone="no"?>\n'
                f"<command session={quoteattr(str(self.session))} id=\"{cid}\" "
                f"action={quoteattr(action)} ref={quoteattr(ref)}"
                + (f' value="{float(value):.3f}"' if value is not None else "")
                + (f' tool="{int(tool)}"' if tool is not None else "")
                + "/>\n")
        tmp.write_text(text, encoding="utf-8")
        # read it back once before the rename: the mod's first open is then
        # cheap (C0: 0.07-0.23 ms instead of 3.5-19 ms)
        tmp.read_bytes()
        os.replace(tmp, path)
        return path

    def fast(self) -> bool:
        """Whether a command went out in the last FAST_POLL_S seconds."""
        return self.clock() < self.fast_until

    def _clear(self) -> None:
        if self.cmd_dir is None or not self.cmd_dir.is_dir():
            return
        for f in list(self.cmd_dir.glob("*.xml")) + list(self.cmd_dir.glob("*.xml.tmp")):
            try:
                f.unlink()
            except OSError:
                pass
