"""Write the dashboard's commands where the mod reads them.

The server hands a viewer's command over as (ref, action, value), its
shape checked. This module writes it as it is; the mod checks the action
and its value against its own list (specs/0007):

    <profile>/modSettings/FS25_Companion/cmd/<n>.xml
    <command session="<sessionId>" id="<n>" action="lights.toggle" ref="<ref>"/>

numbered from 1 per game session (the hello's sessionId), continuing from
hello.commands.next when the companion starts mid-session. Each file is
written as <n>.xml.tmp, read back once, then renamed: the rename makes it
appear whole, and the read-back takes the ~4 ms first-open cost off the
game's frame (C0, docs/PLAN.md). The mod answers with a command_ack in the
stream; the file is deleted then.

A command that can't be written (no game session, replay, a mod before
0.9.0 that reads the game's names: hello.commands has no actions 2) is
answered at once with a command_ack of our own, so the dashboard isn't
left waiting.

`cruise.set` carries a value (the set speed, km/h, written as value="..")
and comes many times a second while a −/+ button is held. Only one is in
the game at a time: a newer one waits until the mod answers the last, and
replaces any that was waiting (that one is answered as superseded).
The slot is also freed by a same-session hello whose commands.next is past
it (the mod read it; its ack may have fallen in a rotation, specs/0004),
and given up when the next value comes after IN_GAME_TIMEOUT_S without an
answer.
"""

import logging
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple
from xml.sax.saxutils import quoteattr

log = logging.getLogger("companion.commands")

# latest wins: one in the game at a time, the newest waits
COALESCE = {"cruise.set"}

# poll the stream fast for this long after a command, so the ack and the
# new cab state go out as soon as the mod writes them
FAST_POLL_S = 2.0

# a coalesced command unanswered this long is given up for the next one
IN_GAME_TIMEOUT_S = 5.0

Envelope = Dict[str, Any]


def ack_envelope(ref: str, reason: str, ok: bool = False) -> Envelope:
    """A command_ack of our own (seq 0: not the mod's)."""
    return {"v": 1, "seq": 0, "t": 0, "topic": "command_ack",
            "data": {"ref": ref, "ok": ok, "reason": reason}}


class CommandWriter:
    """cmd_dir: the folder the mod reads, or None (replay: no game).
    put: where our own acks go (the server's Hub.put_ack)."""

    def __init__(self, cmd_dir: Optional[Path], put: Callable[[Envelope], None],
                 clock: Callable[[], float] = time.monotonic):
        self.cmd_dir = Path(cmd_dir) if cmd_dir is not None else None
        self.put = put
        self.clock = clock
        self.session: Optional[str] = None
        # the mod reads the dashboard's action names (hello.commands.actions
        # 2, specs/0007); a mod before 0.9.0 reads the game's
        self.mod_reads_names = True
        self.next_id = 1
        self.fast_until = 0.0
        # action -> (the id in the game, when it was written);
        # action -> (ref, value) waiting
        self._in_game: Dict[str, Tuple[int, float]] = {}
        self._waiting: Dict[str, Any] = {}

    def on_hello(self, hello: Dict[str, Any]) -> None:
        session = hello.get("sessionId")
        info = hello.get("commands") if isinstance(hello.get("commands"), dict) else {}
        mod_next = info.get("next") if isinstance(info.get("next"), int) else 1
        # a hello without commands (a replay) has no mod to ask
        self.mod_reads_names = not info or info.get("actions") == 2
        if session != self.session:
            self.session = session
            self.next_id = mod_next
            self._in_game.clear()
            self._waiting.clear()
            if mod_next == 1:
                # a new game session: what's left in cmd/ belongs to an older one
                self._clear()
        else:
            self.next_id = max(self.next_id, mod_next)
            # the mod read everything below next
            self._free(lambda cid: cid < mod_next)

    def on_ack(self, ack: Dict[str, Any]) -> None:
        """The mod answered command <id>: delete its file."""
        cid = ack.get("id")
        if not isinstance(cid, int) or self.cmd_dir is None:
            return
        self.next_id = max(self.next_id, cid + 1)
        try:
            (self.cmd_dir / f"{cid}.xml").unlink()
        except OSError:
            pass
        self._free(lambda in_game: in_game <= cid)

    def _free(self, done: Callable[[int], bool]) -> None:
        """Free the coalesced slots done says the mod is through with; their
        waiting values go in."""
        for action, (in_game, _) in list(self._in_game.items()):
            if done(in_game):
                del self._in_game[action]
                waiting = self._waiting.pop(action, None)
                if waiting is not None:
                    self.submit(waiting[0], action, waiting[1])

    def submit(self, ref: str, action: str, value: Any = None) -> None:
        """The server checked the shape; the mod checks the action and its
        value (specs/0007)."""
        if self.cmd_dir is None:
            self.put(ack_envelope(ref, "no game (replay)"))
            return
        if self.session is None:
            self.put(ack_envelope(ref, "game not running"))
            return
        if not self.mod_reads_names:
            self.put(ack_envelope(ref, "update the mod"))
            return
        if action in COALESCE and action in self._in_game:
            cid, since = self._in_game[action]
            if self.clock() - since > IN_GAME_TIMEOUT_S:
                log.warning("no answer to command %d in %.0f s: giving up on it", cid, IN_GAME_TIMEOUT_S)
                del self._in_game[action]
                replaced = self._waiting.pop(action, None)
                if replaced is not None:
                    self.put(ack_envelope(replaced[0], "superseded", ok=True))
        if action in COALESCE and action in self._in_game:
            replaced = self._waiting.get(action)
            if replaced is not None:
                self.put(ack_envelope(replaced[0], "superseded", ok=True))
            self._waiting[action] = (ref, value)
            self.fast_until = self.clock() + FAST_POLL_S
            return
        cid = self.next_id
        try:
            self.write(cid, action, ref, value)
        except OSError as e:
            log.warning("cannot write command %d: %s", cid, e)
            self.put(ack_envelope(ref, "cannot write the command file"))
            return
        self.next_id = cid + 1
        if action in COALESCE:
            self._in_game[action] = (cid, self.clock())
        self.fast_until = self.clock() + FAST_POLL_S

    def write(self, cid: int, action: str, ref: str, value: Any = None) -> Path:
        assert self.cmd_dir is not None
        self.cmd_dir.mkdir(parents=True, exist_ok=True)
        path = self.cmd_dir / f"{cid}.xml"
        tmp = path.with_name(path.name + ".tmp")
        text = ('<?xml version="1.0" encoding="utf-8" standalone="no"?>\n'
                f"<command session={quoteattr(str(self.session))} id=\"{cid}\" "
                f"action={quoteattr(action)} ref={quoteattr(ref)}"
                + (f' value="{float(value):.3f}"' if value is not None else "")
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
