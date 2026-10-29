"""Write the dashboard's commands where the mod reads them.

The backend forwards a viewer's command as {"type": "command", "ref",
"action"}. This module maps the dashboard's action to the game's input
action and writes

    <profile>/modSettings/FS25_Companion/cmd/<n>.xml
    <command session="<sessionId>" id="<n>" action="TOGGLE_LIGHTS" ref="<ref>"/>

numbered from 1 per game session (the hello's sessionId), continuing from
hello.commands.next when the client starts mid-session. Each file is
written as <n>.xml.tmp, read back once, then renamed: the rename makes it
appear whole, and the read-back takes the ~4 ms first-open cost off the
game's frame (C0, docs/PLAN.md). The mod answers with a command_ack in the
stream; the file is deleted then.

A command that can't be written (no game session, replay) is answered at
once with a command_ack of our own, so the dashboard isn't left waiting.

`cruise.set` carries a value (the set speed, km/h, written as value="..")
and comes many times a second while a −/+ button is held. Only one is in
the game at a time: a newer one waits until the mod answers the last, and
replaces any that was waiting (that one is answered as superseded).
"""

import logging
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from xml.sax.saxutils import quoteattr

log = logging.getLogger("companion.commands")

# dashboard action -> the game's input action. The client's own allow-list:
# anything else is refused before a file is written.
ACTIONS = {
    "lights.toggle": "TOGGLE_LIGHTS",
    "highBeam.toggle": "TOGGLE_HIGH_BEAM_LIGHT",
    "beacon.toggle": "TOGGLE_BEACON_LIGHTS",
    "hazard.toggle": "TOGGLE_TURNLIGHT_HAZARD",
    "turnLeft.toggle": "TOGGLE_TURNLIGHT_LEFT",
    "turnRight.toggle": "TOGGLE_TURNLIGHT_RIGHT",
    "engine.toggle": "TOGGLE_MOTOR_STATE",
    "cruise.toggle": "TOGGLE_CRUISE_CONTROL",
    "cruise.down": "CRUISE_SPEED_DOWN",
    "cruise.up": "CRUISE_SPEED_UP",
    "ai.toggle": "TOGGLE_AI",
    # the selected implement, as its keys act on it
    "implement.lower": "LOWER_IMPLEMENT",
    "implement.fold": "FOLD_IMPLEMENT",
    "implement.turnOn": "TURN_ON_IMPLEMENT",
    # the attach key (Q)
    "hitch.toggle": "HITCH",
    # the cruise set speed for the current direction, km/h
    "cruise.set": "CRUISE_SET_SPEED",
    # C3: pick one implement; select and detach carry the tool's id (the
    # cab's rig), next and previous are G both ways
    "implement.select": "SELECT_IMPLEMENT",
    "implement.next": "SELECT_NEXT_IMPLEMENT",
    "implement.previous": "SELECT_PREVIOUS_IMPLEMENT",
    "implement.detach": "DETACH_IMPLEMENT",
    # the Implement screen: lower all (Ctrl+V), the pipe (O), unload or tip
    # (I, else Ctrl+I), the cover (N)
    "implement.lowerAll": "LOWER_ALL_IMPLEMENTS",
    "implement.pipe": "TOGGLE_PIPE",
    "implement.unload": "TOGGLE_DISCHARGE",
    "implement.cover": "TOGGLE_COVER",
    # the Harvester screen: a combine's straw, swath or chopped
    "implement.straw": "TOGGLE_STRAW",
    # the Vehicle page's cards (specs/0003): with the tool's id, the
    # one-tool actions above and these select it, press its key and put the
    # selection back; key: the selected tool's other key, by number
    "implement.tipSide": "TOGGLE_TIPSIDE",
    "implement.rotate": "ROTATE_PLOW",
    "implement.baleReset": "RESET_BALE_COUNTER",
    "implement.key": "PRESS_TOOL_KEY",
    # the All row: fold and turn on all are the game's keys; tip and cover
    # all (1 tip / open, 0 stop / close) act on each tool in turn
    "implement.foldAll": "FOLD_ALL_IMPLEMENTS",
    "implement.turnOnAll": "TURN_ON_ALL_IMPLEMENTS",
    "implement.tipAll": "TIP_ALL",
    "implement.coverAll": "COVER_ALL",
}

# actions that carry a value, and its range; the backend checks the same
VALUES = {
    "cruise.set": (1.0, 250.0),
    "implement.select": (0, 2**31),
    "implement.detach": (0, 2**31),
    **{a: (0, 2**31) for a in ("implement.lower", "implement.fold", "implement.turnOn", "implement.unload",
                               "implement.cover", "implement.pipe", "implement.tipSide", "implement.rotate",
                               "implement.baleReset")},
    "implement.key": (1, 64),
    "implement.tipAll": (0, 1),
    "implement.coverAll": (0, 1),
}

# actions whose value may also be left out (the tool the key acts on)
OPTIONAL = {"implement.lower", "implement.fold", "implement.turnOn", "implement.unload", "implement.cover",
            "implement.pipe", "implement.tipSide", "implement.rotate", "implement.baleReset"}

# latest wins: one in the game at a time, the newest waits
COALESCE = {"cruise.set"}

# poll the stream fast for this long after a command, so the ack and the
# new cab state go out as soon as the mod writes them
FAST_POLL_S = 2.0

Envelope = Dict[str, Any]


def ack_envelope(ref: str, reason: str, ok: bool = False) -> Envelope:
    """A command_ack from the client itself (seq 0: not the mod's)."""
    return {"v": 1, "seq": 0, "t": 0, "topic": "command_ack",
            "data": {"ref": ref, "ok": ok, "reason": reason}}


def value_ok(action: str, value: Any) -> bool:
    limits = VALUES.get(action)
    if limits is None:
        return value is None
    if value is None and action in OPTIONAL:
        return True
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return limits[0] <= value <= limits[1]


class CommandWriter:
    """cmd_dir: the folder the mod reads, or None (replay: no game).
    put: where client-made acks go (the outbox)."""

    def __init__(self, cmd_dir: Optional[Path], put: Callable[[Envelope], None],
                 clock: Callable[[], float] = time.monotonic):
        self.cmd_dir = Path(cmd_dir) if cmd_dir is not None else None
        self.put = put
        self.clock = clock
        self.session: Optional[str] = None
        self.next_id = 1
        self.fast_until = 0.0
        # action -> the id in the game; action -> (ref, value) waiting
        self._in_game: Dict[str, int] = {}
        self._waiting: Dict[str, Any] = {}

    def on_hello(self, hello: Dict[str, Any]) -> None:
        session = hello.get("sessionId")
        info = hello.get("commands") if isinstance(hello.get("commands"), dict) else {}
        mod_next = info.get("next") if isinstance(info.get("next"), int) else 1
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
        for action, in_game in list(self._in_game.items()):
            if in_game <= cid:
                del self._in_game[action]
                waiting = self._waiting.pop(action, None)
                if waiting is not None:
                    self.submit(waiting[0], action, waiting[1])

    def submit(self, ref: str, action: str, value: Any = None) -> None:
        game_action = ACTIONS.get(action)
        if game_action is None:
            self.put(ack_envelope(ref, "action not allowed"))
            return
        if not value_ok(action, value):
            self.put(ack_envelope(ref, "value not allowed"))
            return
        if self.cmd_dir is None:
            self.put(ack_envelope(ref, "no game (replay)"))
            return
        if self.session is None:
            self.put(ack_envelope(ref, "game not running"))
            return
        if action in COALESCE and action in self._in_game:
            replaced = self._waiting.get(action)
            if replaced is not None:
                self.put(ack_envelope(replaced[0], "superseded", ok=True))
            self._waiting[action] = (ref, value)
            self.fast_until = self.clock() + FAST_POLL_S
            return
        cid = self.next_id
        try:
            self.write(cid, game_action, ref, value)
        except OSError as e:
            log.warning("cannot write command %d: %s", cid, e)
            self.put(ack_envelope(ref, "cannot write the command file"))
            return
        self.next_id = cid + 1
        if action in COALESCE:
            self._in_game[action] = cid
        self.fast_until = self.clock() + FAST_POLL_S

    def write(self, cid: int, game_action: str, ref: str, value: Any = None) -> Path:
        assert self.cmd_dir is not None
        self.cmd_dir.mkdir(parents=True, exist_ok=True)
        path = self.cmd_dir / f"{cid}.xml"
        tmp = path.with_name(path.name + ".tmp")
        text = ('<?xml version="1.0" encoding="utf-8" standalone="no"?>\n'
                f"<command session={quoteattr(str(self.session))} id=\"{cid}\" "
                f"action={quoteattr(game_action)} ref={quoteattr(ref)}"
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
