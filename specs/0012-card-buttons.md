# 0012: Card buttons: what a tool has, what it can do now

Status: built
Mod: 0.13.1 · Started: 2026-11-02 · Design: [THEMES.md](../docs/THEMES.md#implement-screen-design-2026-10-24) (the card); specs [0003](0003-implement-screen.md) and [0011](0011-sprayer.md) (the buttons this replaces)

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
| Sprayer, trailed (the Berthoud Vantage 4300) | Fold, Turn on, Unload, Detach; the section strip | Application rate (Precision Farming); Doubled rate on a slurry tanker or a manure spreader |
| Sprayer, self-propelled (the Agrio DINO II): its own card | Fold, Turn on, Unload; the section strip | Application rate (Precision Farming); Doubled rate on a slurry tanker or a manure spreader |
| Mower | Lower, Fold, Turn on, Detach | |
| Seeder or planter | Lower, Fold, Turn on, Detach | |
| Trailer | Tip (Unload here off a sale point), Tip side, Cover, Detach | |
| Plow | Lower, Fold if it folds, Detach | Rotate, Create fields |
| Baler | Lower (its pickup), Turn on, Detach | Automatic drop, Reset bale count |
| Front weight (the CLAAS W 600) | Lower, Detach | |
| Combine | its Harvester screen, unchanged (spec 0001) | |
| Tractor | never a card (since mod 0.12.3) | |

The table is what the rules give for those tools, not a list by kind: a
tool gets each button its parts have (a seeder with a tank that unloads
gets Unload). Each button is in its row's order whatever the tool, and
only on a tool whose parts have it (Data contract).

- **Faded:** with the reason the game gives (folded, the engine off,
  lowered, while a fold moves...), or ours where it has none ("Nothing to
  unload", "This spray type has no partial width"); the reason only
  reaches the mod's answer. A tap on a faded button does nothing (spec
  0010).
- **The labels** say what a tap does, from the tool's state: Lower /
  Raise, Fold / Unfold, Turn on / Turn off, Unload, Uncover / Cover (lit
  while open), Rotate, Create fields on / off, Automatic drop on / off,
  Reset bale count (its count under it, "12 bales"), Doubled rate on /
  off; Folding… / Unfolding… while a fold moves (spec 0011 fix 4).
- **More:** the main row's last button, "More · 2" (how many are under
  it) over a chevron, closed (Vincent, 2026-11-03: a button, not a row of
  its own, so a card fits at 1180×820). A tap opens or closes it on that
  card: lit while open, its buttons a row under the main row, and the
  card shows its compact body meanwhile (no stats, the main tank's meter
  alone) so they fit. The viewer's browser remembers which are open (per
  tool model, `localStorage`, a convenience only). A tool with nothing
  under More has no More button.
- **Application rate** (Precision Farming, under More): one row like
  Cruise's, always together: Rate −, Auto, Rate +. Auto is lit while the
  game sets the rate itself; Rate − and Rate + are faded while Auto is on
  (the game's rate key does nothing then) and at the ends (1 and 45).
  Auto's line shows the step while the player sets it, "Step 2 / 45"
  (the game's HUD shows l/ha, which isn't in what we read; Vincent,
  2026-11-02); none while automatic. All three are faded while what the
  sprayer sprays has no rate in Precision Farming (herbicide: "No
  application rate for herbicide") or its tank is empty ("The tank is
  empty"); the row stays (live check, 2026-11-04).
- **Compact** (three cards or more, spec 0003): the main row stays, with
  More's button faded and closed.
- **The section strip** (spec 0011) stays as it is. Its four width
  buttons are there on a sprayer with sections and no Precision Farming
  sprayer part, faded while the game has partial width off for it (its
  spray type) or it's folded. With Precision Farming's sprayer part the
  strip is read-only: Precision Farming takes the sections over and the
  game registers no width key (the probe, 2026-11-02; Vincent: a
  read-only strip, not four buttons always faded).
- **The All row** stays (Lower all, Fold all, Turn on all, Tip all, Cover
  all), under the same rules: its buttons come from the rig's tools'
  buttons and don't come and go while the rig is the same. Cover all is
  back with Cover's button (Uncover all, lit while all are open).
- **The Map screen's Implement group** (Lower, Fold, Work, acting on the
  tool the game's key would act on) goes: the cab keeps Lights and Drive.
  A tool is worked from its card. The Harvester screen's Header and Fold
  tiles still read and send through the lower and fold controls
  (`implementLowered`, `fold`); Work (`implementOn`) and the group's
  label with the selected tool's name went.

Day and Night as today; 1180×820 with one, two and three cards (compact),
with More open and closed.

## Data contract

- **Mod → companion** (`cab` topic, each rig entry; Protocol v1):
  - `can`: the tool's buttons by rule 1, in `CAPABILITIES`' order
    (lower, fold, turnOn, unload, tip, tipSide, cover, pipe, rotate,
    createFields, autoDrop, bales, doubledRate, sprayRate, width, detach),
    which gains `unload`, `createFields`, `autoDrop`, `doubledRate` and
    `sprayRate` (Precision Farming's rate: its three buttons); `bales`
    becomes the reset button. What decides each is in the table below. It
    is read from parts and load-time settings only, never from a live
    "can it now".
  - `canNow[cap]` false with `whyNot[cap]` (the game's words) while the
    game refuses it now: the live answers today's code reads, plus the
    new buttons' (table). `turnOn` keeps its button folded, powerless or
    while unloading.
  - The state each label reads: today's, plus `createFields` (boolean,
    on while the plow may make fields), `autoDrop` (boolean),
    `doubledRate` (boolean), `sprayRate` (`{auto: boolean, step:
    number, min: number, max: number}`). `bales` keeps `{count, total}`.
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
  createFields, autoDrop, bales, doubledRate, sprayRate) with
  `moreCount`. `toolButtons` makes the main row, then More's buttons
  (`more: true`; `sprayRate` drawn as one row: Rate −, Auto, Rate +);
  the other-keys code goes. The Map screen's Implement group goes, and
  with it `implementOn` and the group's `implementName`; `implementLowered`
  and `fold` stay in `controls.js`: the Harvester screen's Header and Fold
  tiles use them (checked while building). The All row gains Cover all.

What decides each button, and what fades it. Every name was read in the
game's own scripts (`sdk/debugger/gameSource.zip` in the install, read
locally, never committed) unless marked; none of the new ones is live
yet:

| Button | Has it (rule 1) | Faded now (rule 2) | State |
|---|---|---|---|
| Lower | the tool's input attacher joint `allowsLowering` (`getActiveInputAttacherJoint`), or it lowers through its fold (`spec_foldable.foldMiddleAnimTime`), or a pickup that lowers itself (`spec_pickup.animationName` set: Pickup registers its own `LOWER_IMPLEMENT` then, the baler's "Lower pickup"); no more `getAllowsLowering` here (it's a "now": false on a mower folded for transport) | `getAllowsLowering` (the joint) / `getIsFoldMiddleAllowed` (the fold) false, `getIsPowered` false; a pickup only by power (`getCanChangePickupState` is always true) | verified (DONE.md, tools on the Vehicle page), but the joint's `allowsLowering` alone and the pickup are unverified |
| Fold | `spec_foldable.foldingParts` not empty | `getIsFoldAllowed` false, `getIsPowered` false | verified (DONE.md) |
| Turn on | `spec_turnOnVehicle` and `getCanToggleTurnedOn()` true: false when the tool is always on (`isAlwaysTurnedOn`) or turned on by its tractor (`turnedOnByAttacherVehicle`), XML settings fixed at load; and its input attacher joint's `canBeTurnedOn` isn't false. The game registers the turn on key only then (TurnOnVehicle `onRegisterActionEvents`). The mod reads the two settings as fields (Sprayer's own `getCanToggleTurnedOn` also asks its tank, a "now"), `getCanToggleTurnedOn()` only where they can't be read | `getCanBeTurnedOn()` false (folded: Foldable's limits; no power), with `getTurnedOnNotAllowedWarning()` (Foldable's `unfoldWarning`, else "warning_attachToPower"), else the engine's words | `getCanBeTurnedOn`, `getTurnedOnNotAllowedWarning` verified (DONE.md); the settings as "has" seen in the probe (the three sprayers false and false; the W 600 and the ARION have no turn on part) |
| Unload | `spec_fillUnit.unloading` set (the tool's unloading places, FillUnit `onRegisterActionEvents` registers `UNLOAD` only then) | while `spec_fillUnit.unloadingFillUnitsRunning` (FillUnit.unloadFillUnits does nothing then), and with nothing to unload ("Nothing to unload": no fill unit with `canBeUnloaded`, a level and a pallet, FillUnit.updateUnloadActionDisplay): unverified which the game shows | unloading places seen in the probe (one on each sprayer); the rest unverified |
| Tip, Tip side | `spec_trailer.tipSideCount` ≥ 1, ≥ 2 | as today | verified (DONE.md, a trailer's tip keys) |
| Cover | `spec_cover.hasCovers` | as today | as today (no button since spec 0003's close: back in the main row; unverified) |
| Pipe | `spec_pipe.hasMovablePipe` | as today | verified (spec 0001) |
| Rotate | `spec_plow.rotationPart.turnAnimation` | `getCanTogglePlowRotation()` false (Plow.actionEventTurn: the fold's limits, lowered, power), else `getIsPlowRotationAllowed()` false; `getIsPowered` false | `rotationMax` seen in spike 0.0.4; unverified live |
| Create fields | `spec_plow` and not `getPlowForceLimitToField()` (forced, or the platform can't create fields); the player's `createFields` permission (`g_currentMission:getHasPlayerPermission`) fades it | without the permission | `spec_plow.limitToField` (false: makes fields); unverified |
| Automatic drop | `spec_baler.toggleableAutomaticDrop` (else `spec_baleWrapper`'s: a baler-wrapper has the key twice, one press toggles both) | `getIsPowered` false (a powered key) | `spec_baler.automaticDrop` (`platformAutomaticDrop` with a platform); unverified |
| Reset bale count | `spec_baleCounter` | `getIsPowered` false (a powered key) | `sessionCounter`; unverified |
| Doubled rate | `spec_sprayer.isFertilizerSprayer` false: a slurry tanker or a manure spreader. Sprayer registers its key on every sprayer but never allows it on a fertilizer sprayer (`getSprayerDoubledAmountActive`'s second answer; Vincent, 2026-11-03) | `getSprayerDoubledAmountActive(workAreaParameters.sprayType)`'s second answer false (not for this spray type) | `spec_sprayer.doubledAmountIsActive`; the key inactive on the three fertilizer sprayers in the probe; unverified on a slurry tanker |
| Application rate (Precision Farming) | Precision Farming's sprayer part (`spec_FS25_precisionFarming.extendedSprayer`) with `sprayAmountAutoModeChangeAllowed` true | Rate − and + while `sprayAmountAutoMode` is true (the game's rate key is inactive then) or at `sprayAmountManualMin` / `Max`; all three while not powered, and while what it sprays isn't one of the fill types Precision Farming's `PrecisionFarming.xml` gives a rate (`applicationRates`: FERTILIZER, LIQUIDFERTILIZER, LIQUIDMANURE, DIGESTATE, MANURE; `limeUsage`: LIME) or there's nothing to spray. What it sprays as Sprayer `onStartWorkAreaProcessing` finds it: its tank (`getSprayerFillUnitIndex`) with a level, else a source tank (`fillTypeSources`) holding one of its spray types; not faded when filled from outside (`getIsSprayerExternallyFilled`) or unreadable. Live (2026-11-04): herbicide in the Berthoud, the keys inactive; fertilizer, offered. The list and an empty tank unverified | the probe (2026-11-02, the Rogator 937H, Vincent watched the HUD): `sprayAmountAutoMode` (true: automatic), `sprayAmountManual` 1 to 45 (`sprayAmountManualMin`, `sprayAmountManualMax`); one press of `PRECISIONFARMING_SPRAY_AMOUNT` with value 1 stepped it 1 → 2 (12 → 25 l/ha in the HUD with liquid fertilizer), with -1 back; `PRECISIONFARMING_SPRAY_AMOUNT_MODE` toggles automatic; Precision Farming's own script isn't readable |
| Width (4 buttons) | `spec_variableWorkWidth.hasSections` and no Precision Farming sprayer part (`spec_FS25_precisionFarming.extendedSprayer`); with one, the strip only | `spec_variableWorkWidth.isActive` false ("This spray type has no partial width": Sprayer sets it from the spray type's `supportsVariableWorkWidth`) or folded (Foldable's `unfoldWarning`) | the probe (2026-11-02): `hasSections` and `isActive` true on the Berthoud, the Rogator 937H and the DINO II, all with Precision Farming, and no width key registered on any; a sprayer without Precision Farming unverified |
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
| `tool.resetBales` (new, replaces `implement.baleReset`) | none (one-shot) | `BALE_COUNTER_RESET` | `sessionCounter` is 0 |
| `tool.doubledRate` (new) | 1 on, 0 off | the sprayer's `toggleDoubledAmountInputBinding` (`DOUBLED_SPRAY_AMOUNT` by default) | `doubledAmountIsActive` is the value |
| `tool.sprayRate` (new) | -1 or 1: one step down or up (Rate −, Rate +) | `PRECISIONFARMING_SPRAY_AMOUNT`, the value as the key's input (the probe) | `sprayAmountManual` moved by one; refused at once while automatic ("Automatic rate is on") or at its end ("at its limit") |
| `tool.sprayRateAuto` (new) | 1 automatic, 0 manual | `PRECISIONFARMING_SPRAY_AMOUNT_MODE` (the probe) | `sprayAmountAutoMode` is the value |
| `implement.key`, `implement.baleReset` | go | | |

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
  remade from the spike dumps with the new `can` (no `extraKeys`); the
  probe's dumps slimmed to `mod/tests/fixtures/spike0012/` by
  `research/spike/slim_parts.py` (the ARION rig engine off and on, the
  DINO II, the Rogator 937H), new rig fixtures from them.
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
- [x] `mod/tests/run.lua`: a card's `can` is the same with the engine on
  and off, folded and unfolded, selected and not, unloading and not, on
  the spike rigs (mowers, trailers, sprayer, plow, baler) and the
  self-propelled sprayer; only `canNow` and `whyNot` change.
- [x] `mod/tests/run.lua`: Turn on only where `getCanToggleTurnedOn` is
  true: a weight with `turnedOnByAttacherVehicle` and a tractor with
  `isAlwaysTurnedOn` have none; a joint with `canBeTurnedOn` false none.
- [x] `mod/tests/run.lua`: each new button from its part (Unload from
  `unloading`, Create fields not when forced, Automatic drop only when
  toggleable, Reset bale count, Doubled rate, the width buttons with
  sections and no Precision Farming sprayer part, none with one), faded
  as in the table.
- [x] `mod/tests/run.lua`: each new command presses its key on its tool
  (aimed when another is selected, the selection put back), answers by
  its state, `already` when there; `implement.key` and a `key` field are
  refused; `tool.rotate` replaces `implement.rotate`.
- [x] `mod/tests/run.lua`: no rig entry has `extraKeys`.
- [x] `companion/tests`: a `key` field is refused ("value not allowed");
  the new actions pass through with their tool.
- [x] `web/test.html`: each tool in the table gets its main row and More
  in order, from the rig fixtures; a faded button stays with its label;
  a tool with nothing under More has no More row; More opens and closes,
  remembered.
- [x] `web/test.html`: the same card's buttons with the engine on and
  off (two cab messages): the same keys, only faded ones differ.
- [x] `web/test.html`: the Map screen's controls have Lights and Drive,
  no Implement group.
- [x] `tests/test_golden.py` unchanged (the Solek replay has no tool
  buttons that change), or rewritten on purpose with the reason in the Log.
- [x] Replay in the browser pane (`replay-solek`): the Map screen and the
  Vehicle page at 1180×820, day and night, with the rig fixtures.

Live check (in game; Solek; livewatch shows each tool's `can` when you get
in; the engine off first, then on):
- [x] Probe first (spike 0.0.9, the Plan; `research/spike/README.md`):
  1. The ARION 410 with the W 600 and the Berthoud, the engine off:
     `csParts off`; the engine on: `csParts on`.
  2. The Berthoud selected, unfolded, liquid in the tank, the engine on:
     `csRate`, then `csRate PRECISIONFARMING_SPRAY_AMOUNT -1`, then
     `csRate PRECISIONFARMING_SPRAY_AMOUNT_MODE`, each after the last
     says "rate written"; what the game's rate display showed after each.
  3. The Agrio DINO II: `csParts dino`, and `csRate` there.
  (Vincent, 2026-11-02: step 2 on the Fendt Rogator 937H, twice: first
  with automatic on, then off, 12 → 25 → 12 l/ha; the Log has what the
  files said.)
- [x] The ARION 410 with the W 600 and the Berthoud: the W 600 has Lower
  and Detach only; the Berthoud Fold, Turn on, Unload, Detach and More ·
  1 (Application rate); the ARION no card. Engine off, folded, unfolded,
  unloading, selecting the tractor in game: no button comes or goes
  (livewatch's `in` line has each one's `can`; any change is a `cab`
  line).
- [ ] The Berthoud: Unload makes pallets with the tractor selected in
  game, answered ok once it started; Rate −, Auto and Rate + as the
  game's rate (its HUD's l/ha, the card's step) on the Berthoud and the
  Rogator 937H; the strip read-only (Precision Farming), with no width
  buttons; More opens and closes, and stays open after a reload.
- [ ] The Agrio DINO II: its own card, Fold, Turn on, Unload, the strip,
  More · 1, no Detach.
- [ ] A slurry tanker or a manure spreader (from the shop): Doubled rate
  under More, on and off as the game's HUD shows; none on the Berthoud.
- [ ] The T7.300 with the KDF 341 S and KDD 941 STH: Lower, Fold, Turn on,
  Detach on both, unchanged from spec 0003.
- [ ] The Vestrum 100 with two EDK 650: Tip, Tip side, Detach (Cover if
  the game has covers on it, and Cover all), unchanged from spec 0003.
  `python scripts/rig_check.py --server http://localhost:8125` presses
  each card's buttons there and back on any of these rigs.
- [ ] A plow (from the shop if none on the farm): Rotate and Create
  fields under More, each as the game does.
- [ ] A baler (the G-1 F125 Kombi from spike 0.0.4 if on the farm):
  Lower (its pickup) in the main row; Automatic drop and Reset bale count
  under More.
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
- The width buttons are on a sprayer with sections and no Precision
  Farming sprayer part, faded while partial width is off; with Precision
  Farming the strip is read-only (Vincent, 2026-11-02, after the probe).
- Unload answers ok once the unloading started, else "Nothing moved"
  (Vincent, 2026-11-02).
- Doubled rate only where the game ever allows it: a slurry tanker or a
  manure spreader (`isFertilizerSprayer` false, set at load). The
  Berthoud, the DINO II and the Rogator have More · 1 (Vincent,
  2026-11-03, after reading Sprayer's `getSprayerDoubledAmountActive`).
- More is the main row's last button, not a row of its own: the
  Berthoud's card on the ARION rig (the W 600 under Also attached) was 17
  px too tall at 1180×820 with the row (Vincent, 2026-11-03). Open, the
  card shows its compact body so More's buttons fit.

## Out of scope / open questions

- Open: the l/ha the game's HUD shows for a step (not in what we read;
  about 12.5 l/ha a step with liquid fertilizer, once).
- Open: what the game does with an empty tank (the rate's buttons are
  faded then, "The tank is empty"), and whether Precision Farming rates
  a fill type its settings don't list (its script isn't readable).
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
- 2026-11-02: spike 0.0.9 built for the probe (`csParts`, `csRate`; `mod/tests/test_spike_parts.py`) and installed.
- 2026-11-02: probe, first run (spike 0.0.9; `parts-off`, `parts-on`,
  `parts-rogator`, `parts-dino`, three `rate-*.json`). Turn on: the
  Berthoud, the Rogator 937H and the DINO II have `getCanToggleTurnedOn`
  true (`isAlwaysTurnedOn`, `turnedOnByAttacherVehicle` false); the ARION
  410 and the W 600 have no turn on part at all (0.12.2's bug read the
  missing part as "can't now"). Unload: one unloading place and `UNLOAD`
  on all three sprayers. Lower: the W 600's input joint `allowsLowering`
  true, the Berthoud's false. Doubled rate: `DOUBLED_SPRAY_AMOUNT`
  inactive in every dump; the game allows it only for the spray type
  being applied (`getSprayerDoubledAmountActive`'s second answer, Sprayer
  `onUpdateTick`). Width: `hasSections` and `isActive` true on all three,
  and no width key registered on any (Precision Farming's section control,
  unverified). Precision Farming: `extendedSprayer.sprayAmountAutoMode`
  (true), `sprayAmountManual` 1 to 45, `PRECISIONFARMING_SPRAY_AMOUNT`
  inactive while automatic; `PRECISIONFARMING_SPRAY_AMOUNT_MODE` turned
  automatic off on the Rogator. A second run in manual mode is next.
- 2026-11-02: the width row with Precision Farming's sprayer part is the
  read-only strip (Vincent); the four buttons only without it.
- 2026-11-02: probe, second run (the Rogator 937H, automatic off): one
  press of `PRECISIONFARMING_SPRAY_AMOUNT` with value 1 stepped
  `sprayAmountManual` 1 → 2 (12 → 25 l/ha in the HUD), with -1 back to 1;
  the mode key turned automatic back on and the rate key inactive again.
  Application rate is one row under More (Rate −, Auto, Rate +) with the
  step shown, "Step 2 / 45" (Vincent). Probe ticked.
- 2026-11-03: built (mod 0.13.0). The has-signals checked in the game's
  own scripts (TurnOnVehicle, FillUnit, Plow, Baler, BaleWrapper,
  BaleCounter, Sprayer, Pickup), which changed four things from the
  draft: Doubled rate only on a slurry tanker or a manure spreader
  (Vincent); Turn on read from the turn on part's two settings as fields
  (Sprayer's `getCanToggleTurnedOn` also asks its tank); the baler's Lower
  from its pickup; Rotate faded by `getCanTogglePlowRotation`, Automatic
  drop and Reset bale count by power (their keys are powered ones). More
  became the main row's last button (Vincent), and an open More shows the
  card's compact body. `implement.baleReset` went with `implement.key`;
  Cover all is back with Cover's button. The Harvester screen's tiles
  keep `implementLowered` and `fold`. The probe's dumps are test fixtures
  (`spike0012`), `scripts/rig_check.py` sends today's commands (it still
  sent the `implement.*` names from before mod 0.10.0) and presses Unload
  only with `--unload`, livewatch prints each tool's `can`. Tests: 64 Lua,
  117 pytest, `web/test.html` 290 green; the golden file unchanged. Seen
  in the browser pane at 1180×820, day and night: the ARION rig engine on
  and off, More open and closed, the plow's More · 2, three cards
  compact.
- 2026-11-04: live check, first part (mod 0.13.0, spike 0.0.9; both
  installed zips match the repo). The ARION rig ticked: `can` never
  changed through the engine off and on, fold, unfold, Unload and the
  tractor selected; only `canNow` / `whyNot`, with the game's words
  ("Please start the engine first!", "You first need to unfold the tool
  (sprayer)!", "Detach while folding is not allowed!", ours "Nothing to
  unload" while unloading). The AI worker on and off at 07:07:30 was a
  misclick (Vincent). Unload answered ok and made pallets, engine on and
  off. The Rogator 937H: Auto off, Rate + 1 → 5, Auto on, each ok (the
  Vehicle page as the game, Vincent). The Berthoud with herbicide: Auto
  live but refused twice ("not available now"); with fertilizer the game
  offers the rate. Precision Farming's `PrecisionFarming.xml` sets rates
  only for fertilizer, liquid fertilizer, the manures, digestate and
  lime: the fade goes to docs/NEXT.md (0.13.1). The Berthoud's line stays
  open until that recheck; the DINO II and the other rigs are next.
- 2026-11-07: mod 0.13.1, the rate faded by what's sprayed (the fix from
  the live check). Rate −, Auto and Rate + fade while the sprayer sprays
  a fill type Precision Farming's settings give no rate, or nothing;
  what's sprayed found as Sprayer does (its tank, else a source tank).
  The test rigs carry the probe's fill types (the Berthoud's and the DINO
  II's herbicide, the Rogator's liquid fertilizer) and the rate keys
  inactive on herbicide, as the probe saw; the ARION rig's web fixture
  has the Berthoud's rate faded. Tests: 64 Lua, 117 pytest,
  `web/test.html` 290 green; the golden file unchanged.
