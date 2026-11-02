# 0012: Card buttons: what a tool has, what it can do now

Status: approved
Mod: 0.13.0 · Started: 2026-11-02 · Design: [THEMES.md](../docs/THEMES.md#implement-screen-design-2026-10-24) (the card); specs [0003](0003-implement-screen.md) and [0011](0011-sprayer.md) (the buttons this replaces)

## Goal

A tool's buttons on the Vehicle page never come and go. Today a card's
buttons come from what the game allows at this moment (`getCanBeTurnedOn`,
the keys it has registered this frame), so Turn on vanishes while folded,
with the engine off or during Unload, and Unload vanishes on every fold and
whenever another tool is selected. Each fix added a workaround (the folded
exception, per-tool memories, filters for hidden, axis, AI and driving
keys) and broke something else (Turn on on the W 600, a card for the
ARION; spec 0011's Log, 2026-11-02). This spec starts the button model
again from four rules agreed with Vincent on 2026-11-02: the player sees
the same buttons on a tool every time, faded when they can't be used, and
each one works on its own tool.

## Behaviour

**The four rules.**
1. **A card's buttons come from what the tool is,** read once from its
   parts and the settings they were loaded with. They don't change until
   the tool is detached.
2. **The game's live state only fades a button,** with the game's words
   kept for the answer (spec 0010: a faded button shows no reason). It
   never adds or removes one.
3. **Each button acts on its own tool,** whatever is selected in game: the
   dashboard selects the tool, presses the game's key on it, and puts the
   selection back (as Fold and Turn on do since spec 0003). The tool
   selected in game stays shown by the card's accent ring (spec 0010).
4. **Buttons come from our fixed list,** one per action, with our labels.
   There is no list of whatever keys the game has registered: a key not in
   the list has no button (a modded tool gets the buttons its standard
   parts give it).

**The buttons per tool.** The main row, then a collapsed **More** under
it (Vincent, 2026-11-02):

| Tool | Main row | More |
|---|---|---|
| Sprayer, trailed (the Berthoud Vantage 4300) | Fold, Turn on, Unload, Detach; the section strip | Doubled rate, Application rate (Precision Farming) |
| Sprayer, self-propelled (the Agrio DINO II): its own card | Fold, Turn on, Unload; the section strip | Doubled rate, Application rate (Precision Farming) |
| Mower | Lower, Fold, Turn on, Detach | |
| Seeder or planter | Lower, Fold, Turn on, Detach | |
| Trailer | Tip (Unload here off a sale point), Tip side, Cover, Detach | |
| Plow | Lower, Fold if it folds, Detach | Rotate, Create fields |
| Baler | Lower pickup, Turn on, Detach | Automatic drop, Reset bale count |
| Front weight (the CLAAS W 600) | Lower, Detach | |
| Combine | its Harvester screen, unchanged (spec 0001) | |
| Tractor | never a card (since mod 0.12.3) | |

The table is what the rules give for those tools, not a list by kind: a
tool gets each button its parts have (a seeder with a tank that unloads
gets Unload). Each button is in its row's order whatever the tool, and
only on a tool whose parts have it (Data contract).

- **Faded:** with the reason the game gives (folded, the engine off,
  lowered, while a fold moves, nothing to unload, this spray type has no
  partial width...). A tap on a faded button does nothing (spec 0010).
- **The labels** say what a tap does, from the tool's state: Lower /
  Raise, Fold / Unfold, Turn on / Turn off, Rotate, Create fields on /
  off, Automatic drop on / off, Doubled rate on / off; Folding… /
  Unfolding… while a fold moves (spec 0011 fix 4).
- **More:** a "More" row under the main buttons, closed, with how many
  are in it ("More · 2"); a tap opens or closes it on that card, and the
  viewer's browser remembers which cards are open (per tool model,
  `localStorage`, a convenience only). A tool with nothing under More has
  no More row.
- **Compact** (three cards or more, spec 0003): the main row stays; More
  stays closed and keeps its row.
- **The section strip** (spec 0011) stays as it is; its four width
  buttons are there on every sprayer with sections, faded while the game
  has partial width off for this tool (its spray type) or it's folded
  (Vincent, 2026-11-02: replaces spec 0011's "buttons only where the
  width keys are live").
- **The All row** stays (Lower all, Fold all, Turn on all, Tip all, Cover
  all), under the same rules: its buttons come from the rig's tools'
  buttons and don't come and go while the rig is the same.
- **The Map screen's Implement group** (Lower, Fold, Work, acting on the
  tool the game's key would act on) goes: the cab keeps Lights and Drive.
  A tool is worked from its card.

Day and Night as today; 1180×820 with one, two and three cards (compact),
with More open and closed.

## Data contract

- **Mod → companion** (`cab` topic, each rig entry; Protocol v1):
  - `can`: the tool's buttons by rule 1, in `CAPABILITIES`' order, which
    gains `unload`, `createFields`, `autoDrop`, `doubledRate` and
    `sprayRate` (after the probe); `bales`
    becomes the reset button. What decides each is in the table below. It
    is read from parts and load-time settings only, never from a live
    "can it now".
  - `canNow[cap]` false with `whyNot[cap]` (the game's words) while the
    game refuses it now: the live answers today's code reads, plus the
    new buttons' (table). `turnOn` keeps its button folded, powerless or
    while unloading.
  - The state each label reads: today's, plus `createFields` (boolean,
    on while the plow may make fields), `autoDrop` (boolean),
    `doubledRate` (boolean), `sprayRate` (what the probe finds: the rate
    and its unit, or a step). `bales` keeps `{count, total}`.
  - `extraKeys` goes: no entry carries it (the dashboard ignores it if an
    old mod sends it).
- **Viewer → companion → mod:** `implement.key` and the command's `key`
  field go (spec 0011 fix 1), in the viewer, the companion's shape check
  and the command file. `implement.rotate` becomes `tool.rotate` with the
  tool's id. New actions: Commands.
- **Web** (`web/src/types.js`): `RigEntry.can` notes the new
  capabilities and their state fields; `extraKeys` is removed.
- **Web** (selectors, widgets): `CAPABILITIES` and `BUTTON_CAPABILITIES`
  gain the new ones, and a `MORE_CAPABILITIES` list (rotate,
  createFields, autoDrop, bales, doubledRate). `toolButtons` makes the
  main row and the More row from `can` (`MORE_CAPABILITIES` also has
  `sprayRate`); the other-keys code goes. The
  Map screen's Implement group and its controls (`implementLowered`,
  `fold`, `implementOn` in `controls.js`) go, unless the Harvester
  screen still uses them (it uses its own tiles: checked while building).

What decides each button, and what fades it. Every name was read in the
game's own scripts (`sdk/debugger/gameSource.zip` in the install, read
locally, never committed) unless marked; none of the new ones is live
yet:

| Button | Has it (rule 1) | Faded now (rule 2) | State |
|---|---|---|---|
| Lower | the tool's input attacher joint `allowsLowering` (`getActiveInputAttacherJoint`), or it lowers through its fold (`spec_foldable.foldMiddleAnimTime`); no more `getAllowsLowering` here (it's a "now": false on a mower folded for transport) | `getAllowsLowering` / `getIsFoldMiddleAllowed` false, `getIsPowered` false | verified (DONE.md, tools on the Vehicle page), but the joint's `allowsLowering` alone is unverified |
| Fold | `spec_foldable.foldingParts` not empty | `getIsFoldAllowed` false, `getIsPowered` false | verified (DONE.md) |
| Turn on | `spec_turnOnVehicle` and `getCanToggleTurnedOn()` true: false when the tool is always on (`isAlwaysTurnedOn`) or turned on by its tractor (`turnedOnByAttacherVehicle`), XML settings fixed at load; and its input attacher joint's `canBeTurnedOn` isn't false. The game registers the turn on key only then (TurnOnVehicle `onRegisterActionEvents`) | `getCanBeTurnedOn()` false (folded: Foldable's limits; no power), with `getTurnedOnNotAllowedWarning()` (Foldable's `unfoldWarning`, else "warning_attachToPower") | `getCanBeTurnedOn`, `getTurnedOnNotAllowedWarning` verified (DONE.md); `getCanToggleTurnedOn` as "has" unverified: the W 600 and the ARION should answer false |
| Unload | `spec_fillUnit.unloading` set (the tool's unloading places, FillUnit `onRegisterActionEvents` registers `UNLOAD` only then) | while `spec_fillUnit.unloadingFillUnitsRunning`, and empty (no fill level): unverified which the game refuses | unverified |
| Tip, Tip side | `spec_trailer.tipSideCount` ≥ 1, ≥ 2 | as today | verified (DONE.md, a trailer's tip keys) |
| Cover | `spec_cover.hasCovers` | as today | as today (no button since spec 0003's close: back in the main row; unverified) |
| Pipe | `spec_pipe.hasMovablePipe` | as today | verified (spec 0001) |
| Rotate | `spec_plow.rotationPart.turnAnimation` | `getIsPlowRotationAllowed()` false | `rotationMax` seen in spike 0.0.4; unverified live |
| Create fields | `spec_plow` and not `getPlowForceLimitToField()` (forced, or the platform can't create fields); the player's `createFields` permission (`g_currentMission:getHasPlayerPermission`) fades it | without the permission | `spec_plow.limitToField` (false: makes fields); unverified |
| Automatic drop | `spec_baler.toggleableAutomaticDrop` | `getIsPowered` false | `spec_baler.automaticDrop` (`platformAutomaticDrop` with a platform); unverified |
| Reset bale count | `spec_baleCounter` | | `sessionCounter`; unverified |
| Doubled rate | `spec_sprayer` (Sprayer registers its doubled amount key on every sprayer, `toggleDoubledAmountInputBinding`) | | `spec_sprayer.doubledAmountIsActive`; unverified |
| Application rate (Precision Farming) | the probe: Precision Farming's sprayer part (`spec_FS25_precisionFarming.extendedSprayer`, seen in spike 0.0.4 with `PRECISIONFARMING_SPRAY_AMOUNT` "Change application rate") and what it holds | the probe | the probe; its script isn't in the game's readable scripts |
| Width (4 buttons) | `spec_variableWorkWidth.hasSections` | `spec_variableWorkWidth.isActive` false (Sprayer sets it from the spray type's `supportsVariableWorkWidth`) or folded | unverified: may be why the keys weren't live on the Berthoud (spec 0011) |
| Detach | every tool (depth 1 and more) | `isDetachAllowed()` false | verified (DONE.md) |

## Commands

Every tool button sends its tool's id and is aimed (rule 3, specs/0009:
select the tool if its key isn't live, press, put the selection back). A
switch asks for a state (specs/0008) and answers ok once that state reads
back, `already` if it was there; a one-shot answers ok once its key ran
and what it starts reads back.

| Action | Value | Key on the tool | Answers ok once |
|---|---|---|---|
| `tool.lower`, `tool.fold`, `tool.turnOn`, `tool.tip`, `tool.pipe`, `tool.width`, `implement.tipSide`, `implement.detach` | as today | as today | as today |
| `tool.unload` (new) | none (one-shot) | `UNLOAD` | the unloading started: `unloadingFillUnitsRunning` turned true or the tank's level dropped (unverified which), else "Nothing moved" after the check's wait, as Tip (spec 0003 revision 3; Vincent, 2026-11-02) |
| `tool.rotate` (replaces `implement.rotate`) | 1 rotated, 0 back | the plow's `IMPLEMENT_EXTRA` | `rotationMax` is the value |
| `tool.createFields` (new) | 1 on, 0 off | `IMPLEMENT_EXTRA3` (Plow `actionEventLimitToField`) | `limitToField` is the opposite of the value |
| `tool.autoDrop` (new) | 1 on, 0 off | `IMPLEMENT_EXTRA4` (Baler `actionEventToggleAutomaticDrop`) | `automaticDrop` is the value |
| `tool.resetBales` (new) | none (one-shot) | `BALE_COUNTER_RESET` | `sessionCounter` is 0 |
| `tool.doubledRate` (new) | 1 on, 0 off | the sprayer's `toggleDoubledAmountInputBinding` (`DOUBLED_SPRAY_AMOUNT` by default) | `doubledAmountIsActive` is the value |
| `tool.sprayRate` (new, after the probe) | what the probe finds: a step up or down, or a rate | `PRECISIONFARMING_SPRAY_AMOUNT` (spike 0.0.4) | the rate read back changed |
| `implement.key` | goes | | |

A faded button sends nothing. The dashboard shows a button pending until
the answer, then until its state changes (at most 1.5 s), as every card
button.

## Plan

- **Probe first** (spike 0.0.9, `FS25_CompanionSpike`): on the Berthoud
  with Precision Farming, dump `spec_FS25_precisionFarming.extendedSprayer`
  (its fields, their types, before and after one press of
  `PRECISIONFARMING_SPRAY_AMOUNT` and of its mode key), and the turn on
  part's `isAlwaysTurnedOn`, `turnedOnByAttacherVehicle` and
  `getCanToggleTurnedOn()` on the W 600, the ARION and the Berthoud.
  Vincent runs it; the Data contract and the Application rate button are
  filled in from the dump before the build goes on (Vincent, 2026-11-02).
- **Mod** (0.13.0): `mod/src/state/Tools.lua`: `capabilities` split in two
  steps, has (rule 1, the table) then now (rule 2); `turnsOnSeen`,
  `widthKeysSeen`, the folded and powerless Turn on branches, `extraKeys`,
  `KEY_CAPS`, `NOT_A_TOOL_KEY`, `DRIVING_PARTS` and `BUTTON_CAPS` go.
  `mod/src/state/Rig.lua`: no `extraKeys`. `mod/src/Commands.lua`: the new
  actions in `Commands.ACTIONS`, their states and checks; `implement.key`,
  `selectedKey`, the `key` attribute and `keyName` go;
  `implement.rotate` becomes `tool.rotate`. Unverified names through
  `Api.tryCall` and guarded reads, as today.
- **Companion:** `protocol.py`, `server.py`, `commands.py`: the `key`
  field goes. `scripts/rig_check.py`: presses each tool's buttons from
  `can` instead of its other keys.
- **Web:** `types.js`, `data/selectors.js` (the capability lists),
  `widgets/vehicleTools.js` (main row, More row, no other keys),
  `widgets/controls.js` and `themes/newholland/theme.js` (the Implement
  group goes), `commands.js` / `connection.js` (no `key`).
- **Fixtures:** `fixtures/rig_fixtures.py` and `web/fixtures/rigs/*.json`
  remade from the spike dumps with the new `can` (no `extraKeys`).
- **Docs:** spec 0011's other keys (fix 1, the hidden and axis keys) and
  the faded Turn on (fix 5, 0.12.3) point here; THEMES.md's card section
  gets the More row and loses the Implement group; NEXT.md's "vehicle's
  other keys" item closes.
- **Risks:** the has-signals are read from scripts, not seen live: a tool
  whose XML says otherwise could lose a button it had (the live check
  covers every rig on the farm). Aiming a key the game only registers
  while selected costs a frame, as for Fold today.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [ ] `mod/tests/run.lua`: a card's `can` is the same with the engine on
  and off, folded and unfolded, selected and not, unloading and not, on
  the spike rigs (mowers, trailers, sprayer, plow, baler) and the
  self-propelled sprayer; only `canNow` and `whyNot` change.
- [ ] `mod/tests/run.lua`: Turn on only where `getCanToggleTurnedOn` is
  true: a weight with `turnedOnByAttacherVehicle` and a tractor with
  `isAlwaysTurnedOn` have none; a joint with `canBeTurnedOn` false none.
- [ ] `mod/tests/run.lua`: each new button from its part (Unload from
  `unloading`, Create fields not when forced, Automatic drop only when
  toggleable, Reset bale count, Doubled rate, the width with sections),
  faded as in the table.
- [ ] `mod/tests/run.lua`: each new command presses its key on its tool
  (aimed when another is selected, the selection put back), answers by
  its state, `already` when there; `implement.key` and a `key` field are
  refused; `tool.rotate` replaces `implement.rotate`.
- [ ] `mod/tests/run.lua`: no rig entry has `extraKeys`.
- [ ] `companion/tests`: a `key` field is refused ("value not allowed");
  the new actions pass through with their tool.
- [ ] `web/test.html`: each tool in the table gets its main row and More
  in order, from the rig fixtures; a faded button stays with its label;
  a tool with nothing under More has no More row; More opens and closes,
  remembered.
- [ ] `web/test.html`: the same card's buttons with the engine on and
  off (two cab messages): the same keys, only faded ones differ.
- [ ] `web/test.html`: the Map screen's controls have Lights and Drive,
  no Implement group.
- [ ] `tests/test_golden.py` unchanged (the Solek replay has no tool
  buttons that change), or rewritten on purpose with the reason in the Log.
- [ ] Replay in the browser pane (`replay-solek`): the Map screen and the
  Vehicle page at 1180×820, day and night, with the rig fixtures.

Live check (in game; Solek; livewatch shows each tool's `can` when you get
in; the engine off first, then on):
- [ ] Probe first (spike 0.0.9, the Plan): Precision Farming's sprayer
  part and the turn on settings dumped on the Berthoud, the W 600 and
  the ARION.
- [ ] The ARION 410 with the W 600 and the Berthoud: the W 600 has Lower
  and Detach only; the Berthoud Fold, Turn on, Unload, Detach and More ·
  2; the ARION no card. Engine off, folded, unfolded, unloading, selecting
  the tractor in game: no button comes or goes.
- [ ] The Berthoud: Unload makes pallets with the tractor selected in
  game, answered ok once it started; Doubled rate on and off as the
  game's HUD shows; Application rate as the game's (Precision Farming);
  the width buttons faded or not as the game's partial width (and if not
  faded, one section each).
- [ ] The Agrio DINO II: its own card, Fold, Turn on, Unload, the strip,
  More · 2, no Detach.
- [ ] The T7.300 with the KDF 341 S and KDD 941 STH: Lower, Fold, Turn on,
  Detach on both, unchanged from spec 0003.
- [ ] The Vestrum 100 with two EDK 650: Tip, Tip side, Detach (Cover if
  the game has covers on it), unchanged from spec 0003.
- [ ] A plow (from the shop if none on the farm): Rotate and Create
  fields under More, each as the game does.
- [ ] A baler (the G-1 F125 Kombi from spike 0.0.4 if on the farm):
  Automatic drop and Reset bale count under More.
- [ ] The Valtra S 286 with the Väderstad FH 2200 and the Aerosem: each
  tool's buttons by the table, none coming and going.
- [ ] The Map screen: Lights and Drive, no Implement group.

## Decisions

- More is closed by default and remembered per tool model in the
  viewer's browser only.
- Compact keeps More's row, closed.
- Cover is back as a main button (it had none since spec 0003's close)
  because rule 4 drops the other keys it was in; its live check is the
  trailers' line.
- The seeder gets no Refill and the sprayer no Dump in this spec
  (Vincent, 2026-11-02): Refill gets its own spec after this one
  (docs/NEXT.md), Dump waits until we know from the game when a sprayer
  offers it.
- A sprayer's More has the base game's Doubled rate (Sprayer) and
  Precision Farming's Application rate, the second once the probe has
  found its state (Vincent, 2026-11-02).
- The width buttons are always on a sprayer with sections, faded while
  partial width is off (Vincent, 2026-11-02).
- Unload answers ok once the unloading started, else "Nothing moved"
  (Vincent, 2026-11-02).

## Out of scope / open questions

- Open: what the Application rate button shows and does (a step or a
  rate, its unit) waits on the probe.
- Out of scope: Refill, Dump, the Harvester and Loader screens (their own
  tiles, unchanged), bale size (`TOGGLE_BALE_TYPES`), the baler's own
  unload, the mower's drop (`Mower.actionEventToggleDrop`), modded tools'
  own keys.

## Log

- 2026-11-02: drafted after spec 0011's live check (mod 0.12.2 to 0.12.4)
  showed buttons coming and going; the four rules, the table, More, the
  Implement group and the All row agreed with Vincent in chat. The
  has-signals read in the game's own scripts (TurnOnVehicle, FillUnit,
  Plow, Baler, Sprayer, VariableWorkWidth, Foldable). Open questions
  answered: the width buttons always there, faded; Precision Farming's
  rate probed in this spec; Unload ok once it started.
- 2026-11-02: approved by Vincent.
