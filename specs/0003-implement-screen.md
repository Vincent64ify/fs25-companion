# 0003: Vehicle page with a card per tool (the Implement tab merges in)

Status: built
Mod: 0.8.7 · Started: 2026-10-26 · Design: canvas [FS25 Companion: Vehicle vs Implement](https://claude.ai/artifact/HvFL9rUTBC7cbDtnNH8WaT)
(option A), [THEMES.md, Implement screen](../docs/THEMES.md#implement-screen-design-2026-10-24) (replaced)

## Goal

One page for driving and working: the Vehicle tab's plain page shows
every tool you can work with as a card with all its buttons, and the
Implement tab goes. Today the Implement tab shows one card for whatever
the game has selected, so a weight or the tractor gets a whole page with
nothing on it, a front and rear mower can't be seen at once, and the
plain Vehicle page (spec 0002) only lists tanks. On the canvas, keeping
both pages (option B) turned out to make the Implement page a copy of
the merged one plus a second page of the same buttons (Vincent chose A,
2026-10-27).

It must hold for every tool and every combination, modded ones
included, so nothing is written per tool type: **the mod sends what each
tool can do, read from the game's own parts, and the page draws a button
for each and nothing else.** A census of every vehicle type in the game
checks the rule, and real rigs dumped from the game are the tests.

## Behaviour

- **Tabs:** Map and Vehicle. The Implement tab and its page are gone. The
  Vehicle tab still picks its page by what you drive (spec 0002): Harvester
  for a combine, Loader for a loader, else this page, **Vehicle**. A page
  saved as "implement" on a device opens Vehicle.
- **Layout (1180×820):** the band (job, speed, fuel, DEF, wear, Engine
  hot) with the rig strip, as spec 0002 has it; under it the All row (two
  or more working things only); under that, the cards; then Also
  attached. The control column: Lights, Drive, Hitch (Attach). No Loads
  card: tanks are on their cards.
- **The band's label** names the vehicle's brand: "Vehicle · New Holland"
  (the shop's brand, as the mod sends it). Strip tiles keep the model
  alone: five tiles leave no room for both.
- **What gets a card** (a "working thing"): any rig member, the vehicle
  included, whose capabilities (below) hold anything beyond lowering and
  detaching, or which has fill units shown on the HUD. So a mower, a
  plow, a seeder, a sprayer, a baler, a trailer, a self-propelled sprayer
  or a tipper truck get one; a weight, a dolly or a plain tractor don't.
  Loader gear and a carried bag or pallet never do: they belong to the
  Loader page (spec 0002).
- **A card:** in the strip's driving order (rear on the left, front on
  the right; the vehicle in its place).
  - head: badge (yellow while working), the model, then the brand, the
    shop's category and side on the line under it ("Samasz · Mowers ·
    Front"); Working chip ("Tipping" while a trailer tips); the game's
    selected one has the selection outline. A tap on the head selects it
    in game; the page stays;
  - stats: speed against the tool's limit, working width, area this run,
    and the tool's own wear. The vehicle's own card has no wear (the band
    shows it) and no Detach;
  - **a button for each capability** the mod sends, labelled with what a
    tap does ("Raise", "Fold", "Turn off", "Tip" / "Stop", "Uncover",
    "Pipe out", "Rotate", "Reset count", "Detach"); unavailable (45%),
    with the game's words on hover, while the game says it can't now
    (`canNow`), and Turn on while the tool is folded ("Unfold first").
    Buttons are control-size (80 px tall), as many columns as fit the
    card, wrapping after that. A tap sends the command with the tool's
    id and stays pending until the ack, then until the state changes (at
    most 1.5 s);
  - **the selected tool's other keys**: its live keys no capability
    covers, as buttons with the game's labels ("Allow create fields",
    "Turn on automatic drop", "Lower pickup", a sprayer's "Dump",
    "Dump on ground", "Unload"), after the others;
  - **tip side**, for a trailer that tips more than one way: one button,
    "Tip side" over the current side ("Back"), that steps to the next
    side, as the game's key does;
  - **working width** (left out for now: open question 4), for a tool
    with sections (sprayers, spreaders):
    the width used against the full one ("30 / 36 m"), a segment per
    section (off ones grey), and Left in / Left out / Right in / Right
    out;
  - its tanks with their estimates ("Seeds · 58%", "empty ≈ 42 min",
    "Runs out first"), as the Implement card had them, side by side where
    the card is wide (a baler's chamber, net and wrap); an empty one
    "Empty". "Covered" isn't written on the load: the Uncover / Cover
    button shows it;
  - the bale counter: the game's count on its Reset count button
    ("12 bales").
- **All row** (two or more working things): one button per capability
  that two or more of them share: Unfold all / Fold all, Lower all /
  Raise all and Turn on all / Turn off all are the game's own keys ("Fold
  all tools", "Lower/raise all tools", "Turn on/off all tools"; spike
  0.0.4); Tip all and Uncover all / Cover all act on each in turn. Lit while all are in
  the "on" state; the label says what a tap does ("Unfold all" / "Fold
  all", "Lower all" / "Raise all", "Turn on all" / "Turn off all", "Tip
  all" / "Stop all", "Uncover all" / "Cover all"). Turn on all is
  unavailable while one of them is folded, with "Unfold first" under it
  (Vincent, 2026-10-26).
- **Also attached:** each rig member with no card, one line ("3300 ·
  Fendt · Weights · Front · Raised": model, brand, shop category, side,
  state) with its buttons (Lower / Raise where it lowers, Detach).
- **How many fit (1180×820, no scrolling; Vincent, 2026-10-26):** one card
  full width; two side by side; three in a row and four two by two, in
  the compact form (head, buttons 60 px tall, the main meter); five or
  six, three by two, compact. More than six: open question 2 (today they
  go on in rows of three).
- **Nothing attached:** the band, "Nothing attached" where the cards go,
  and Attach in the column. Tools but no working thing (a weight alone):
  Also attached only. Without a vehicle: "Get in a vehicle to see its
  tools here".
- **Attach** (replaces Hitch, in the column on every page that has it):
  faded until the game has something in reach to attach (its own Attach
  prompt is up), then it attaches that. Detaching is each card's Detach
  (Vincent, 2026-10-26).
- **Taps never change the page** (spec 0002 revision 2).
- **Day and Night:** both palettes. **Compact (portrait):** one column,
  the cards stacked.

## Capabilities: one rule for every tool

The mod sends, per rig member (the vehicle included), `can`: the actions
the game's parts on it allow. A specialization being there is not
enough: the census found Foldable on 178 of the game's 196 vehicle types,
and a trailer, a weight and a baler carry Foldable with no folding part,
Cover with no cover, or Attachable without lowering (spike 0.0.4). So each
capability needs the part **and what it holds**:

| `can` | From the game | State sent with it |
|---|---|---|
| `lower` | the attacher joint lowers it: the input joint's `allowsLowering` (unverified), else `getAllowsLowering` as today | `lowered` |
| `fold` | `spec_foldable.foldingParts` has at least one part | `unfolded`, `foldMoving` |
| `turnOn` | TurnOnVehicle and `getCanBeTurnedOn()` | `turnedOn` |
| `tip` | `spec_trailer.tipSideCount` ≥ 1 (a sprayer's Dischargeable "Dump on ground" is not tipping) | `discharging` |
| `tipSide` | `spec_trailer.tipSideCount` ≥ 2 | `tipSide {index, count}` (`preferedTipSideIndex`), its name when known |
| `cover` | `spec_cover.hasCovers` | `cover {open}` |
| `pipe` | Pipe | `pipe {out, moving}` |
| `rotate` | `spec_plow.rotationPart.turnAnimation` | `plow {rotated}` (`rotationMax`) |
| `width` (later: open question 4) | `spec_variableWorkWidth.hasSections` (a mower has the part, no sections) | `width {left, leftMax, right, rightMax, center}` |
| `bales` | BaleCounter (`spec_baleCounter`) | `bales {count, total}` (`sessionCounter`, `lifetimeCounter`: unverified) |
| `detach` | anything attached (Attachable) | |

Where the game answers why not, the entry carries `canNow[cap] = false`
and `whyNot[cap]` (its words, when it has some), so a button is
unavailable with the game's own words in its title (spike 0.0.4:
`getIsFoldAllowed` → "Folding is not allowed while the tool is lowered.",
`isDetachAllowed` → "You first need to fold up the tool (mower)!";
`getAllowsLowering` only while the tool is raised: raising stays
allowed; `getCanToggleTurnedOn` with `getTurnedOnNotAllowedWarning`;
`getIsPlowRotationAllowed`). The page reads nothing else to decide a
button: a type it has never seen gets whatever its parts allow. Against
the census, with every part holding something, the rule gives one
capability per part as the spike counted them (fold 178, turn on 95,
cover 78, pipe 14, rotate 3, lower and detach 141), tip and tip side 24
(trailers; the spike's 75 counted every Dischargeable); with every part
empty, only Detach and the bale counter.

## Data contract

All additions; Protocol v1 is unchanged. "Seen in spike 0.0.4" means on
Vincent's rigs on 2026-10-27 (front and rear mowers, two tippers, a
trailed sprayer with sections, a rotating plow, a baler-wrapper, a front
weight, a hook-lift truck with a container); the dumps are in
`mod/tests/fixtures/spike0003/`. They move to DONE.md after the live
check.

- **Mod → backend** (`cab`):
  - every `cab.rig[]` entry gains `can` (array of the names above), the
    states that go with them (`tipSide {index, count, name}`,
    `plow {rotated}`, `bales {count, total}`; the others are sent today),
    `canNow` / `whyNot` (above), and the selected one `extraKeys`
    (`[{action, text}]`: its live keys no capability covers, each once,
    by input action; not the all-tools keys, Attach, Detach, nor the
    vehicle's attacher joints' keys, which act on its tools);
  - `cab.attachable`: true while something is in reach to attach,
    absent otherwise.
  - The vehicles topic's implements already carry brand, name, category,
    fills, workWidth, speedLimit and wear.
- **Backend:** the new command names (Commands) in
  `backend/app/protocol.py` and `client/commands.py`.
- **Web:**
  - `selectors.js`: `screenRig` (from the Implement screen), `canOf(e)`
    (from an older mod: its fields), `isWorkingThing(e, v)`,
    `cardsOf(v, cab)` (the cards in driving order), `alsoAttached(v, cab)`,
    `allActions(cards)`;
  - a new `vehicleTools.js`: the All row (`toolsAll`), the cards
    (`toolCards`, with `toolCard` drawn from `can`), Also attached
    (`toolsAlso`);
  - `controls.js`: Attach (from Hitch); each card's buttons send their
    command with the tool's id;
  - `theme.js`: the Vehicle screen's slots; the Implement screen goes;
    `main.js`: a saved "implement" screen opens Vehicle
    (`registry.js` `savedScreen`).
  - `web/fixtures/rigs/<rig>.json`: spike 0.0.4's rigs through the mod's
    own Cab collector (`fixtures/rig_fixtures.py`; pytest checks they're
    up to date), each with what the page must show (`expect`).

| Name | Where from | State |
|---|---|---|
| `setFoldState(getToggledFoldDirection())`, `setIsTurnedOn`, `getIsTurnedOn`, `foldable`, `unfolded`, `canTurnOn`, `getIsLowered` | Foldable.lua, TurnOnVehicle.lua, VehicleState.lua | verified (PLAN.md, C2) |
| `setSelectedObject` (select a tool), `isDetachAllowed` | Vehicle.lua, AttacherJoints.lua | verified (PLAN.md, C3) |
| `LOWER_ALL_IMPLEMENTS`, pipe, discharge, cover (keys and fields) | inputBinding.xml, Pipe.lua, Dischargeable.lua, Cover.lua | built (mod 0.8.0); live check open (PLAN.md, Open checks) |
| `getAIWorkAreaWidth()`, `getSpeedLimit()` | WorkArea.lua, Vehicle.lua | built (mod 0.8.0); live check open |
| the census: `g_vehicleTypeManager.types`, each with `name` and `specializationNames` (a mod's carry its prefix, "FS25_precisionFarming.extendedSprayer") | VehicleTypeManager.lua | seen in spike 0.0.4: 196 types |
| `setSelectedObject` on every tool, and putting the selection back | Vehicle.lua | seen in spike 0.0.4: all 7 rigs, restored each time |
| each spec's `actionEvents` (keyed by input action) and the input binding's `events[id]`: `isActive`, `contextDisplayText` (the game's own label: "Fold mower", "Rotate plow", "Tip side (Left)") | InputBinding.lua | seen in spike 0.0.4; a tool's keys are registered only while it is selected |
| `getIsFoldAllowed(direction, false)` → allowed, reason; `isDetachAllowed()` → allowed, reason | Foldable.lua, Attachable.lua | seen in spike 0.0.4 |
| turn on's "can't now": `getIsTurnedOnAllowed` isn't there in FS25; `getCanToggleTurnedOn`, `getTurnedOnNotAllowedWarning` are | TurnOnVehicle.lua | seen in spike 0.0.4 (the names; what they answer is unverified) |
| `FOLD_ALL_IMPLEMENTS` ("Fold all tools"), `TURN_ON_ALL_IMPLEMENTS` ("Turn on/off all tools"), registered on each foldable / turn-on tool | inputBinding.xml | seen in spike 0.0.4 |
| a trailer's tip sides: `spec_trailer.tipSideCount`, `preferedTipSideIndex`, key `TOGGLE_TIPSIDE` ("Tip side (Grain door)"); `TOGGLE_TIPSTATE` "Dump", `TOGGLE_TIPSTATE_GROUND` "Unload here" | Trailer.lua, Dischargeable.lua | seen in spike 0.0.4; a side's name inside `tipSides[i]` unverified (the key's label has it while selected) |
| `spec_cover.hasCovers` | Cover.lua | seen in spike 0.0.4 (false on the tippers and the baler) |
| `spec_plow.rotationMax`, `rotationPart.turnAnimation`, `limitToField`; keys `IMPLEMENT_EXTRA` "Rotate plow", `IMPLEMENT_EXTRA3` "Allow create fields"; `getIsPlowRotationAllowed`, `getCanTogglePlowRotation` | Plow.lua | seen in spike 0.0.4 (the getters' answers unverified) |
| `spec_variableWorkWidth.hasSections`, `leftSide` / `leftSideMax`, `rightSide` / `rightSideMax`, `hasCenter`, `sections` | VariableWorkWidth.lua | seen in spike 0.0.4 (the sprayer: 4 + 4 + center, 9 sections) |
| the width keys: `VARIABLE_WORK_WIDTH_LEFT`, `_RIGHT`, `_TOGGLE` exist, but weren't registered on the selected sprayer | inputBinding.xml | unverified: open question 4 |
| the baler: chamber = its fill unit with the HUD (straw, net, wrap); `spec_baleCounter` with `BALE_COUNTER_RESET` "Reset bale counter"; keys `IMPLEMENT_EXTRA3` "Unload round bale", `IMPLEMENT_EXTRA4` "Turn on automatic drop" | Baler.lua, BaleCounter.lua | seen in spike 0.0.4; the counter's fields unverified |
| in reach to attach: the vehicle's `spec_attacherJoints.attachableInfo.attachable` is the tool, empty otherwise; the `ATTACH` key's label is "Attach", empty otherwise | AttacherJoints.lua | seen in spike 0.0.4 |
| `getActiveInputAttacherJoint().allowsLowering` (whether the joint ever lowers it) | Attachable.lua | unverified (built in mod 0.8.7; else `getAllowsLowering`, as before) |
| a tip side's name: `spec_trailer.tipSides[i].name` | Trailer.lua | unverified (else the key's label while selected) |
| the setters when a key never comes: `setPreferedTipSide(i)`, `setRotationMax(bool)` | Trailer.lua, Plow.lua | unverified (FS22 names) |
| a tool's keys come a frame or more after selecting it; pressing only that tool's event (`targetObject`) | InputBinding.lua | seen in spike 0.0.4 (the frames); the press unverified |

## Commands

**Aimed at one tool:** `implement.lower`, `implement.fold`,
`implement.turnOn`, `implement.unload`, `implement.cover` and
`implement.pipe` take the tool's id as their value (without one, as
today: the tool the game's key acts on). The mod does what a player
does: selects that tool (`setSelectedObject`), presses the action's key,
and puts the selection back if the tap wasn't on the selected tool. So
every game rule (unfold first, weight limits, multiplayer) applies, and
a refusal comes back in the ack with the game's reason.

As built (mod 0.8.7): the mod presses the tool's key at once when the
tool already has it live (the selected one); otherwise it selects the
tool, waits for its key (up to 30 frames), presses only that tool's
event, and puts the selection back, all as a job over those frames (the
ack comes at the end; no other command is read meanwhile). A key that
never comes falls back to the specialization's setter (fold, turn on,
lower, cover, pipe, tip side, rotate), else the command is refused. What
the tool can't do (not in its `can`) is refused at once, as is what the
game refuses now (its `whyNot`, or "not allowed now").

New, each with the tool's id (without one: the selected tool's):
- `implement.tipSide` (`TOGGLE_TIPSIDE`): the key that steps the tip side;
- `implement.rotate` (`ROTATE_PLOW`): the plow's rotate key;
- `implement.baleReset` (`RESET_BALE_COUNTER`): the bale counter's reset key;
- `implement.key` (`PRESS_TOOL_KEY`), value the key's number (1 ..) in
  the selected tool's `extraKeys`: presses that key on it;
- not built (open question 4): `implement.widthLeftIn`, `widthLeftOut`,
  `widthRightIn`, `widthRightOut`, the variable width keys.

**All:** `implement.foldAll` and `implement.turnOnAll` press the game's
own `FOLD_ALL_IMPLEMENTS` and `TURN_ON_ALL_IMPLEMENTS`, as
`implement.lowerAll` presses `LOWER_ALL_IMPLEMENTS`; with no live event
(the game may register them only on the selected tool), every tool's
setter: unfold all while one is folded, else fold them; turn all on,
or off once they all are. `implement.tipAll` and `implement.coverAll`
(value 1 = open / tip, 0 = close / stop; no game key) run the one-tool
command on each that has the capability and isn't there yet, in driving
order, then put the selection back; the ack names any the game refused
("EDK 650: …").

`hitch.toggle` becomes Attach's: the attach key, only while
`cab.attachable` ("nothing in reach" otherwise; it never detaches any
more). `implement.select` is unchanged; `implement.detach` answers with
the game's reason ("You first need to fold up the tool (mower)!").

## Plan

1. **Spike 0.0.4** (`spike/FS25_CompanionSpike`; written 2026-10-27,
   not run yet; how to run it in
   [spike/README.md](../spike/README.md#a-card-per-tool-spike-spec-0003)):
   Vincent runs it once per rig and the census once on any save.
   - **Census:** every vehicle type the game has loaded (base game, DLCs
     and mods): its name and specialization names, and what the
     capability rule makes of it. Written to the report as a table.
   - **Rigs:** for each rig member, its specializations, the
     capabilities, the states above and the "can't now" reasons; then
     select-then-key on each tool (does the right one act, does the
     selection come back). Rigs: front and rear mowers; a tractor with
     two trailers, one tipping three ways; a sprayer with sections (self
     propelled or trailed); a plow; a baler; a weight; a tipper truck.
   - inputBinding.xml: any fold-all or turn-on-all key; the tip side,
     plow and width keys; what tells that something is in reach to
     attach.
2. **Fixtures from the dumps:** each rig's report becomes
   `web/fixtures/rigs/<name>.json` (the `cab` and `vehicles` messages as
   the mod sends them) and the census `mod/tests/fixtures/census.json`.
   Each fixture names what it must give: the cards, their buttons, Also
   attached, the All row. (Built: `fixtures/rig_fixtures.py` runs the
   mod's Cab collector on mocks of the dumps, `mod/tests/spike_rigs.lua`;
   the census stays in `mod/tests/fixtures/spike0003/`.)
3. **Mod (0.8.7):** `VehicleState.lua`: `can` and the new states per rig
   entry; `cab.attachable`; `Commands.lua`: the id on one-tool commands,
   the new and the All commands; the version in `mod/modDesc.xml` and
   `Companion.VERSION`.
4. **Client and backend:** the command names and their values.
5. **Web:** the selectors and their tests first; then the cards, the All
   row, Also attached, Attach; theme.js and main.js.
6. **Removed:** the Implement screen (`implementScreen.js`'s band, card
   and details; the tab), Vehicle's Loads card, Hitch, ‹ › and the swipe.
   THEMES.md's Implement section points here.

Risks:
- A modded part that isn't one of the game's specializations gets no
  button: the tool still shows (its tile, its card if it has tanks), just
  without that feature. The census shows how common that is.
- Select-then-key changes the game's selection for a moment; if the game
  refuses to select a tool (some can't be), the command falls back to
  the specialization's own setter where one exists (Fold, Turn on), else
  is refused with the reason.
- Six compact cards at 1180×820 leave each about 280 × 200 px: the
  canvas must show the compact form before the build.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [x] `mod/tests/run.lua` "capabilities": for every type in the census
  fixture, the rule's `can` from its specializations (built as mock
  objects), and the states for each; a part the rule doesn't know adds
  nothing.
- [x] `mod/tests/run.lua` "aimed commands": a one-tool command with an id
  selects that tool, presses the key and puts the selection back; a
  refusal returns the game's reason.
- [x] `mod/tests/run.lua` "all commands": each skips what can't or is
  already there, in driving order, and restores the selection;
  `cab.attachable` follows the attach prompt.
- [x] `client/tests`, `backend/tests`: the new commands and their values
  pass through; others are refused.
- [x] `web/test.html` "rig fixtures": for each dumped rig, the cards, each
  card's buttons, Also attached and the All row are what the fixture
  says (mowers, two trailers with the three-way tipper, sprayer with
  sections, plow, baler, weight alone, tipper truck, a plain tractor).
- [x] `web/test.html` "buttons from can": a made-up tool with an unknown
  part and `can: ["fold", "turnOn"]` gets exactly Fold and Turn on; a
  button the game can't do now is unavailable with its reason.
- [x] `web/test.html` "vehicle card": the sprayer and the truck have one
  (no wear, no Detach); a tractor with a seeder doesn't.
- [x] `web/test.html` "tabs": Map and Vehicle only; a saved "implement"
  opens Vehicle; Attach faded without `cab.attachable`.
- [x] `web/test.html` "layout": every fixture, and made-up rigs of one to
  six working things, drawn at 1180×820 in day and night: nothing
  overflows, no scrolling, every button 48 px or more.
- [x] Replay in the browser pane at 1180×820, day and night: the
  fixtures as screenshots for the Log.

Live check (mod 0.8.7; the spike is done; the rigs above):
- [ ] Front and rear mowers: both cards; each card's Fold, Lower and Turn
  on act on its own mower; Unfold all, Lower all and Turn on all work
  both, one tap each.
- [ ] Two trailers: Tip and Uncover per trailer; the three-way tipper's
  Tip side steps as the game's key does.
- [ ] A sprayer with sections: the width and sections match the HUD; Left
  in / out and Right in / out act on the right side.
- [ ] A plow: Rotate turns it; unavailable with the game's reason while
  raised.
- [ ] A baler: its chamber matches the HUD.
- [ ] A weight alone: Also attached with Lower; no card.
- [ ] A self-propelled sprayer and a tipper truck: the vehicle's own card.
- [ ] After any card button, the game's selected tool is the one it was.
- [ ] Attach is faded until you back up to a tool, lights up with the
  game's prompt, and attaches it.
- [ ] A button on a tool that isn't selected acts within half a second
  (select, its key, back), and the game's own refusals come back in its
  words (fold a lowered mower).
- [ ] The selected tool's other keys: the plow's "Allow create fields",
  the baler's "Turn on automatic drop" and "Lower pickup" work as the
  keys do.
- [ ] The baler's count matches the game's bale counter; Reset count
  resets it.
- [ ] The rear mower folded for transport still shows Raise / Lower
  (its joint lowers it), unavailable only while the game says so.
- [ ] mod log: which way each command went ("FOLD_IMPLEMENT via
  IMPLEMENT_EXTRA2" or "via setter") for the unverified names above.

## Decisions

- Merge: the Vehicle page holds the tools; the Implement tab goes
  (Vincent, 2026-10-27, on the canvas).
- Buttons come from what the game's parts allow, never from a list of
  tool types; tested against a census of every type and real rigs
  (Vincent, 2026-10-27).
- A vehicle that works by itself gets its own card, without wear (the
  band has it) or Detach (Vincent, 2026-10-27).
- Brands show: in the band's label and on each card's second line; the
  strip keeps the model alone (Vincent, 2026-10-27). The design system's
  "models without the brand" rule changes with the build.
- A trailer that tips several ways: one Tip side button that steps, as
  the game's key; a sprayer's sections: the width control (Vincent,
  2026-10-27).
- Card buttons are control-size, filling the card's width (Vincent,
  2026-10-27, canvas comment).
- The baler's card shows the game's own bale counter and its "Reset
  bale counter" key as a button; no count of our own (Vincent,
  2026-10-27, after spike 0.0.4).
- The working width control is left out for now (Vincent, 2026-10-27):
  the `width` capability and its card section wait for open question 4.
- **The selected tool's other keys:** its card also shows the live keys
  the capability list doesn't cover, as buttons with the game's own label
  ("Allow create fields", "Turn on automatic drop", "Unload round bale",
  a modded tool's own), pressed as the game's key. Only on the selected
  tool: the game registers a tool's keys only while it is selected
  (Vincent, 2026-10-27, after spike 0.0.4).
- From spec 0003's first draft: no page of its own for a weight; the cards
  fit without scrolling; Turn on all unavailable while a tool is folded;
  Hitch becomes Attach, Detach per tool (Vincent, 2026-10-26).

## Out of scope / open questions

1. ~~Bales~~: decided, see Decisions.
2. **More than six working things:** rare; scroll, or the selected one's
   card and a list for the rest? Decide when a dump has one.
3. The Loader page keeps its own cards (spec 0002); a loader rig's other
   tools (a seeder behind a tractor with a front loader) show there as
   strip tiles only. Revisit if it comes up.
4. **Working width, later:** FS25 has partial width (the sprayer's own
   HUD block is "PARTIAL WIDTH", 9 sections; the input actions
   `VARIABLE_WORK_WIDTH_LEFT`, `_RIGHT`, `_TOGGLE` exist), but its keys
   weren't registered while the sprayer was selected: maybe only while it
   is unfolded and turned on, or the keys have no default binding. Left
   out of this spec (Vincent, 2026-10-27); a later probe with the sprayer
   working, then its own small change.
5. ~~A tool's other keys~~: decided, see Decisions.
- The coupling links between tiles (spec 0002) are on this page's strip
  already; on the Map's column nothing changes but Attach.

## Log

- 2026-10-26: drafted with Vincent after the Vehicle screen's live check:
  the Implement page keeps to working tools, every one on screen, the
  "all" actions first; never opened by a tap.
- 2026-10-26: Vincent's answers: trailers stay for now; the cards fit
  without scrolling (up to four); Turn on all unavailable while a tool
  is folded; Hitch becomes Attach, lit only when something is in reach,
  with Detach per tool; bales after the spike. Open: how this page and
  a per-tool Vehicle page divide the work.
- 2026-10-27: canvas of that question, built from the design system:
  [FS25 Companion: Vehicle vs Implement](https://claude.ai/artifact/HvFL9rUTBC7cbDtnNH8WaT).
  A, merge, against B, keep both, each with front and rear mowers and a
  seeder with a front weight.
- 2026-10-27: where the vehicle's own information goes if the pages
  merge: the band and the column; a vehicle that works by itself gets
  its own card. Boards added: a self-propelled sprayer and a tipper truck
  alone, a tractor with two trailers.
- 2026-10-27: canvas comments from Vincent: card buttons too small and
  the card row not full width (fixed); no wear on the vehicle's card;
  working width with sections; tip side; brands on the band and cards;
  the weight's brand and model.
- 2026-10-27: rewritten as option A (Vincent): the Implement tab merges
  into the Vehicle page; buttons come from a capability list the mod
  reads from the game's parts; a census of every vehicle type and real
  rig dumps from spike 0.0.4 are the tests. Waiting for approval.
- 2026-10-27: approved by Vincent; next, spike 0.0.4.
- 2026-10-27: spike 0.0.4 written and installed: the census of every
  vehicle type (`census`), each rig member's parts, capabilities, states,
  "can't now" answers and registered keys (`controlledDetail.tools`), the
  input actions for the new buttons, and `csSelect`, which selects each
  tool in turn and puts the selection back. Checked offline in Lua on a
  made-up census and rig; not run in game yet.
- 2026-10-27: spike 0.0.4 run by Vincent on 8 rigs and the census; all
  probes worked, the selection came back every time. Findings: the
  capability rule needs what each part holds, not just the part
  (Capabilities); the game has its own Fold all and Turn on all keys (the
  All row uses them); each key carries the game's label; the baler has a
  bale counter; the width keys weren't registered (open question 4); a
  tool's other keys could become buttons (open question 5). Trimmed dumps
  and the census in `mod/tests/fixtures/spike0003/`. Data contract table
  updated.
- 2026-10-27: Vincent's answers after the spike: the game's bale count and
  its reset on the baler's card; the working width left out for now (open
  question 4); the selected tool's other keys as buttons with the game's
  labels.
- 2026-10-29: built (mod 0.8.7). Mod: `can`, its states, `canNow` /
  `whyNot` and the selected tool's `extraKeys` on every rig entry,
  `cab.attachable`; one-tool commands with an id as select → key →
  restore jobs over a few frames; Fold all, Turn on all, Tip all, Cover
  all; Attach only with something in reach. Web: the Vehicle page's All
  row, cards and Also attached (`vehicleTools.js`); the Implement tab,
  Hitch, ‹ › and the swipe are gone; Attach in the column. Tests: 5 new
  Lua tests on the census and the spike rigs, client and backend
  commands, 11 in test.html (the rig fixtures, the layout at 1180×820 in
  both palettes for every fixture and 1 to 6 tools). Checked in the
  browser pane at 1180×820, day and night: mowers (two cards, the All
  row with Turn on all waiting for Unfold), trailers (Tip side "Left" /
  "2 / 4"), baler (three tanks side by side, Reset count "0 bales", its
  two other keys), the truck and its container (the truck's own card,
  no wear or Detach), a weight alone (Also attached only), and five
  tools in the compact form. Where the build differs from the draft:
  the card's second line has the shop's category ("Mowers"); raising is
  never "not now"; "Covered" isn't written on the load; the baler's
  pickup is one of its other keys, not Lower (its `getAllowsLowering` is
  false); the vehicle's attacher-joint keys and Detach are never other
  keys.
