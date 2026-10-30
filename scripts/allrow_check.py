#!/usr/bin/env python3
"""Spec 0003 revision 2's live check: drive a rig as the dashboard does and
judge every answer against what the cab shows after.

    python scripts/allrow_check.py                     # the client's backend, 8123
    python scripts/allrow_check.py --backend http://localhost:8125 --rounds 3

With the game, the client and a rig of two or more working tools (front and
rear mowers): it connects as a viewer, presses the All row's and the cards'
buttons, waits for each answer, then until the tools stand still, and
prints one line per step: what it asked, the answer, what the cab showed,
pass or fail. The rule for every step: an ok means each tool reached the
asked state, a failure means one didn't. Then:

1. the All row from folded, raised and off: Unfold all, Lower all, Turn on
   all, Turn off all, Raise all, Fold all, `--rounds` times;
2. each card's Lower, Raise, Turn on, Turn off, Fold, Unfold;
3. mixed rigs, to learn the game's rule: one tool lowered then Lower all,
   one on then Turn on all, one folded then Fold all;
4. the engine off (the script turns it off and on again): every All row
   button must fail and nothing may move.

It changes the rig (that's the point): set it up, then let it run.
"""

import argparse
import asyncio
import itertools
import json
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

ACK_TIMEOUT_S = 8.0
# live (2026-10-30): the KDD 941 STH moves in stages with pauses between,
# and a press while it still moved got nothing; so each step waits for
# nothing to move for SETTLE_S, and at least STEP_MIN_S
SETTLE_S = 2.0
STEP_MIN_S = 4.0
SETTLE_MAX_S = 30.0

# the state each kind of button asks for, and the cab field that shows it
FIELDS = {"lower": "lowered", "fold": "unfolded", "turnOn": "turnedOn"}
ALL_ACTIONS = {"lower": "implement.lowerAll", "fold": "implement.foldAll", "turnOn": "implement.turnOnAll"}
TOOL_ACTIONS = {"lower": "implement.lower", "fold": "implement.fold", "turnOn": "implement.turnOn"}

Cab = Dict[str, Any]


def tools_of(cab: Cab) -> List[Dict[str, Any]]:
    """The rig's tools, the vehicle left out."""
    return [e for e in cab.get("rig") or [] if isinstance(e, dict) and e.get("depth", 0) > 0]


def has(e: Dict[str, Any], kind: str) -> bool:
    return kind in (e.get("can") or [])


def state(e: Dict[str, Any], kind: str) -> Optional[bool]:
    value = e.get(FIELDS[kind])
    return value if isinstance(value, bool) else None


def asked(cab: Cab, kind: str, tool_id: Optional[int] = None) -> Tuple[Dict[int, bool], str]:
    """The state each tool should reach, by the label's rule (the mod's too),
    and the label: Fold all folds while one is unfolded, Lower all lowers
    while one is raised, Turn on all turns on while one is off; a card's
    button toggles its tool. Tools already there aren't listed."""
    tools = [e for e in tools_of(cab) if has(e, kind)]
    if tool_id is not None:
        e = next((t for t in tools if t.get("id") == tool_id), None)
        if e is None:
            return {}, "?"
        now = state(e, kind)
        return {tool_id: not now}, {"lower": ("Raise", "Lower"), "fold": ("Unfold", "Fold"),
                                    "turnOn": ("Turn off", "Turn on")}[kind][0 if now else 1]
    if kind == "fold":
        want_unfolded = not any(state(e, "fold") is True for e in tools)
        label = "Unfold all" if want_unfolded else "Fold all"
        return {e["id"]: want_unfolded for e in tools if state(e, "fold") != want_unfolded}, label
    want = any(state(e, kind) is not True for e in tools)
    label = {"lower": ("Lower all", "Raise all"), "turnOn": ("Turn on all", "Turn off all")}[kind][0 if want else 1]
    return {e["id"]: want for e in tools if state(e, kind) != want}, label


def judge(kind: str, want: Dict[int, bool], ack: Optional[Dict[str, Any]], after: Cab,
          expect: str = "works", before: Optional[Cab] = None) -> Tuple[bool, str]:
    """Pass or fail, and what the cab showed. expect: "works" (an ok and
    every tool there), "blocked" (a failure and nothing changed), "learn"
    (either, as long as the answer matches what happened)."""
    by_id = {e.get("id"): e for e in tools_of(after)}
    reached = {i: state(by_id.get(i, {}), kind) == w for i, w in want.items()}
    shown = ", ".join(f"{by_id.get(i, {}).get('name', i)} {'there' if r else 'not there'}" for i, r in reached.items())
    if ack is None:
        return False, f"no answer; {shown or 'nothing asked'}"
    ok = ack.get("ok") is True
    all_there = all(reached.values())
    if expect == "blocked":
        changed = before is not None and any(
            state(e, kind) != state({x.get("id"): x for x in tools_of(before)}.get(e.get("id"), {}), kind)
            for e in tools_of(after))
        return (not ok and not changed), f"{'something moved' if changed else 'nothing moved'}"
    if ok and not all_there:
        return False, f"ok, but {shown}"
    if not ok and all_there and want:
        return False, f"failed ({ack.get('reason')}), but {shown}"
    if expect == "works" and not ok:
        return False, f"failed: {ack.get('reason')}; {shown}"
    return True, shown or "nothing to move"


class Rig:
    """A viewer on the backend: the latest cab, and the answers."""

    def __init__(self, ws):
        self.ws = ws
        self.cab: Cab = {}
        self.changed = time.monotonic()
        self.acks: Dict[str, Dict[str, Any]] = {}
        self.ids = itertools.count(1)

    async def listen(self) -> None:
        async for raw in self.ws:
            msg = json.loads(raw)
            if msg.get("type") == "snapshot":
                cab = (msg.get("topics") or {}).get("cab")
                if cab:
                    self.set_cab(cab["data"])
            elif msg.get("type") == "update" and msg["envelope"].get("topic") == "cab":
                self.set_cab(msg["envelope"]["data"])
            elif msg.get("type") == "command_ack":
                self.acks[msg["id"]] = msg

    def set_cab(self, cab: Cab) -> None:
        if cab != self.cab:
            self.cab, self.changed = cab, time.monotonic()

    async def press(self, action: str, value: Any = None) -> Optional[Dict[str, Any]]:
        cid = f"check-{next(self.ids)}"
        msg = {"type": "command", "id": cid, "action": action}
        if value is not None:
            msg["value"] = value
        await self.ws.send(json.dumps(msg))
        end = time.monotonic() + ACK_TIMEOUT_S
        while cid not in self.acks and time.monotonic() < end:
            await asyncio.sleep(0.02)
        return self.acks.get(cid)

    async def settle(self) -> None:
        """At least STEP_MIN_S, then until no fold moved and the cab stood
        still for SETTLE_S."""
        start = time.monotonic()
        still_since = start
        end = start + SETTLE_MAX_S
        while time.monotonic() < end:
            now = time.monotonic()
            if any(e.get("foldMoving") for e in tools_of(self.cab)) or now - self.changed < SETTLE_S:
                still_since = now
            if now - start >= STEP_MIN_S and now - still_since >= SETTLE_S:
                return
            await asyncio.sleep(0.05)
        print("      (still moving after %d s)" % SETTLE_MAX_S, flush=True)


class Run:
    def __init__(self, rig: Rig):
        self.rig = rig
        self.results: List[Tuple[str, bool]] = []

    async def step(self, name: str, kind: str, tool_id: Optional[int] = None, expect: str = "works") -> bool:
        await self.rig.settle()
        before = self.rig.cab
        print("      before:", "; ".join(
            f"{e.get('name')} lowered={e.get('lowered')} unfolded={e.get('unfolded')} on={e.get('turnedOn')}"
            + (" MOVING" if e.get("foldMoving") else "") for e in tools_of(before)), flush=True)
        want, label = asked(before, kind, tool_id)
        action = TOOL_ACTIONS[kind] if tool_id is not None else ALL_ACTIONS[kind]
        ack = await self.rig.press(action, tool_id)
        await self.rig.settle()
        passed, shown = judge(kind, want, ack, self.rig.cab, expect, before)
        answer = "no answer" if ack is None else ("ok" if ack.get("ok") else f"failed: {ack.get('reason')}")
        print(f"{'PASS' if passed else 'FAIL'}  {name:<28} {label:<13} {answer:<48} {shown}", flush=True)
        self.results.append((name, passed))
        return passed

    async def to(self, kind: str, value: bool) -> None:
        """Bring every tool to a state with the All row (setup, not judged)."""
        for _ in range(3):
            tools = [e for e in tools_of(self.rig.cab) if has(e, kind)]
            if all(state(e, kind) == value for e in tools):
                return
            await self.rig.press(ALL_ACTIONS[kind])
            await self.rig.settle()


async def main_async(args) -> int:
    import websockets

    info = json.load(urllib.request.urlopen(f"{args.backend}/api/info"))
    pairing = info.get("localPairing")
    if not pairing:
        print("the backend has no local pairing code: run the client with --local", file=sys.stderr)
        return 2
    url = args.backend.replace("http", "ws", 1) + f"/ws?pair={pairing}"
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"type": "hello", "role": "viewer"}))
        rig = Rig(ws)
        listener = asyncio.create_task(rig.listen())
        await asyncio.sleep(1.0)
        tools = tools_of(rig.cab)
        if len(tools) < 2:
            print(f"get in a vehicle with two or more tools first (found {len(tools)})", file=sys.stderr)
            return 2
        print("rig:", " | ".join(f"{e.get('name')} ({', '.join(e.get('can') or [])})" for e in tools))
        run = Run(rig)
        # 1. the All row, from folded, raised and off
        await run.to("turnOn", False)
        await run.to("lower", False)
        await run.to("fold", False)
        for r in range(1, args.rounds + 1):
            for name, kind in [("Unfold all", "fold"), ("Lower all", "lower"), ("Turn on all", "turnOn"),
                               ("Turn off all", "turnOn"), ("Raise all", "lower"), ("Fold all", "fold")]:
                await run.step(f"round {r}: {name}", kind)
        # 2. each card's buttons, unfolded and raised
        await run.to("fold", True)
        for e in tools_of(rig.cab):
            for kind in ("lower", "lower", "turnOn", "turnOn", "fold", "fold"):
                if has(e, kind):
                    await run.step(f"{e.get('name')}: {kind}", kind, e["id"])
        # 3. mixed rigs: the game's rule
        first = tools_of(rig.cab)[0]
        for kind, setup in (("lower", "lower"), ("turnOn", "turnOn"), ("fold", "fold")):
            if not has(first, kind):
                continue
            await run.to("fold", True)
            await run.to("lower", False)
            await run.to("turnOn", False)
            await rig.press(TOOL_ACTIONS[setup], first["id"])
            await rig.settle()
            await run.step(f"mixed: {first.get('name')} {setup}, then all", kind, expect="learn")
        # 4. the engine off: nothing may move
        await run.to("turnOn", False)
        await run.to("lower", False)
        await rig.press("engine.toggle")
        await asyncio.sleep(2.0)
        for name, kind in [("engine off: Fold all", "fold"), ("engine off: Lower all", "lower"),
                           ("engine off: Turn on all", "turnOn")]:
            await run.step(name, kind, expect="blocked")
        await rig.press("engine.toggle")
        listener.cancel()
    failed = [n for n, p in run.results if not p]
    print(f"\n{len(run.results) - len(failed)} of {len(run.results)} passed" + (": failed " + ", ".join(failed) if failed else ""))
    return 1 if failed else 0


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--backend", default="http://localhost:8123", help="the client's local backend")
    p.add_argument("--rounds", type=int, default=3)
    sys.exit(asyncio.run(main_async(p.parse_args())))


if __name__ == "__main__":
    main()
