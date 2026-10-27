# 0003: Vehicle page with a card per tool (the Implement tab merges in)

Status: approved
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
  - head: badge (yellow while working), the model, then the brand, kind
    and side on the line under it ("Krone · Mower · Front"); Working
    chip; the game's selected one has the selection outline. A tap on
    the head selects it in game; the page stays;
  - stats: speed against the tool's limit, working width, area this run,
    and the tool's own wear. The vehicle's own card has no wear (the band
    shows it) and no Detach;
  - **a button for each capability** the mod sends, labelled with what a
    tap does ("Raise", "Fold", "Turn off", "Tip", "Uncover", "Pipe out",
    "Rotate", "Detach"); unavailable (45%) while the game says it can't
    now (a folded tool can't turn on). Buttons are control-size (80 px
    tall), as many columns as there are buttons;
  - **tip side**, for a trailer that tips more than one way: one button,
    "Tip side" over the current side ("Back"), that steps to the next
    side, as the game's key does;
  - **working width**, for a tool with sections (sprayers, spreaders):
    the width used against the full one ("30 / 36 m"), a segment per
    section (off ones grey), and Left in / Left out / Right in / Right
    out;
  - its tanks with their estimates ("Seeds · 58%", "empty ≈ 42 min",
    "Runs out first"), as the Implement card has them today; a load
    ("Wheat · 92%", "Covered").
- **All row** (two or more working things): one button per capability
  that two or more of them share, acting on each in turn: Unfold all /
  Fold all, Lower all / Raise all (the game's own Ctrl+V), Turn on all /
  Turn off all, Tip all, Uncover all / Cover all. Lit while all are in
  the "on" state; the label says what a tap does. Turn on all is
  unavailable while one of them is folded, with "Unfold first" under it
  (Vincent, 2026-10-26).
- **Also attached:** each rig member with no card, one line ("Weight
  1,500 kg · New Holland · Weight · Front · Raised") with its buttons
  (Lower / Raise for a weight, Detach).
- **How many fit (1180×820, no scrolling; Vincent, 2026-10-26):** one card
  full width; two side by side; three in a row and four two by two, in
  the compact form (head, buttons, the main meter); five or six, three by
  two, compact. More than six: open question 2.
- **Nothing attached:** the band, "Nothing attached", and Attach in the
  column. Without a vehicle: "Get in a vehicle to see its tools here".
- **Attach** (replaces Hitch, in the column on every page that has it):
  faded until the game has something in reach to attach (its own Attach
  prompt is up), then it attaches that. Detaching is each card's Detach
  (Vincent, 2026-10-26).
- **Taps never change the page** (spec 0002 revision 2).
- **Day and Night:** both palettes. **Compact (portrait):** one column,
  the cards stacked.

## Capabilities: one rule for every tool

The mod sends, per rig member (the vehicle included), `can`: the actions
the game's parts on it allow. Each comes from a specialization being
there and, where the game has one, its own check:

| `can` | From the game | State sent with it |
|---|---|---|
| `lower` | an attacher joint that lowers (`canLower`) | `lowered` |
| `fold` | Foldable with folding parts | `unfolded`, `foldMoving` |
| `turnOn` | TurnOnVehicle | `turnedOn` |
| `tip` | Trailer / Dischargeable | `discharging` |
| `tipSide` | a Trailer with two or more tip sides | `tipSide {name, index, count}` |
| `cover` | Cover | `cover {open}` |
| `pipe` | Pipe | `pipe {out, moving}` |
| `rotate` | a Plow that rotates | `plow {rotated}` |
| `width` | VariableWorkWidth | `width {used, full, sections: [on…]}` |
| `detach` | attached, and `isDetachAllowed` says yes | |

Each also carries `canNow` where the game answers why not ("You first
need to unfold the tool"), so a button is unavailable with the game's own
reason in its title. The page reads nothing else to decide a button: a
type it has never seen gets whatever its parts allow.

## Data contract

All additions; Protocol v1 is unchanged. The names marked unverified come
from the spike first (Plan, step 1); this table changes with its results.

- **Mod → backend** (`cab`):
  - every `cab.rig[]` entry gains `can` (array of the names above) and
    the states that go with them (`tipSide`, `plow`, `width`; the others
    are sent today);
  - `cab.attachable`: true while something is in reach to attach,
    absent otherwise.
  - The vehicles topic's implements already carry brand, name, category,
    fills, workWidth, speedLimit and wear.
- **Backend:** the new command names (Commands) in
  `backend/app/protocol.py` and `client/commands.py`.
- **Web:**
  - `selectors.js`: `canOf(e)`, `isWorkingThing(e, v)`, `cardsOf(v, cab)`
    (the cards in driving order), `alsoAttached(v, cab)`, `allActions(cards)`;
  - a new `vehicleTools.js`: the All row (`toolsAll`), the cards
    (`toolCards`, with `toolCard` drawn from `can`), Also attached
    (`toolsAlso`);
  - `controls.js`: Attach (from Hitch); each card's buttons send their
    command with the tool's id;
  - `theme.js`: the Vehicle screen's slots; the Implement screen goes;
    `main.js`: a saved "implement" screen opens Vehicle.

| Name | Where from | State |
|---|---|---|
| `setFoldState(getToggledFoldDirection())`, `setIsTurnedOn`, `getIsTurnedOn`, `foldable`, `unfolded`, `canTurnOn`, `getIsLowered` | Foldable.lua, TurnOnVehicle.lua, VehicleState.lua | verified (PLAN.md, C2) |
| `setSelectedObject` (select a tool), `isDetachAllowed` | Vehicle.lua, AttacherJoints.lua | verified (PLAN.md, C3) |
| `LOWER_ALL_IMPLEMENTS`, pipe, discharge, cover (keys and fields) | inputBinding.xml, Pipe.lua, Dischargeable.lua, Cover.lua | built (mod 0.8.0); live check open (PLAN.md, Open checks) |
| `getAIWorkAreaWidth()`, `getSpeedLimit()` | WorkArea.lua, Vehicle.lua | built (mod 0.8.0); live check open |
| the census: `g_vehicleTypeManager` and each type's specialization names | VehicleTypeManager.lua | unverified (spike) |
| a tool's own "can't now" reason (e.g. `getIsTurnedOnAllowed`, `getIsFoldAllowed` and their warnings) | TurnOnVehicle.lua, Foldable.lua | unverified (spike) |
| a trailer's tip sides: the list, the current one, the key that changes it | Trailer.lua | unverified (spike; Vincent, 2026-10-27) |
| `spec_variableWorkWidth`: sections, used and full width, the keys per side | VariableWorkWidth.lua | unverified (spike; Vincent, 2026-10-27) |
| `spec_plow`: whether it rotates, its state, the key | Plow.lua | unverified (spike) |
| `spec_baler`: the chamber's fill unit, a bale count or a bale-dropped event | Baler.lua | unverified (spike) |
| what's in reach to attach: `spec_attacherJoints.attachableInfo`, or the ATTACH action event's active state | AttacherJoints.lua | unverified (spike) |
| no game key for "fold all" or "turn on all" (the mod loops) | inputBinding.xml | unverified (spike) |

## Commands

**Aimed at one tool:** `implement.lower`, `implement.fold`,
`implement.turnOn`, `implement.unload`, `implement.cover` and
`implement.pipe` take the tool's id as their value (without one, as
today: the tool the game's key acts on). The mod does what a player
does: selects that tool (`setSelectedObject`), presses the action's key,
and puts the selection back if the tap wasn't on the selected tool. So
every game rule (unfold first, weight limits, multiplayer) applies, and
a refusal comes back in the ack with the game's reason.

New, each with the tool's id:
- `implement.tipSide`: the key that steps the tip side;
- `implement.rotate`: the plow's rotate key;
- `implement.widthLeftIn`, `widthLeftOut`, `widthRightIn`,
  `widthRightOut`: the variable width keys.

**All** (value 1 = on / unfold / open, 0 = off / fold / close):
`implement.foldAll`, `implement.turnOnAll`, `implement.tipAll`,
`implement.coverAll`: the mod runs the one-tool command on each working
thing that has the capability and isn't there yet, in driving order,
then puts the selection back; the ack names any the game refused.
`implement.lowerAll` stays the game's own key.

`hitch.toggle` becomes Attach's: the attach key, only while
`cab.attachable`. `implement.select` and `implement.detach` are
unchanged.

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
   attached, the All row.
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
- [ ] `mod/tests/run.lua` "capabilities": for every type in the census
  fixture, the rule's `can` from its specializations (built as mock
  objects), and the states for each; a part the rule doesn't know adds
  nothing.
- [ ] `mod/tests/run.lua` "aimed commands": a one-tool command with an id
  selects that tool, presses the key and puts the selection back; a
  refusal returns the game's reason.
- [ ] `mod/tests/run.lua` "all commands": each skips what can't or is
  already there, in driving order, and restores the selection;
  `cab.attachable` follows the attach prompt.
- [ ] `client/tests`, `backend/tests`: the new commands and their values
  pass through; others are refused.
- [ ] `web/test.html` "rig fixtures": for each dumped rig, the cards, each
  card's buttons, Also attached and the All row are what the fixture
  says (mowers, two trailers with the three-way tipper, sprayer with
  sections, plow, baler, weight alone, tipper truck, a plain tractor).
- [ ] `web/test.html` "buttons from can": a made-up tool with an unknown
  part and `can: ["fold", "turnOn"]` gets exactly Fold and Turn on; a
  button the game can't do now is unavailable with its reason.
- [ ] `web/test.html` "vehicle card": the sprayer and the truck have one
  (no wear, no Detach); a tractor with a seeder doesn't.
- [ ] `web/test.html` "tabs": Map and Vehicle only; a saved "implement"
  opens Vehicle; Attach faded without `cab.attachable`.
- [ ] `web/test.html` "layout": every fixture, and made-up rigs of one to
  six working things, drawn at 1180×820 in day and night: nothing
  overflows, no scrolling, every button 48 px or more.
- [ ] Replay in the browser pane at 1180×820, day and night: the
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
- From spec 0003's first draft: no page of its own for a weight; the cards
  fit without scrolling; Turn on all unavailable while a tool is folded;
  Hitch becomes Attach, Detach per tool (Vincent, 2026-10-26).

## Out of scope / open questions

1. **Bales this session:** if the game keeps no count, count them by
   watching the chamber drop from nearly full to empty, or leave the
   count out? Decide after the spike (Vincent, 2026-10-26).
2. **More than six working things:** rare; scroll, or the selected one's
   card and a list for the rest? Decide when a dump has one.
3. The Loader page keeps its own cards (spec 0002); a loader rig's other
   tools (a seeder behind a tractor with a front loader) show there as
   strip tiles only. Revisit if it comes up.
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
