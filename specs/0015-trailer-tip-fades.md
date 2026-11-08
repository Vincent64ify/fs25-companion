# 0015: Trailer: Tip fades when the game won't tip

Status: live-checked
Mod: 0.17.1 (0.17.0 built the side fades, gone in 0.17.1) · Started: 2026-11-08 · From: [NEXT.md](../docs/NEXT.md) ("Tip fades when the game won't tip"); rule 2 of [spec 0012](0012-card-buttons.md)

## Goal

A trailer's Tip stays live with the engine off, where the game never
tips, and only answers "Nothing moved" after the check's wait (spec
0008's live check, the Vestrum 100 with two EDK 650). Fold and Lower
already fade at once with the game's words there; Tip does too, so the
button tells the player before the tap, as every other card button does
(rule 2).

(Drafted with two more fades, a tip side whose XML says it can't tip and
one that can't tip empty, for the EDK 650's Grain door. The live check
showed the Grain door isn't such a side, and no trailer on the farm has
one, so they went in 0.17.1: see the Log and NEXT.md.)

## Behaviour

On a trailer's card (and every tool with `tip`):

- **The engine off:** Tip is faded with the game's words ("Please start
  the engine first"), as Fold and Lower are. Stop isn't affected: the
  game stops tipping when the engine goes off (Dischargeable
  `onStateChange`).
- **Tip all:** faded, with the first tool's reason, when every trailer's
  Tip is faded (as Lower all and Fold all do).
- A tap on a faded Tip does nothing (spec 0010).
- Unchanged: Tip over land that isn't ours, or where the game finds no
  room on the ground (a trailer hitched behind blocking the Grain door's
  discharge line), stays live; the game warns on its own screen and the
  button says "Failed". Those depend on where the trailer is (Out of
  scope).

Day and Night as today; nothing new on screen besides the fade.

## Data contract

- **Mod → companion** (`cab` topic, rig entries): `canNow.tip` false and
  `whyNot.tip` with the engine off. No new field (Protocol v1).
- **Web:** `allActions`' Tip all gains `unavailable` and `note` when every
  trailer's Tip is faded (`web/src/data/selectors.js`). Each card's Tip
  already fades by `canNow` (`vehicleTools.js`).

Game API names used (the SDK's gameSource.zip: Dischargeable.lua,
Trailer.lua):

| Name | Where from | State |
|---|---|---|
| `TOGGLE_TIPSTATE`, `TOGGLE_TIPSTATE_GROUND` are powered keys (`addPoweredActionEvent`) | Dischargeable.lua | verified (DONE.md, spec 0015: faded with the engine off, live again at "starting") |

## Commands

None new. `tool.tip` and `implement.tipAll` refuse a faded Tip at once
with `whyNot.tip` (`stepFor`, as every capability), instead of pressing
the key and answering "Nothing moved" after the wait. Stop (value 0)
is never refused by these.

## Plan

- `mod/src/state/Tools.lua` (`nowOf`): `refuse("tip", power, noPower)`
  while not discharging (0.17.0 also read the side's `canTip` and
  `canTipIfEmpty`; removed in 0.17.1).
- `mod/src/Commands.lua`: no change. Stop stays allowed because the
  fades apply only while not discharging, so `stepFor` never refuses
  `tool.tip 0` while a trailer tips.
- `web/src/data/selectors.js`: Tip all's fade; `web/test.html` case.
- Tests first: `mod/tests/run.lua` (the EDK 650 spike rig: engine off,
  Stop while discharging with the engine off, and since 0.17.1 a side the
  XML says can't tip staying live); `web/test.html` (Tip all).
- `mod/modDesc.xml` and `Companion.VERSION`: 0.17.0, then 0.17.1.
  NEXT.md: the item goes.

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: the engine off → `canNow.tip` false,
  `whyNot.tip` the game's power words; `tool.tip 1` refused at once with
  them, nothing pressed.
- [x] ~~`mod/tests/run.lua`: the side with `canTip` false → faded~~ and
  ~~`canTipIfEmpty` false and the tank empty → faded~~: removed in 0.17.1;
  now a test that such a side stays live (nothing read).
- [x] `mod/tests/run.lua`: discharging, then the engine off: `tool.tip 0`
  still runs (not refused).
- [x] ~~`mod/tests/run.lua`: Tip all with one trailer faded tips the other
  and names the faded one~~: with only the engine fade, every trailer
  fades together; now Tip all with the engine off is refused at once,
  nothing pressed.
- [x] `web/test.html`: Tip all faded with the first reason when every
  trailer's Tip is faded; live when one isn't.
- [x] `python -m pytest mod/tests companion/tests tests` green; golden
  unchanged, or regenerated on purpose if the replay has a trailer with
  the engine off.

Live check (Solek, mod 0.17.0, the Vestrum 100 with the two EDK 650,
`scripts/livewatch.py` running):
- [x] Engine off: both Tips and Tip all faded; a tap does nothing.
  Engine on: live again. (Vincent: "engine-off fade was good".)
- ~~One trailer on the Grain door: its Tip faded~~, ~~`canTip` and the
  side index read~~, ~~empty with `canTipIfEmpty` false~~: dropped with
  the side fades (Vincent, 2026-11-08: no trailer here can test them).

## Decisions

- Only the engine fade: the side fades (`canTip`, `canTipIfEmpty`)
  follow the game's script but no trailer on the farm has such a side,
  so nothing could check them (Vincent, 2026-11-08: remove). NEXT.md
  keeps a note for a trailer that has one.
- No fade by position (land access, room on the ground, a sale point
  that doesn't take the load): it changes as the trailer moves and the
  game checks it on the press; the check's answer covers it.

## Out of scope / open questions

- The game's own reason in Tip's answer when the check finds nothing
  moved: not wanted (Vincent, 2026-11-08). A press that does nothing
  shows on the button itself ("Nothing moved"), as today; no toasts or
  notifications anywhere.

## Log

- 2026-11-08: drafted from NEXT.md, with Dischargeable.lua and
  Trailer.lua read from the SDK's gameSource.zip. Approved by Vincent.
- 2026-11-08: built, mod 0.17.0. `nowOf` in `state/Tools.lua` fades Tip
  (power, the side's `canTip`, `canTipIfEmpty` with the tank empty),
  never while discharging; `allActions` fades Tip all when every Tip is
  faded. Tests: "capabilities, trailer: Tip fades..." and "commands,
  trailer: a faded Tip is refused at once..." in `run.lua`, "Tip all
  faded..." in `web/test.html` (all green). Tip all with one faded
  answers ok and names it, as before. Live check open.
- 2026-11-08: live check, Solek, mod 0.17.0, the Vestrum 100 with two
  EDK 650 (`livewatch.py`, the stream archived). Engine off: both Tips
  faded with "Please start the engine first!" and Tip all faded; taps on
  them sent nothing. Engine on from the dashboard: both live again, at
  "starting", 4 s before `engineOn` (the game counts a starting engine as
  powered, as for Fold). The Grain door: not faded, and rightly: the EDK
  650's XML (`data/vehicles/farmtech/edk650/edk650.xml`) has no `canTip`
  on it; it's a side with a door animation and a narrow discharge node
  (0.5 m). Tip there answered "Nothing moved" again, the game's key the
  one it showed ("Unload here"); Vincent: the game warned "This action
  cannot be performed here" (Dischargeable `getCanDischargeAtPosition`),
  on the front trailer (parsnips) only while the second trailer was
  hitched behind it: detached, it dumped through the Grain door. So spec
  0012's "Grain door never tips" was the trailer behind blocking the
  door's discharge line, not the side. The door-only fade stays (the
  game's script; guarded), unchecked; the Grain door box dropped.
- 2026-11-08: Vincent: the engine-off fade was good (box ticked); the
  side fades removed, as no trailer here can test them (mod 0.17.1,
  `nowOf` fades Tip by power only; the run.lua tests rewritten: engine
  off, Stop while tipping, a can't-tip side staying live; Tip all with
  the engine off refused at once). NEXT.md notes them for a trailer that
  has such a side. Live-checked.
