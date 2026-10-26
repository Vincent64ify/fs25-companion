# 0003: Implement screen

Status: draft
Mod: 0.8.7 · Started: 2026-10-26 · Design: [THEMES.md, Implement screen](../docs/THEMES.md#implement-screen-design-2026-10-24)
(revised by this spec)

## Goal

The Implement tab is for tools that have work to do: a baler, a plow, a
cultivator or seeder, a mower pair in front and behind. It answers "what
are my tools doing, and what do I do next". Today it shows one card for
whatever the game has selected, so a weight, a front loader or the
tractor itself gets a whole page with nothing on it, and a front and rear
mower can't be seen at once. This spec keeps the page to working tools,
puts every one of them on screen, and puts the "all" actions (unfold,
lower, turn on) first, since a rig of two or three tools is worked as one.

Navigation follows spec 0002 revision 2: the tab is never picked by
itself, nothing opens it but its own tab, and a tap on a tool selects it
in game without changing the page.

## Behaviour

- **Working tools:** a tool in the rig (not the vehicle, not loader gear,
  not a bag or pallet being carried) that the game gives something to do
  beyond lowering:
  - it turns on (`canTurnOn`: a mower, a baler, a sprayer);
  - it folds (`foldable`);
  - it has a working width (`workWidth`: a cultivator, a seeder, a plow);
  - it has a pipe, or it tips (a trailer; open question 1);
  - it rotates (a plow, new);
  - it has fill units it uses up or fills (seed, fertilizer, a baler's
    chamber, a forage wagon).
  A tool with none of these (a weight, a dolly, a front loader and its
  tools) isn't a working tool. It still has its tile in the band.
- **Layout (1180×820):** the rig band as now (tiles in driving order, the
  first tank event in its chip); under it the All row (two or more
  working tools only); under that, the working tools' cards. The control
  column on the right: Lights, Drive, and Attach.
- **The band:** unchanged, except that a tap on a tile only selects (spec
  0002 revision 2, already so here). Loader gear never reads lowered or
  raised (spec 0002).
- **All row** (two or more working tools; with one, its card has the
  same buttons):
  - **Unfold all / Fold all:** every working tool that folds, in one
    direction: unfold while any is folded, else fold. Pending while any
    fold runs;
  - **Lower all / Raise all:** the game's own key (`LOWER_ALL_IMPLEMENTS`,
    Ctrl+V), moved here from the column's All implements group (one
    control per action);
  - **Turn on all / Turn off all:** every working tool that turns on: on
    while any is off, else off. Unavailable while a tool that turns on is
    still folded, with "Unfold first" under it (the game refuses a folded
    tool; Vincent, 2026-10-26).
  Each is lit while all its tools are in the "on" state, and says what a
  tap does, as the card's buttons do.
- **Cards:** one per working tool, in the band's driving order (rear
  tools on the left, front on the right). One tool: one card, full
  width. Two: side by side. Three: in a row. Four: two by two. They fit
  1180×820 without scrolling (Vincent, 2026-10-26): from three cards on,
  each card is the compact form (its main stats and its buttons, smaller
  tanks), designed on the canvas before the build. The game's selected
  tool's card has the yellow
  selection outline; a tap on a card's head selects that tool in game.
  Each card:
  - head: badge (yellow while working), model, kind and side ("Mower ·
    Front"), Working chip;
  - stats: speed against the tool's limit ("11 / 12 km/h"), working
    width, area this run, wear (the details card's, folded in);
  - its buttons: Lower, Fold, Work, Detach; a trailer's Tipping and
    Cover; a pipe's Pipe and Unload; a plow's Rotate;
  - its tanks with their estimates ("Seeds empty ≈ 22 min", "Runs out
    first"), as today.
- **Per kind:**
  - **Plow:** Rotate turns it over, unavailable while the game doesn't
    allow it (raised, or a plow that doesn't rotate). The card shows
    which side it's on only if the game says so (spike).
  - **Baler:** the chamber as a meter ("Bale 72%"); the bales it dropped
    this session only if the game counts them (spike; open question 3);
    a baler-wrapper's wrap state if the game exposes it.
  - **Mower pair:** nothing extra: the All row is what it needs.
  - **Cultivator, seeder, sprayer:** as today's card (tanks, area, speed
    limit).
- **No working tool:** the band, then one card: "No working tool
  attached", and under it every other tool in the rig, one line each
  ("Weight · Front"), with Lower / Raise where the tool lowers (a weight
  on the 3-point). That's where a weight is raised and lowered; the Map
  page's Implement group does it too, for the selected tool. Without a
  vehicle: "Get in a vehicle to see its tools here", as now.
- **Removed:** the details card (its stats go on each card); Show on map
  (the bottom nav opens the Map); ‹ › and the swipe on the card (every
  card is on screen; the band's tiles pick); the column's All
  implements group (Lower all goes to the All row, Hitch becomes Attach).
- **Attach** (replaces Hitch, in the column on every page that has it):
  faded and unavailable until the game has something in reach to attach
  (the moment its own Attach prompt shows), then it attaches that.
  Detaching is each tool's own Detach, on its card (Vincent, 2026-10-26:
  Hitch is always lit today and does little).
- **Day and Night:** both palettes, as today.
- **Compact (portrait):** one column: band, All row, cards stacked.

## Data contract

All additions; Protocol v1 is unchanged. The plow and baler names come
from a spike first (Plan, step 1); this table changes with its results.

- **Mod → backend** (`cab`):
  - `cab.rig[]` entries gain `plow {rotated: bool, canRotate: bool}` for a
    plow that rotates, absent otherwise;
  - `baler {fill: 0–1, bales: int}` for a baler, `bales` only if the game
    counts them;
  - `cab.keys` gains `rotate` (the tool the plow's rotate key acts on);
  - `cab.attachable`: true while the game has something in reach to
    attach (its Attach prompt is up), absent otherwise.
- **Backend:** `implement.foldAll`, `implement.turnOnAll` and
  `implement.rotate` in the command list (`client/commands.py`).
- **Web:**
  - `selectors.js`: `isWorkingTool(e, v)`, `workingTools(v, cab)`;
  - `implementScreen.js`: the All row (`implementAll`), the cards row
    (`implementCards`, one card per working tool), the empty card; the
    details card and the single card go;
  - `controls.js`: `foldAll`, `turnOnAll`, `rotate`;
  - `theme.js`: the Implement screen's slots.

| Name | Where from | State |
|---|---|---|
| `setFoldState(getToggledFoldDirection())`, `setIsTurnedOn`, `getIsTurnedOn` | Foldable.lua, TurnOnVehicle.lua | verified (PLAN.md, C2) |
| `foldable`, `unfolded`, `canTurnOn`, `getIsLowered` | VehicleState.lua | verified (PLAN.md, C2) |
| `LOWER_ALL_IMPLEMENTS` | inputBinding.xml | built (mod 0.8.0); live check open (PLAN.md, Open checks) |
| `getAIWorkAreaWidth()`, `getSpeedLimit()` | WorkArea.lua, Vehicle.lua | built (mod 0.8.0); live check open |
| no game key for "fold all" or "turn on all": the mod loops over the tools | inputBinding.xml | unverified: to check in the game's inputBinding.xml |
| `setFoldState(direction)` with a set direction (not toggled), for Unfold all | Foldable.lua | unverified |
| `spec_plow.rotationMax`, `getIsPlowRotationAllowed()`, `setRotationMax(bool)`, its key (`IMPLEMENT_EXTRA`?) | Plow.lua | unverified (spike) |
| what's in reach to attach: `spec_attacherJoints.attachableInfo` (attachable, joint), or the ATTACH action event's active state | AttacherJoints.lua | unverified (spike) |
| `spec_baler`: the chamber's fill unit, a bale count or the bale-dropped event, a wrapper's state | Baler.lua, BaleWrapper.lua | unverified (spike) |

## Commands

- `implement.foldAll` (value "unfold" or "fold"): the mod sets every
  working tool that folds to that direction (`setFoldState`). No game
  key (to check). The All row shows pending until every fold is done.
- `implement.turnOnAll` (value true or false): `setIsTurnedOn` on every
  working tool that turns on and isn't folded; the ack names any it
  refused.
- `implement.rotate` (value: the tool's id): the plow's rotate key's
  event, else `setRotationMax(not rotationMax)`. Shown the same frame
  from `plow.rotated`.
- `hitch.toggle` becomes Attach's: it presses the attach key only while
  `cab.attachable`; detaching goes through `implement.detach` (each
  card).
- Unchanged: `implement.select`, `implement.lowerAll`, and each card's
  Lower, Fold, Work, Tipping, Cover, Pipe, Unload and Detach (aimed at
  that card's tool).

## Plan

1. **Spike** (`spike/FS25_CompanionSpike`): a plow (its rotation fields
   and key), a baler and a baler-wrapper (the chamber, any bale count,
   the wrap), a front and rear mower (fold and turn on each by its
   setter, folded refusals), a weight (what it has besides lowering),
   what tells that something is in reach to attach, and whether
   inputBinding.xml has a fold-all or turn-on-all key. Vincent runs it.
2. **Mod (0.8.7):** `VehicleState.lua` adds `plow` and `baler` to rig
   entries; `Commands.lua` adds the three commands; the version in
   `mod/modDesc.xml` and `Companion.VERSION`.
3. **Client and backend:** the three command names.
4. **Web:** `isWorkingTool` and its tests first; then the All row, the
   cards row and the empty card; the controls; theme.js.
5. **Removed:** the details card, Show on map, ‹ › and the swipe, the
   column's All implements group.

Risks:
- Turning on all tools at once may draw on the PTO the game would refuse
  one at a time; the ack reports refusals instead of hiding them.
- Four cards at 1180×820 leave each about 440 × 250 px (two by two);
  the compact card must hold its buttons at 48 px or more. The canvas
  comes before the build.
- "Working tool" is a rule of our own over the game's fields; a tool we
  miss (a roller with no width?) would show in the empty card's list.
  The spike's rigs should cover the common ones.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [ ] `mod/tests/run.lua`: `plow` on a rotating plow, absent otherwise;
  `baler` with its chamber's fill; the three commands set every tool and
  skip the ones that can't (folded, no fold, no turn on).
- [ ] `client/tests` or `backend/tests`: the three commands pass through.
- [ ] `web/test.html` "working tools": mower, baler, plow, cultivator,
  seeder, trailer are; a weight, a front loader and its bucket, a carried
  bag, the vehicle aren't.
- [ ] `web/test.html` "implement all row": only with two or more working
  tools; Unfold all / Fold all by the tools' state; Turn on all
  unavailable while one is folded, "Unfold first"; Lower all not in the
  column any more.
- [ ] `web/test.html` "implement cards": one per working tool in driving
  order, the selected one outlined, a tap on a head sends
  `implement.select` and the page stays; a plow's Rotate; a baler's
  chamber.
- [ ] `web/test.html` "attach": faded and unavailable without
  `cab.attachable`, available with it; no Hitch control left.
- [ ] `web/test.html` "implement empty": no working tool → "No working
  tool attached" with the weight's Lower.
- [ ] Replay in the browser pane at 1180×820, day and night: a front and
  rear mower, a plow alone, a weight alone, a rig with three tools and
  one with four; no scrolling, nothing overflows, touch targets 48 px or
  more.

Live check (mod 0.8.7; a tractor with a front and rear mower, a plow, a
baler, a weight; the spike is done):
- [ ] Front and rear mower: both cards side by side; Unfold all, Lower
  all and Turn on all work them as the game's keys would, one tap each.
- [ ] Turn on all is unavailable while a mower is folded.
- [ ] A plow: Rotate turns it, unavailable while raised.
- [ ] A baler: the chamber meter matches the HUD (and the bale count, if
  the game has one).
- [ ] A weight alone: "No working tool attached", and its Lower raises
  and lowers it.
- [ ] A tap on a card's head or a band tile selects the tool in game and
  the page stays.
- [ ] Attach is faded until you back up to a tool, lights up as the
  game's Attach prompt shows, and attaches it.

## Decisions

- The Implement tab is never picked by itself; a tap on a tool selects
  and never changes the page (Vincent, 2026-10-26).
- A weight doesn't get a page of its own (Vincent, 2026-10-26).
- Trailers stay here for now (Vincent, 2026-10-26); the plain Vehicle
  page may take them over later (see open question 1).
- The cards fit without scrolling (Vincent, 2026-10-26).
- Turn on all is unavailable while a tool is folded (Vincent,
  2026-10-26).
- Hitch becomes Attach, available only when something is in reach;
  Detach is per tool (Vincent, 2026-10-26).

## Out of scope / open questions

1. **The plain Vehicle page and this page:** Vincent wants the Vehicle
   page to show one card per attached tool, each with all its controls
   (its own spec). That is close to what this page becomes: merge them
   (this page becomes the Vehicle page and the Implement tab goes), or
   keep both (Vehicle simple, Implement the working detail)? Decided
   later, in its own pass (Vincent, 2026-10-26); this spec waits for it.
2. **Bales this session:** if the game keeps no count, count them by
   watching the chamber drop from nearly full to empty, or leave the
   count out? Decide after the spike (Vincent, 2026-10-26).
- The coupling links between tiles (spec 0002) on this band: likely, in
  a later fix.

## Log

- 2026-10-26: drafted with Vincent after the Vehicle screen's live check:
  the page keeps to working tools, every one on screen, the "all" actions
  first; never opened by a tap. Waiting for approval.
- 2026-10-26: Vincent's answers: trailers stay for now; the cards fit
  without scrolling (up to four); Turn on all unavailable while a tool
  is folded; Hitch becomes Attach, lit only when something is in reach,
  with Detach per tool; bales after the spike. Open: how this page and
  a per-tool Vehicle page divide the work.
