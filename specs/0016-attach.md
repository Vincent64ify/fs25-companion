# 0016: Attach

Status: live-checked
Mod: no change (0.17.3) · Started: 2026-11-10 · Design: [THEMES.md](../docs/THEMES.md#controls)

## Goal

Back up to a tool, a trailer, a header or a front loader and attach it
from the dashboard, as Q does in the game. Everything for it is still in
the code from spec 0003 (the mod's reading and command, the dashboard's
control); spec 0003's close (mod 0.8.17) only took the button off the
pages until it had a spec of its own. This is that spec: where the button
goes, how it answers, and a live check.

## Behaviour

- **Where:** the sixth button of the Drive group, after AI worker:
  Cruise −, Cruise, Cruise +, Engine, AI worker, Attach (two full rows of
  three: Engine is one column wide now, no longer two as in spec 0002). Drive is in the column on every screen (Map, Vehicle, Loader,
  Harvester), so Attach is too: you back up to a tool looking at the map
  as often as at the Vehicle page.
- **Always there, faded until something is in reach:** the button never
  comes and goes. It is unavailable (faded) on foot and while the game
  has nothing in reach; it lights as "off" (pressable) while the game's
  own Attach prompt is up, for anything the game would attach with Q.
- **A press** attaches what the game has in reach (its Q). Pending on
  touch-down, then pending until what's attached changes (at most 1.5 s);
  the card for the new tool appears on the Vehicle page by itself.
- **A press that attaches nothing** (it moved out of reach on the way, or
  the game didn't attach) says "Failed" on its button, as every other
  press (spec 0013 revision 6). No hint, no toast.
- **Attach only, never Detach:** in the game Q detaches the selected
  tool when nothing is in reach; the button doesn't. Detaching stays each
  card's Detach.
- **Icon:** the hitch icon (traced from the game's Attach Tool prompt).
- **Day and Night:** the control's usual states; nothing new. 1180×820
  and compact: the Drive group grows to two full rows; nothing else
  moves.

## Data contract

Nothing new: everything below is in the code since mod 0.8.7.

- **Mod → companion** (`cab`): `attachable` (boolean), true while
  something is in reach to attach; absent otherwise.
- **Web** (`web/src/types.js`): `cab.attachable`, as now.
- **Web** (`web/src/widgets/controls.js`): the `attach` control reads
  `cab.attachable`; its settle key is what's attached (`attachedSet`).

| Name | Where from | State |
|---|---|---|
| `ATTACH` input action (Q) | inputBinding.xml | verified ([GAME-API.md](../docs/GAME-API.md#c1-and-c2-lights-input-actions-cruise), C0's `csInput` and C2) |
| `spec_attacherJoints.attachableInfo.attachable`: the tool in reach, nil otherwise | AttacherJoints.lua | unverified (seen in spike 0.0.4; never followed live) |
| on which vehicle the game keeps `attachableInfo` with a front loader or a header: the driven vehicle's own, which `updateVehiclesInAttachRange` fills from its attached tools first (a loader's joint in reach is copied up) | AttacherJoints.lua (gameSource.zip, read 2026-11-10) | unverified live (the mod reads the vehicle and its root) |
| the `ATTACH` key's live label ("Attach"), the fallback when there's no `attachableInfo` | the game's action event | unverified |

## Commands

- **`hitch.toggle`** (the name stays: renaming it is a protocol change for
  nothing): no value. The mod presses `ATTACH` only while
  `VehicleState.attachable` is true, else answers "nothing in reach" and
  presses nothing. Not a switch, so no `.set` and no `already`. The mod
  doesn't check that something attached (no `checked`); the dashboard
  waits for the cab's attached list to change instead.

## Plan

1. `web/src/themes/newholland/theme.js`: `attach` at the end of the
   Drive group; drop the "Attach waits for its own spec" comments (the
   Vehicle and Harvester pages).
2. `web/src/widgets/controls.js`: the `attach` control's settle drops its
   hint and quiet reason and gains `fail`: nothing changed in 1.5 s shows
   "Failed" (`web/src/ui/control.js`'s new `settle.fail`; Engine's settle
   keeps its quiet end); "nothing in reach" is an ordinary failure.
   `theme.css`: Engine no longer spans two columns.
3. `docs/THEMES.md`: the control column's Drive list gains Attach.
4. No mod change: `mod/tests/run.lua` already covers the reading and the
   command ("cab: attachable follows the game's attach prompt",
   "Attach stays a one-shot").

Risks: the reading may miss a front loader's or a header's prompt if the
game keeps `attachableInfo` on another vehicle; the live check says. Read
`AttacherJoints.lua` in gameSource.zip first, before the build.

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: the existing attach tests pass as they are.
- [x] `web/test.html`: Drive shows six buttons, Attach last; Attach is
  unavailable on foot and without `attachable`, off with it.
- [x] `web/test.html`: a press sends `hitch.toggle`; an ok followed by a
  new attached list ends the wait; an ok with no change in 1.5 s, and a
  "nothing in reach" answer, each say "Failed" on the button.
- [x] `tests/test_golden.py` unchanged (nothing a viewer gets changes).
- [x] Replay in the browser pane (`replay-solek`), 1180×820, day and
  night: Map, Vehicle, Loader and Harvester each show Attach as Drive's
  sixth button, faded in the replay (nothing in reach); lit with the
  `attach` rig fixture's cab (Vehicle, day and night).

Live check (in game; Solek, mod 0.17.3):
- [x] **A mower** (the T7.300 and the KDF): back up to it; Attach lights
  as the game's prompt shows; press it: attached, its card shows, Attach
  fades. (2026-11-10: the KDF 341 S at the front, ok via ATTACH, its card
  back, Attach faded the same second.)
- [x] **A trailer:** the same. (The Versatile Nemesis and the Fliegl ASW
  271.)
- [x] **A front loader's bucket** (the L90H or a tractor with a loader):
  the same, with the loader's joint in reach. (The L90H's bucket, on the
  Loader page; the Kubota M8-201's whole M77 loader; then the Albutt
  Pallet Fork alone, detached from the M77 by its row: `attachable` true
  at once, Attach put it back on the loader.)
- [x] **A header on the combine:** the same, on the Harvester page. (The
  CH7.70 and the SuperFlex 25FT: "No header" with Attach lit, then the
  Header card filled in.)
- [x] **Drive away** with something in reach: Attach fades with the
  game's prompt. (The header off and in reach, then out of reach:
  `attachable` gone 12 s later, Attach faded.)
- [x] **On foot:** Attach faded.

## Decisions

- In the Drive group, on every screen, not on the Vehicle page's rig
  strip: it's a tractor key, used before there's any card.
- "Failed" on the button instead of spec 0003's "None in reach" hint, as
  every press since spec 0013 revision 6.
- **Engine one column wide** (built 2026-11-10): spec 0002 made it two
  wide to fill Drive's second row of five (Vincent, 2026-10-25); with six
  buttons the approved "two full rows of three" needs it one wide. The
  live check confirms or changes it.
- The mod doesn't check the attach (unlike Pipe, Tip side and Cover in
  spec 0014): the dashboard's wait for the attached list does the same,
  without a mod change.
- **Attach never turns into Detach** (Vincent, 2026-11-10, asked; Claude's
  answer): Q's detach-when-nothing-in-reach stays in the game. The
  dashboard has one control per action, and Detach is already on each
  card, for the tool it names; Q would detach whatever is selected, which
  the column can't show; and a tap just after the tool left reach would
  detach instead of attach. C2's first try ran DETACH and was dropped for
  the same reason.

## Out of scope / open questions

1. **Where:** Drive's sixth button on every screen (Vincent,
   2026-11-10).
2. **Pallets, big bags and bales** on a fork or a loader's hooks are
   mounted by other keys, not Q: out of scope. Only what the game's own
   Attach prompt offers.

## Log

- 2026-11-10: drafted from spec 0003's hidden Attach (Vincent: "can we
  bring this back easily?").
- 2026-11-10: approved by Vincent: Drive's sixth button on every screen,
  Attach only (never Detach), "Failed" on the button.
- 2026-11-10: built (no mod change). AttacherJoints.lua read first: the
  driven vehicle's `attachableInfo` holds what its tools find too, so the
  mod's reading covers loaders and headers. test.html first (4 new or
  changed checks failed, then passed; 319 green), pytest 122, golden
  unchanged. Engine one column wide so Drive is two rows of three
  (Decisions). Checked in the replay at 1180×820, day and night.
- 2026-11-10: live-checked (Solek, mod 0.17.3; pressed from the live
  dashboard, livewatch's acks and cab): a mower, a trailer, the L90H's
  bucket, a front loader and its fork on the loader's joint, a header,
  driving off and on foot, every press ok via ATTACH and Attach faded the
  same second. The names move to GAME-API.md. Seen on the way, not this
  spec: Also attached overlaps the cards on the M8-201's rig (NEXT.md).
