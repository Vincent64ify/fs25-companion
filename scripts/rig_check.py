#!/usr/bin/env python3
"""The live check on any rig (specs 0003, 0012): press every button its cards
offer, as the dashboard does, and judge each answer against what the cab
shows after.

    python scripts/rig_check.py                        # the companion, 8123
    python scripts/rig_check.py --server http://localhost:8125 --attach

With the game, the companion and a rig (trailers, a sprayer, a plow, a baler, a
weight, a truck...): it connects as a viewer, prints what the dashboard
reads of each tool (to hold against the game's HUD), then for each tool and
each button of its card (its `can`, specs/0012) presses it there and back,
sending what the card sends:

* Fold, Lower, Turn on, Tip, Cover, Pipe, Rotate, Create fields,
  Automatic drop, Doubled rate, Auto (the application rate): an ok means
  the cab turned the asked way; a button the card fades (canNow) must be
  refused and nothing may change; a plow rotates raised and lowered;
* Rate + and Rate −: a step each way, refused while automatic or at an end;
* Tip side: one press per side, each a step on, back at the first;
* Reset bale count: the count goes to 0;
* Unload makes pallets of the tank: only with --unload;
* Tip all, Cover all with two tools or more;
* after every press the game's selection is the one it was;
* --attach: Attach with nothing in reach is refused; then back up to a tool
  and it attaches it.

Each line: PASS, FAIL or LOOK, the button, the answer, which way it went
(the key's input action, or "setter"), what the cab showed. Detach is never
pressed. It changes the rig: set it up (unfolded, raised, the engine
running, trailers loaded), then let it run.
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from allrow_check import Rig  # noqa: E402

Cab = Dict[str, Any]
Entry = Dict[str, Any]
Ack = Optional[Dict[str, Any]]
Verdict = Tuple[str, str]

# what each toggle reads in the cab, and the command its card button sends
READ = {"lower": ("lowered",), "fold": ("unfolded",), "turnOn": ("turnedOn",), "tip": ("discharging",),
        "cover": ("cover", "open"), "pipe": ("pipe", "out"), "rotate": ("plow", "rotated"),
        "createFields": ("createFields",), "autoDrop": ("autoDrop",), "doubledRate": ("doubledRate",),
        "sprayRateAuto": ("sprayRate", "auto")}
ACTION = {"lower": "tool.lower", "fold": "tool.fold", "turnOn": "tool.turnOn", "tip": "tool.tip",
          "cover": "implement.cover", "pipe": "tool.pipe", "rotate": "tool.rotate", "createFields": "tool.createFields",
          "autoDrop": "tool.autoDrop", "doubledRate": "tool.doubledRate", "sprayRateAuto": "tool.sprayRateAuto",
          "tipSide": "implement.tipSide", "bales": "tool.resetBales", "unload": "tool.unload"}
# one-shots by the tool's id as their value, or with their tool alone
BY_ID = {"cover", "tipSide"}
ONE_SHOTS = {"bales", "unload"}
# the order a player would go: unfold before lowering, lower before turning
# on; a can's sprayRate is its Auto, then a step each way
ORDER = ("fold", "lower", "turnOn", "rotate", "createFields", "autoDrop", "doubledRate", "sprayRate", "tipSide", "tip",
         "cover", "pipe", "bales", "unload")
ALL = {"tip": "implement.tipAll", "cover": "implement.coverAll"}
ATTACH_WAIT_S = 180.0


def entries(cab: Cab) -> List[Entry]:
    """What has a button: the tools, and the vehicle when it works itself."""
    return [e for e in cab.get("rig") or [] if isinstance(e, dict) and e.get("can")]


def by_id(cab: Cab, i: Any) -> Optional[Entry]:
    return next((e for e in cab.get("rig") or [] if isinstance(e, dict) and e.get("id") == i), None)


def read(e: Entry, cap: str) -> Optional[bool]:
    value: Any = e
    for key in READ[cap]:
        value = value.get(key) if isinstance(value, dict) else None
    return value if isinstance(value, bool) else None


def faded(e: Entry, cap: str) -> bool:
    return (e.get("canNow") or {}).get("sprayRate" if cap == "sprayRateAuto" else cap) is False


def sent_for(e: Entry, cap: str) -> Tuple[str, Any, Any]:
    """What the card's button sends (specs/0008, 0012): (action, value, tool)."""
    if cap in BY_ID:
        return ACTION[cap], e.get("id"), None
    if cap in ONE_SHOTS:
        return ACTION[cap], None, e.get("id")
    # the other state; fold's value says folded, the cab says unfolded
    now = bool(read(e, cap))
    return ACTION[cap], int(now) if cap == "fold" else int(not now), e.get("id")


def answer(ack: Ack) -> str:
    if ack is None:
        return "no answer"
    return "ok" if ack.get("ok") else f"failed: {ack.get('reason')}"


def refusal(before: Entry, cap: str, ack: Dict[str, Any], changed: bool) -> Verdict:
    """A button the card fades: refused, nothing changed."""
    if ack.get("ok") or changed:
        return "FAIL", f"faded ({(before.get('whyNot') or {}).get(cap)}), but {answer(ack)}" + (
            ", and it changed" if changed else "")
    why = (before.get("whyNot") or {}).get(cap)
    if why and ack.get("reason") != why:
        return "PASS", f"refused: {ack.get('reason')} (the card said {why})"
    return "PASS", f"refused, as faded: {ack.get('reason')}"


def judge_toggle(cap: str, before: Entry, after: Optional[Entry], ack: Ack,
                 seen: Optional[List[Entry]] = None) -> Verdict:
    """seen: the tool in every cab during the step; a tip may end by itself
    (the trailer empty) before the step's wait does."""
    if ack is None:
        return "FAIL", "no answer"
    if after is None:
        return "FAIL", "the tool is gone"
    was, now = read(before, cap), read(after, cap)
    if faded(before, cap):
        return refusal(before, cap, ack, now != was)
    if ack.get("ok"):
        if now != was:
            return "PASS", f"{was} -> {now}"
        if any(read(e, cap) not in (was, None) for e in seen or []):
            return "PASS", f"{was} -> {not was}, then back by itself"
        return "FAIL", f"ok, but {cap} stayed {was}"
    if now != was:
        return "FAIL", f"failed ({ack.get('reason')}), but {was} -> {now}"
    return "FAIL", f"refused: {ack.get('reason')}"


def side(e: Entry) -> str:
    t = e.get("tipSide") or {}
    return f"{t.get('name') or t.get('index')}"


def judge_tip_side(before: Entry, after: Optional[Entry], ack: Ack) -> Verdict:
    if ack is None or after is None:
        return "FAIL", "no answer" if ack is None else "the tool is gone"
    if faded(before, "tipSide"):
        return refusal(before, "tipSide", ack, before.get("tipSide") != after.get("tipSide"))
    t = after.get("tipSide") or {}
    where = f"({t.get('index')} of {t.get('count')})"
    moved = (before.get("tipSide") or {}).get("index") != t.get("index")
    if not ack.get("ok"):
        return "FAIL", f"{answer(ack)}" + (f", but {side(before)} -> {side(after)}" if moved else "")
    return ("PASS", f"{side(before)} -> {side(after)} {where}") if moved else \
        ("FAIL", f"ok, but still {side(after)} {where}")


def selected(cab: Cab) -> Optional[Entry]:
    return next((e for e in cab.get("rig") or [] if isinstance(e, dict) and e.get("selected")), None)


def judge_selection(before: Cab, after: Cab) -> Optional[str]:
    """None while the game's selection is the one it was, else what moved."""
    was, now = selected(before), selected(after)
    if (was or {}).get("id") == (now or {}).get("id"):
        return None
    return f"the selection moved from {(was or {}).get('name')} to {(now or {}).get('name')}"


def step_of(e: Optional[Entry]) -> Any:
    return ((e or {}).get("sprayRate") or {}).get("step")


def judge_rate(value: int, before: Entry, after: Optional[Entry], ack: Ack) -> Verdict:
    """Rate - or + (specs/0012): a step that way, or refused while automatic
    or at an end, nothing moved."""
    if ack is None or after is None:
        return "FAIL", "no answer" if ack is None else "the tool is gone"
    was, now = step_of(before), step_of(after)
    rate = before.get("sprayRate") or {}
    end = rate.get("min") if value < 0 else rate.get("max")
    refused = rate.get("auto") or faded(before, "sprayRate") or (was is not None and was == end)
    if refused:
        if ack.get("ok") or now != was:
            return "FAIL", f"should be refused, but {answer(ack)}, step {was} -> {now}"
        return "PASS", f"refused: {ack.get('reason')}"
    if ack.get("ok") and isinstance(was, int) and now == was + value:
        return "PASS", f"step {was} -> {now}"
    return "FAIL", f"{answer(ack)}, step {was} -> {now}"


def judge_unload(before: Entry, after: Optional[Entry], ack: Ack) -> Verdict:
    """Unload: the mod answers ok once it started (specs/0012); the pallets
    are for Vincent to see."""
    if ack is None or after is None:
        return "FAIL", "no answer" if ack is None else "the tool is gone"
    if faded(before, "unload"):
        return refusal(before, "unload", ack, False)
    return ("LOOK", "ok: pallets on the ground?") if ack.get("ok") else ("FAIL", answer(ack))


def judge_bales(before: Entry, after: Optional[Entry], ack: Ack) -> Verdict:
    if ack is None or not ack.get("ok"):
        return "FAIL", answer(ack)
    was = ((before.get("bales") or {}).get("count"))
    now = (((after or {}).get("bales") or {}).get("count"))
    if not was:
        return "LOOK", f"the count was {was}: make a bale or two first"
    return ("PASS", f"{was} -> {now}") if now == 0 else ("FAIL", f"ok, but {was} -> {now}")


def judge_all(cap: str, want: bool, before: Cab, after: Cab, ack: Ack) -> Verdict:
    """Tip all, Cover all: an ok means every tool got there, a failure that
    one didn't (its name in the reason)."""
    if ack is None:
        return "FAIL", "no answer"
    asked = [e for e in entries(before) if cap in e["can"] and read(e, cap) != want]
    # by id: two trailers of one model share a name (live 2026-10-31)
    reached = {e["id"]: read(by_id(after, e["id"]) or {}, cap) == want for e in asked}
    names = {e["id"]: e.get("name") for e in asked}
    shown = ", ".join(f"{names[i]} {'there' if r else 'not there'}" for i, r in reached.items()) or "nothing to move"
    if ack.get("ok") and not all(reached.values()):
        return "FAIL", f"ok, but {shown}"
    if not ack.get("ok") and all(reached.values()) and reached:
        return "FAIL", f"failed ({ack.get('reason')}), but {shown}"
    return "PASS", shown


def moving(cab: Cab) -> bool:
    return any(e.get("foldMoving") or (e.get("pipe") or {}).get("moving") for e in cab.get("rig") or []
               if isinstance(e, dict))


class Check:
    def __init__(self, rig: Rig):
        self.rig = rig
        self.results: List[Tuple[str, str]] = []

    def say(self, verdict: str, name: str, ack: Ack, shown: str) -> None:
        via = (ack or {}).get("via") or ""
        print(f"{verdict:<5} {name:<36} {answer(ack):<44} {via:<22} {shown}", flush=True)
        self.results.append((name, verdict))

    async def press(self, name: str, action: str, value: Any, judge, tool: Any = None) -> Ack:
        await self.rig.settle()
        before = self.rig.cab
        self.rig.seen = []
        ack = await self.rig.press(action, value, tool)
        await self.rig.settle()
        after = self.rig.cab
        verdict, shown = judge(before, after, ack)
        moved = judge_selection(before, after)
        if moved and action not in ("implement.select",):
            verdict, shown = "FAIL", f"{shown}; {moved}"
        self.say(verdict, name, ack, shown)
        return ack

    async def send(self, name: str, e: Entry, cap: str, judge) -> Ack:
        """The card's button for cap, as the card sends it."""
        action, value, tool = sent_for(by_id(self.rig.cab, e["id"]) or e, cap)
        return await self.press(name, action, value, judge, tool)

    async def toggle(self, e: Entry, cap: str, note: str = "") -> None:
        for _ in range(2):
            now = by_id(self.rig.cab, e["id"]) or e
            to = f" to {now.get('tipTo')}" if cap == "tip" else ""
            label = f"{e.get('name')}: {cap}{note} ({read(now, cap)}){to}"
            await self.send(label, e, cap,
                            lambda b, a, ack: judge_toggle(cap, by_id(b, e["id"]) or {}, by_id(a, e["id"]), ack,
                                                           [x for c in self.rig.seen if (x := by_id(c, e["id"]))]))

    async def rate(self, e: Entry) -> None:
        """Auto off, a step up and down, Auto as it was (specs/0012)."""
        auto = read(by_id(self.rig.cab, e["id"]) or e, "sprayRateAuto")
        for value in (1, -1):
            await self.press(f"{e.get('name')}: rate {value:+d} (automatic {auto})", "tool.sprayRate", value,
                             lambda b, a, ack, v=value: judge_rate(v, by_id(b, e["id"]) or {}, by_id(a, e["id"]), ack),
                             e["id"])
        await self.toggle(e, "sprayRateAuto")
        if auto is not False:
            # automatic off now (the toggle went there and back): off once more
            await self.send(f"{e.get('name')}: automatic off", e, "sprayRateAuto",
                            lambda b, a, ack: judge_toggle("sprayRateAuto", by_id(b, e["id"]) or {},
                                                           by_id(a, e["id"]), ack))
            for value in (1, -1):
                await self.press(f"{e.get('name')}: rate {value:+d} (manual)", "tool.sprayRate", value,
                                 lambda b, a, ack, v=value: judge_rate(v, by_id(b, e["id"]) or {},
                                                                       by_id(a, e["id"]), ack), e["id"])
            await self.send(f"{e.get('name')}: automatic back on", e, "sprayRateAuto",
                            lambda b, a, ack: judge_toggle("sprayRateAuto", by_id(b, e["id"]) or {},
                                                           by_id(a, e["id"]), ack))

    async def tool(self, e: Entry, unload: bool) -> None:
        caps = [c for c in ORDER if c in e["can"]]
        for cap in caps:
            if cap in READ:
                await self.toggle(e, cap)
            if cap == "rotate" and "lower" in caps:
                # rotate raised (above) and lowered: which the game allows
                await self.send(f"{e.get('name')}: lower for rotate", e, "lower",
                                lambda b, a, ack: judge_toggle("lower", by_id(b, e["id"]) or {},
                                                               by_id(a, e["id"]), ack))
                await self.toggle(e, "rotate", " lowered")
                await self.send(f"{e.get('name')}: raise again", e, "lower",
                                lambda b, a, ack: judge_toggle("lower", by_id(b, e["id"]) or {},
                                                               by_id(a, e["id"]), ack))
            elif cap == "sprayRate":
                await self.rate(e)
            elif cap == "tipSide":
                count = ((by_id(self.rig.cab, e["id"]) or e).get("tipSide") or {}).get("count") or 1
                for n in range(count):
                    await self.send(f"{e.get('name')}: tip side {n + 1}", e, cap,
                                    lambda b, a, ack: judge_tip_side(by_id(b, e["id"]) or {},
                                                                     by_id(a, e["id"]), ack))
            elif cap == "bales":
                await self.send(f"{e.get('name')}: reset count", e, cap,
                                lambda b, a, ack: judge_bales(by_id(b, e["id"]) or {}, by_id(a, e["id"]), ack))
            elif cap == "unload":
                if not unload:
                    print(f"skip  {e.get('name')}: Unload (makes pallets of the tank; --unload presses it)", flush=True)
                    continue
                await self.send(f"{e.get('name')}: unload", e, cap,
                                lambda b, a, ack: judge_unload(by_id(b, e["id"]) or {}, by_id(a, e["id"]), ack))

    async def all_row(self) -> None:
        for cap, action in ALL.items():
            if len([e for e in entries(self.rig.cab) if cap in e["can"]]) < 2:
                continue
            for want in (True, False):
                await self.press(f"{'Tip' if cap == 'tip' else 'Cover'} all -> {want}", action, int(want),
                                 lambda b, a, ack: judge_all(cap, want, b, a, ack))

    async def attach(self) -> None:
        if not self.rig.cab.get("attachable"):
            await self.press("Attach, nothing in reach", "hitch.toggle", None,
                             lambda b, a, ack: (("PASS", f"refused: {ack.get('reason')}")
                                                if ack and not ack.get("ok") and len(a.get("rig") or [])
                                                == len(b.get("rig") or []) else ("FAIL", answer(ack))))
            print(f"      back up to a tool until the game offers Attach (waiting up to {ATTACH_WAIT_S:.0f} s)",
                  flush=True)
            end = time.monotonic() + ATTACH_WAIT_S
            while not self.rig.cab.get("attachable") and time.monotonic() < end:
                await asyncio.sleep(0.2)
            if not self.rig.cab.get("attachable"):
                self.say("FAIL", "Attach lights up", None, "cab.attachable never came")
                return
            print("      in reach: stop there", flush=True)
            await asyncio.sleep(2.0)
        await self.press("Attach", "hitch.toggle", None,
                         lambda b, a, ack: (("PASS", f"{len(b.get('rig') or [])} -> {len(a.get('rig') or [])} "
                                                     "in the rig") if ack and ack.get("ok") and
                                            len(a.get("rig") or []) > len(b.get("rig") or [])
                                            else ("FAIL", f"{answer(ack)}; the rig {len(a.get('rig') or [])}")))


def readings(cab: Cab, vehicles: Dict[str, Any]) -> None:
    """What the dashboard reads of each tool, to hold against the HUD."""
    fills = {}
    for v in vehicles.get("vehicles") or []:
        for x in [v] + list(v.get("implements") or []):
            fills[x.get("id")] = x.get("fills") or []
    print("readings (hold them against the game's HUD):")
    for e in cab.get("rig") or []:
        states = {k: e[k] for k in ("lowered", "unfolded", "turnedOn", "discharging", "tipSide", "cover", "pipe",
                                    "plow", "createFields", "autoDrop", "bales", "doubledRate", "sprayRate", "tipTo")
                  if k in e}
        print(f"  {'  ' * e.get('depth', 0)}{e.get('name')}{' (selected)' if e.get('selected') else ''}: "
              f"can {', '.join(e.get('can') or []) or '-'}; {json.dumps(states, ensure_ascii=False)}")
        for f in fills.get(e.get("id")) or []:
            print(f"  {'  ' * e.get('depth', 0)}  {f.get('fillTitle')}: {f.get('level'):.0f} / {f.get('capacity')}")
        for cap, why in (e.get("whyNot") or {}).items():
            print(f"  {'  ' * e.get('depth', 0)}  {cap} faded: {why}")
    print(flush=True)


class Viewer(Rig):
    """The rig, the vehicles topic too, and still while a pipe moves."""

    def __init__(self, ws, trace=None):
        super().__init__(ws)
        self.vehicles: Dict[str, Any] = {}
        # every cab since the last press
        self.seen: List[Cab] = []
        # every cab and answer as it came: the stream file rotates (live 2026-10-31)
        self.trace = trace

    def note(self, kind: str, data: Any) -> None:
        if self.trace:
            self.trace.write(json.dumps({"t": round(time.time(), 2), kind: data}, ensure_ascii=False) + "\n")
            self.trace.flush()

    def set_cab(self, cab: Cab) -> None:
        if cab != self.cab:
            self.note("cab", cab)
            self.seen.append(cab)
        super().set_cab(cab)

    async def listen(self) -> None:
        async for raw in self.ws:
            msg = json.loads(raw)
            if msg.get("type") == "snapshot":
                topics = msg.get("topics") or {}
                if topics.get("cab"):
                    self.set_cab(topics["cab"]["data"])
                if topics.get("vehicles"):
                    self.vehicles = topics["vehicles"]["data"]
            elif msg.get("type") == "update":
                topic = msg["envelope"].get("topic")
                if topic == "cab":
                    self.set_cab(msg["envelope"]["data"])
                elif topic == "vehicles":
                    self.vehicles = msg["envelope"]["data"]
            elif msg.get("type") == "command_ack":
                self.note("ack", msg)
                self.acks[msg["id"]] = msg

    async def press(self, action: str, value: Any = None, tool: Any = None) -> Ack:
        self.note("press", {"action": action, "value": value, **({"tool": tool} if tool is not None else {})})
        return await super().press(action, value, tool)

    async def settle(self) -> None:
        end = time.monotonic() + 30.0
        while moving(self.cab) and time.monotonic() < end:
            await asyncio.sleep(0.05)
        await super().settle()


async def main_async(args) -> int:
    import websockets

    url = args.server.replace("http", "ws", 1).rstrip("/") + "/ws"
    async with websockets.connect(url) as ws:
        trace = open(args.trace, "w", encoding="utf-8") if args.trace else None
        rig = Viewer(ws, trace)
        listener = asyncio.create_task(rig.listen())
        await asyncio.sleep(1.5)
        if not rig.cab.get("inVehicle"):
            print("get in the rig's vehicle first", file=sys.stderr)
            return 2
        readings(rig.cab, rig.vehicles)
        check = Check(rig)
        if not rig.cab.get("engineOn"):
            print("      starting the engine", flush=True)
            await rig.press("engine.set", 1)
            await asyncio.sleep(3.0)
        for e in entries(rig.cab):
            if args.only and args.only.lower() not in str(e.get("name")).lower() and args.only != str(e.get("id")):
                continue
            await check.tool(e, args.unload)
        if not args.only:
            await check.all_row()
        if args.attach:
            await check.attach()
        listener.cancel()
        if trace:
            trace.close()
    counts = {v: sum(1 for _, x in check.results if x == v) for v in ("PASS", "FAIL", "LOOK")}
    failed = [n for n, v in check.results if v == "FAIL"]
    look = [n for n, v in check.results if v == "LOOK"]
    print(f"\n{counts['PASS']} passed, {counts['FAIL']} failed, {counts['LOOK']} to look at"
          + ("\nfailed: " + "; ".join(failed) if failed else "") + ("\nlook: " + "; ".join(look) if look else ""))
    return 1 if failed else 0


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--server", default="http://localhost:8123", help="the companion (python -m companion)")
    p.add_argument("--unload", action="store_true", help="press Unload too (it makes pallets of the tank)")
    p.add_argument("--only", help="only the tools whose name has this, or this id")
    p.add_argument("--trace", help="write every cab, press and answer to this file (ndjson)")
    p.add_argument("--attach", action="store_true", help="end with Attach: refused, then back up to a tool")
    sys.exit(asyncio.run(main_async(p.parse_args())))


if __name__ == "__main__":
    main()
