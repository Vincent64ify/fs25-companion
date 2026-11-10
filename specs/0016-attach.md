# 0016: Attach

Status: approved
Mod: no change (0.17.2) · Started: 2026-11-10 · Design: [THEMES.md](../docs/THEMES.md#controls)

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
  three). Drive is in the column on every screen (Map, Vehicle, Loader,
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
| on which vehicle the game keeps `attachableInfo` with a front loader or a header: the tractor (root), or the loader whose joint is in reach | AttacherJoints.lua | unverified (the mod reads the vehicle and its root) |
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
   hint and quiet reason; nothing changed in 1.5 s, or "nothing in reach",
   shows "Failed" (`web/src/ui/control.js`, if a settle without a hint
   doesn't already).
3. `docs/THEMES.md`: the control column's Drive list gains Attach.
4. No mod change: `mod/tests/run.lua` already covers the reading and the
   command ("cab: attachable follows the game's attach prompt",
   "Attach stays a one-shot").

Risks: the reading may miss a front loader's or a header's prompt if the
game keeps `attachableInfo` on another vehicle; the live check says. Read
`AttacherJoints.lua` in gameSource.zip first, before the build.

## Acceptance

Automated:
- [ ] `mod/tests/run.lua`: the existing attach tests pass as they are.
- [ ] `web/test.html`: Drive shows six buttons, Attach last; Attach is
  unavailable on foot and without `attachable`, off with it.
- [ ] `web/test.html`: a press sends `hitch.toggle`; an ok followed by a
  new attached list ends the wait; an ok with no change in 1.5 s, and a
  "nothing in reach" answer, each say "Failed" on the button.
- [ ] `tests/test_golden.py` unchanged (nothing a viewer gets changes).
- [ ] Replay in the browser pane (`replay-solek`), 1180×820, day and
  night: Map, Vehicle, Loader and Harvester each show Attach as Drive's
  sixth button, faded in the replay (nothing in reach).

Live check (in game; Solek, mod 0.17.2):
- [ ] **A mower** (the T7.300 and the KDF): back up to it; Attach lights
  as the game's prompt shows; press it: attached, its card shows, Attach
  fades.
- [ ] **A trailer:** the same.
- [ ] **A front loader's bucket** (the L90H or a tractor with a loader):
  the same, with the loader's joint in reach.
- [ ] **A header on the combine:** the same, on the Harvester page.
- [ ] **Drive away** with something in reach: Attach fades with the
  game's prompt.
- [ ] **On foot:** Attach faded.

## Decisions

- In the Drive group, on every screen, not on the Vehicle page's rig
  strip: it's a tractor key, used before there's any card.
- "Failed" on the button instead of spec 0003's "None in reach" hint, as
  every press since spec 0013 revision 6.
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
