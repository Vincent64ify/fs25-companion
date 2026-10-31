# 0003: Vehicle page with a card per tool (the Implement tab merges in)

Status: built (revisions 2 and 3 live-checked, on the mowers and the trailers; the other rigs open)
Mod: 0.8.16 · Started: 2026-10-26 · Design: canvas [FS25 Companion: Vehicle vs Implement](https://claude.ai/artifact/HvFL9rUTBC7cbDtnNH8WaT)
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

## Revision 2: an ok means the tools moved

Approved by Vincent and built (mod 0.8.14, 2026-10-30). This section is
the revision whole; Behaviour and Commands below say the same where they
changed.

**Why.** Today a command's ok only says a key's handler ran (`stepJob`:
`ok = job.done > 0`). Every failure of the mowers' live check was "ok and
nothing moved" (Unfold and Lower with the engine off, the first Lower all
after Unfold all), caught only by Vincent watching the game. Spikes 0.0.5
and 0.0.6 showed the mod presses the keys as the keyboard does, so what's
missing is knowing whether the press did anything. With that, Lower all
goes back to the game's own key, and a scripted run of the All row is
judged from the files instead of by eye.

**What the player sees.**
- A card's Fold / Unfold, Lower / Raise and Turn on / Turn off, and the
  All row's Fold all, Lower all and Turn on all: the button stays pending
  until the tools start moving the way its label says, then shows the
  new state as today.
- If nothing moves within 1 s of the press: the button shows "Failed"
  for a moment, as a failure does today, with the game's words when the
  tool has them (`whyNot`, `getTurnedOnNotAllowedWarning`), else "Nothing
  moved". On the All row: ok only when every tool that should move did;
  otherwise the reason names the others ("KDD 941 STH: Nothing moved").
  As built: the reason shows on the card's note, and on a note just
  under the All row, for 3 s, as a faded tap's does (a tablet has no
  hover); any failed answer does, not only these.
- **Lower all presses the game's key again** (`LOWER_ALL_IMPLEMENTS`,
  once), not each tool's Lower. If it moves nothing, it fails and says so:
  no second press, no fallback that hides it.
- Not checked yet, answered as today: tip, cover, pipe, tip side, rotate,
  bale reset, the other keys, Detach and Attach. Their rigs haven't had
  their live check; each gets the same check once it has.

**What "moved" means.** After the press the mod reads each tool every
frame, for up to 1 s of game time (`CHECK_MS`):
- fold / unfold: its fold animation moves the asked way
  (`spec_foldable.foldMoveDirection`, or `getFoldAnimTime` changing toward
  it);
- lower / raise: `getIsLowered` becomes the asked state; for a tool that
  lowers through its fold, its fold animation moving the asked way counts
  too (`getIsLowered` stays true while such a tool rises: spike 0.0.6);
- turn on / off: `getIsTurnedOn` becomes the asked state.

The asked state is the one the button's label names, so the label and
the check can't disagree. A tool already in the asked state doesn't
count. Starting to move is enough: a fold takes seconds, and the cab
topic shows the rest.

**The labels in a mixed rig.** Today the All row says "Fold all" only
while every tool is unfolded, "Raise all" only while every one is
lowered, "Turn off all" only while every one is on (`allActions`,
`selectors.js`). The game's key does otherwise at least once: with the
KDF folded and the KDD unfolded, the dashboard said "Unfold all" and the
game's Fold all folded the KDD (spike 0.0.5). So the label follows the
game's key:
- Fold all: "Fold all" while any is unfolded (seen), "Unfold all" when
  all are folded.
- Lower all and Turn on all in a mixed rig: not seen yet. The script's
  run has a mixed step for each; until then their labels keep today's
  rule, and a mismatch shows as a failure naming the tool, which tells
  us the game's rule.

**Data contract.** `command_ack` gains `checked: true` and `unmoved`
(`[{id, name, why}]`, the tools that didn't move) on these actions;
others keep today's fields. Protocol v1 (fields only). The backend's
`CommandAck` model takes the new fields. Web: `COMMAND_TIMEOUT_MS` goes
from 2 s to 5 s (Fold all may raise first for up to 2 s, then the 1 s
check).

| Name | Where from | State |
|---|---|---|
| `getFoldAnimTime()`, `spec_foldable.foldMoveDirection` (1 folded, 0 unfolded on the KDF; the KDD 0 working, 0.317 raised, 1 folded; direction -1 unfolding, 1 folding, 0 still) | Foldable.lua | seen live (spikes 0.0.5, 0.0.6) |
| `getIsLowered`, `getIsTurnedOn` | AttacherJoints.lua, TurnOnVehicle.lua | verified (C2); the lag while rising seen live (spike 0.0.6) |
| `LOWER_ALL_IMPLEMENTS`: one handler, the tractor's; the mod's press acts as Ctrl+V | InputBinding.lua | seen live (spikes 0.0.5, 0.0.6; DONE.md) |
| `spec_attacherJoints.attacherJointCombos.isRunning`, `duration`: Lower all's combo, the rear tools moving when it ends | AttacherJoints.lua | seen live (spike 0.0.7, two tractors; DONE.md) |

**Plan.**
1. Mod (`Commands.lua`): each checked action's job knows the asked
   state per tool; after its last press it waits (a new job phase) until
   each has moved or `CHECK_MS` passed, then answers. Lower all: the
   game's key once; with no live key, each tool's Lower (no key to press
   isn't the same as a key that did nothing). Version 0.8.14.
2. Backend and web: `CommandAck` takes `checked`, `unmoved`; the timeout
   to 5 s; Fold all's label by the game's rule (above), in `allActions`
   and the mod's asked state alike.
3. `scripts/allrow_check.py`: drives a rig from the live backend, as the
   dashboard does, and judges every answer against the cab's states: from
   folded, raised and off, Unfold all, Lower all, Turn on all, Turn off
   all, Raise all, Fold all, three times; then each card's Fold, Lower
   and Turn on and back; then mixed rigs (one tool folded, one lowered,
   one on), an All row button each, to learn the game's rule; then the
   same with the engine off, where every
   answer must be a failure with the game's words and nothing may move.
   It prints one line per step (asked, answered, what the cab showed,
   pass or fail) and a summary.
4. Docs: the sections below take the revision; NEXT.md drops the Lower
   all item.

Risks: the 1 s check holds the command queue (no other command is read
during a job, as today), so a Cruise hold right after an All row tap
waits up to a second. A tool the game moves later than 1 s would read as
"nothing moved": the live check says whether 1 s is enough.

As built (mod 0.8.15): the check is a job phase after the last press
(`checking`, `unmovedOf` in `Commands.lua`), ending once each tool moved,
or `CHECK_MS` (1 s of `g_time`) after the press, **counted from the end
of the tractor's attacher joint combo while it runs**: the game's Lower
all moves the rear tools when the combo ends, `duration` after the press
(2 s on the T7.300 and the Valtra S 286, spike 0.0.7), so a fixed window
would fit one tractor only. At most `CHECK_CAP_MS` (8 s) in all, or
`CHECK_MAX_FRAMES` (240) while game time stands still. The dashboard
waits 10 s. A fold also counts as moved when `getIsUnfolded` turns
the asked way. Turn on all is a job now (the game's key, else the
setters), so it's checked too; the setter Fold all follows the game's
rule. Names in the reason go in driving order (rear first). The mocks'
keys act as the game's do (`SpikeRigs.act`; a `stuck` tool ignores them).

**Acceptance, automated.**
- [x] `mod/tests/run.lua` ("commands, checked"): a key that acts answers
  ok, `checked`, in the frame of the press; one that doesn't move answers
  "Nothing moved" after the wait; with `whyNot`, the game's words
  ("commands, all": "Folding is not allowed while the tool is lowered.").
- [x] Raise on a tool that lowers through its fold: its fold moving counts
  while `getIsLowered` stays true.
- [x] Turn on: ok once `getIsTurnedOn` flips; not ok when it doesn't.
- [x] Fold all and Turn on all with two tools, one of which doesn't move:
  not ok, `unmoved` names it.
- [x] Lower all presses `LOWER_ALL_IMPLEMENTS` once (the mowers dump's
  tractor key), no tool's own Lower; when it moves nothing, it fails, no
  second press; with no live key, each tool's Lower.
- [x] An unchecked action (Tip side) answers as today, no `checked`.
- [x] `backend/tests`: an ack with `checked` and `unmoved` reaches the
  viewer; an unchecked one carries neither.
- [x] `web/test.html`: an implement command waits up to 5 s; a "Nothing
  moved" answer shows on its card and the All row; with one tool folded
  and one unfolded, the All row says "Fold all".
- [x] `client/tests/test_allrow_check.py`: the asked states follow the
  labels; a run that passes, an ok with nothing moved, a failure that
  moved, the engine off.
- [x] Checked in the browser pane at 1180×820, day and night: the notes
  on a card and under the All row (the replay answers "no game (replay)").

**Live check** (the T7.300 with the KDF 341 S and KDD 941 STH, or the
XT 390; the client, `scripts/livewatch.py` and `allrow_check.py`):
- [x] The script's sequence three times with the engine on: every step
  passes, Lower all by the game's key every time.
- [x] The engine off: every step answers with "Please start the engine
  first!" and nothing moves. (Turn on all, the mowers folded, answered
  with the game's "You first need to unfold the tool (mower)!" for each.)
- [x] The mixed steps: what the game's Lower all and Turn on all do with
  one tool lowered (or on) and one not; the labels follow. Lower all
  lowers the rest, Turn on all turns on the rest, Fold all folds while
  one is unfolded.
- [x] Any "Nothing moved": what the game showed then (Vincent). On 0.8.14
  every one was Lower all's rear mower moving 2 s late, which the game
  did (Vincent saw it); 0.8.15 waits for the combo, and none came.
  2026-10-30 (0.8.15, the T7.300 with the KDF 341 S and KDD 941 STH; 36
  of 36; confirmed by Vincent: the game matched every step).

**Decisions to confirm.**
- Starting to move counts as moved, within 1 s, counted from the end of
  the tractor's combo while it runs (live 0.8.14 and 0.8.15).
- Lower all: the game's key and no hidden fallback when it moves nothing.
- Tip, cover, pipe, tip side and rotate get the check after their rigs'
  live checks, not now.
- The All row's labels follow what the game's key does, starting with
  Fold all.

## Revision 3: Tip presses the key the game shows

Approved by Vincent and built (mod 0.8.16, 2026-10-31). Behaviour and
Commands below say the same where they changed.

**Why.** Live (mod 0.8.15, `rig_check.py`, two EDK 650 with wheat and
parsnips): Tip answered ok and nothing tipped everywhere but over a sale
point that took the load. A trailer has two tip keys, I
(`TOGGLE_TIPSTATE`, "Start overloading": into what's under it) and Ctrl+I
(`TOGGLE_TIPSTATE_GROUND`, "Unload here"), and the mod presses the first
with an active event. Both are always active; the game shows one at a
time (spike 0.0.8): I over something that takes the load, else Ctrl+I.
So the mod pressed a key the game had hidden, which does nothing. And
where the game refused (land not ours: "You don't have access to this
land") the answer was ok too.

**What the player sees.**
- One button, as the game has one prompt at a time; its label says
  where the load goes, before the tap: **Tip** over something that takes
  the load (a sale point, a silo), **Unload here** elsewhere (the game's
  own words for Ctrl+I), **Stop** while it tips. A tap does what that
  key does. Two buttons (Tip and a "force tip") were weighed and left
  out (Vincent, 2026-10-31): the game never offers both, so one would
  always be faded on a card that's already tight, and Ctrl+I forces
  nothing (the game still refuses land not ours). To dump beside a sale
  point, move off it, as with the keyboard.
- Tip gets revision 2's check: the button stays pending until the
  trailer starts tipping (`discharging`), else "Failed" with "Nothing
  moved" (the game's own words, as "You don't have access to this land",
  aren't found yet). Stop is checked the same way. Tip all: ok only when
  every trailer started, else the reason names the others.
- Tip all keeps its label; tip side, cover and pipe as today.

**The rule.** Of a command's keys, the mod presses the first the game
shows (`displayIsVisible` not false), else the first active as today.
Only Tip has more than one key, so nothing else changes.

**Data contract.** Each trailer's rig entry gains `tipTo`: `"object"`
while the game shows I, `"ground"` while it shows Ctrl+I, absent when
neither is known (no events: the trailer isn't selected and its keys
aren't registered; then the mod reads `getCanDischargeToObject` on its
current discharge node, true → `"object"`, false → `"ground"`). Protocol
v1 (a field). Web: the label from `tipTo` ("Unload here" for
`"ground"`, else "Tip").

| Name | Where from | State |
|---|---|---|
| an input event's `displayIsVisible`: false on the tip key the game hides, `isActive` true on both | InputBinding.lua | seen in spike 0.0.8 (two places, 2026-10-31) |
| `getCanDischargeToObject(node)` true only over the sale point that took the load; `spec_dischargeable.currentDischargeNode` | Dischargeable.lua | seen in spike 0.0.8 (for `tipTo` when the trailer's keys aren't registered) |
| the ground refusal's words ("You don't have access to this land") | Dischargeable.lua? | unknown: not in the node's fields |

**Plan.** Mod (0.8.16): `liveInputFor` prefers a shown event; `tipTo`
on each trailer (`VehicleState.lua`); Tip (`TOGGLE_DISCHARGE`) and Tip
all checked as Fold and Lower are (`discharging` the asked way). Web:
the card's label from `tipTo` (`vehicleTools.js`). `rig_check.py`
already judges the answers; it prints `tipTo` with each Tip.

**Acceptance, automated.**
- [x] `run.lua` ("commands, tip"): with both tip keys active and Ctrl+I's
  shown, Tip presses `TOGGLE_TIPSTATE_GROUND`; with I's shown,
  `TOGGLE_TIPSTATE`; with neither flag, the first active, as today.
- [x] `run.lua` ("commands, tip"): Tip ok once `discharging` turns; a
  press that tips nothing answers "Nothing moved"; Tip all names the
  trailer that didn't.
- [x] `run.lua` ("capabilities: tipTo"): `tipTo` follows the shown key
  ("object" with I's, "ground" with Ctrl+I's); without events,
  `getCanDischargeToObject`.
- [x] `web/test.html`: a trailer with `tipTo: "ground"` shows Unload here,
  `"object"` or none Tip, discharging Stop.
- [x] Checked in the browser pane at 1180×820, day and night: the
  trailers rig with one card on Unload here, the other on Tip.

**Live check** (the Vestrum 100 with the two EDK 650, loaded; `rig_check.py`):
- [x] On our land: each card says Unload here; it unloads on the ground
  and Stop stops it; Tip all both.
- [x] Over a sale point that takes the load: that card says Tip, and it
  tips into it; the other trailer's still says Unload here.
- [x] On land not ours: Tip fails (what the game shows, Vincent).
  2026-10-31 (0.8.16, the Vestrum 100 with two EDK 650, wheat and
  parsnips; `rig_check.py`; confirmed by Vincent): on our land 14 of 14,
  both cards Unload here, each Tip and Stop by `TOGGLE_TIPSTATE_GROUND`,
  ok once it moved, Tip all both; over the parsnip sale point the front
  card Tip, the rear (wheat) Unload here, Tip by `TOGGLE_TIPSTATE` into
  it and stopped; on land not ours both Tips "Nothing moved", nothing
  tipped, the game warning that we have no access there.

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
  (Vincent, 2026-10-26). Revision 2: "Fold all" while any is unfolded, as
  the game's key folds then (spike 0.0.5); Fold all, Lower all and Turn
  on all answer ok only once the tools moved, a failure's reason on a
  note under the row.
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
| `lower` | the attacher joint lowers it: the input joint's `allowsLowering` (unverified), else `getAllowsLowering` as today; or its fold has a middle position (`spec_foldable.foldMiddleAnimTime`: it lowers through its fold, live 0.8.7); lowering and raising not now without power (`getIsPowered()`: the engine off, live 0.8.9) | `lowered` |
| `fold` | `spec_foldable.foldingParts` has at least one part; not now without power (`getIsPowered()`: the engine off, live 0.8.8) | `unfolded`, `foldMoving` |
| `turnOn` | TurnOnVehicle and `getCanBeTurnedOn()`, which is also false while folded or with the engine off (live 0.8.7): folded, Turn on stays, unavailable | `turnedOn` |
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
unavailable with the game's own words: in its title, and on the card for
3 s after a tap on it, since a tablet has no hover (live 0.8.7; a folded
tool's Turn on without words of the game's: "Unfold first") (spike 0.0.4:
`getIsFoldAllowed` → "Folding is not allowed while the tool is lowered.",
`isDetachAllowed` → "You first need to fold up the tool (mower)!";
`getAllowsLowering` only while the tool is raised: raising stays
allowed, and through the fold `getIsFoldMiddleAllowed`;
`getCanToggleTurnedOn` with `getTurnedOnNotAllowedWarning`, which also
gives a folded tool's Turn on its words;
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
| `FOLD_ALL_IMPLEMENTS` ("Fold all tools"), `TURN_ON_ALL_IMPLEMENTS` ("Turn on/off all tools"), registered on each foldable / turn-on tool | inputBinding.xml | seen in spike 0.0.4; live (0.8.7): one press folds, unfolds or turns on every tool, but won't fold one lowered on its joint |
| `getCanBeTurnedOn()` false while folded or with the engine off | TurnOnVehicle.lua, Foldable.lua | seen live (0.8.7) |
| `spec_foldable.foldMiddleAnimTime`: a tool that lowers through its fold (the rear Samasz XT 390: 0.2) | Foldable.lua | seen in spike 0.0.4; that it means "lowers" seen live (0.8.7: Lower offered in game, none on the card) |
| `getIsFoldMiddleAllowed()`: such a tool may lower now; its Lower key is the tool's own or the tractor's while it's selected | Foldable.lua, AttacherJoints.lua | unverified (mod 0.8.8) |
| `getTurnedOnNotAllowedWarning()` on a folded tool: the game's words for it | Foldable.lua | seen live (0.8.8): the KDF 341 S "You first need to unfold the tool (mower)!", the XT 390 "You first need to fold up the tool (mower)!", as the game's own warning says |
| the fold keys need power: with the engine off they only get the game's "Please start the engine first", while `getIsFoldAllowed` says yes | Foldable.lua | seen live (0.8.8) |
| `getIsPowered()` → false, "Please start the engine first!" while the engine is off (Motorized's; a tool asks its vehicle) | Vehicle.lua, Motorized.lua | seen live (0.8.9): on both mowers, true again once the engine ran |
| lowering and raising need power: with the engine off the Lower key only gets the game's warning | AttacherJoints.lua | seen live (0.8.9; raising: Vincent) |
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

As built (mod 0.8.8): the mod presses the tool's key at once when the
tool already has it live (the selected one; Lower: also the key of what
it hangs on while it's selected); otherwise it selects the
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

**All:** `implement.foldAll`, `implement.turnOnAll` and
`implement.lowerAll` press the game's own `FOLD_ALL_IMPLEMENTS`,
`TURN_ON_ALL_IMPLEMENTS` and `LOWER_ALL_IMPLEMENTS` once: one press acts
on every tool (live 0.8.7; Lower all again since revision 2, after
spikes 0.0.5 and 0.0.6 showed the mod's press acts as Ctrl+V). Each is
checked (revision 2): ok once every tool that should move did, else the
ones that didn't. Lower all lowers every tool while one is raised, else
raises them all; with no live key, each tool's Lower toward that state,
in driving order, the selection put back; when no tool's Lower can act,
the combo; with no tool that has Lower (a combine's header), the key,
else its combo, unchecked. Fold all, when folding, first raises each tool
lowered on its joint that the game won't fold ("Folding is not allowed
while the tool is lowered."; one that lowers through its fold the key
raises itself), as its card's Lower does, then waits until the game lets
it fold (at most 120 frames) and presses the key; the ack names Fold
all's key. When the game lets none fold (the engine off), it presses
nothing and answers with the game's words; the All row's button is then
faded with them (a lowered tool doesn't count: it gets raised, unless
the game won't raise it now). Lower all, without power, presses nothing
and answers with the game's words, its button faded with them. With no live event, every tool's setter: unfold all while one
is folded, else fold them; turn all on (not one the game won't turn on
now), or off once they all are. `implement.tipAll` and `implement.coverAll`
(value 1 = open / tip, 0 = close / stop; no game key) run the one-tool
command on each that has the capability and isn't there yet, in driving
order, then put the selection back; the ack names any the game refused
("EDK 650: …"). Tip and Tip all are checked (revision 3): ok once each
trailer started (or stopped) tipping, by the tip key the game shows.

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
- [x] After the 2026-10-30 live check (mod 0.8.8): `run.lua`
  "capabilities": the XT 390 lowers through its fold; folded, Turn on
  stays, unavailable with the game's warning; its turn on key is never an
  other key (folded or engine off). "aimed commands": Lower through the
  tractor's key. "all commands": the front mower lowered, Fold all raises
  it, waits until the game lets it fold, then presses the key once; the
  raise never taking, the key still comes; folded, Turn on all's setter
  turns nothing on. Each failed on 0.8.7. The mock rigs now start
  unfolded, as the dumps were (direction 1 offers "Fold mower").
- [x] `web/test.html` "a tap on a faded button": the game's reason on the
  card, nothing sent; a folded tool's Turn on says "Unfold first".
- [x] After the 0.8.8 live check (mod 0.8.9): `run.lua` "capabilities":
  no power, fold not now with the game's words; "all commands": the
  engine off, Fold all and Fold press nothing and answer with them.
  `web/test.html`: Unfold all faded with them; a lowered tool doesn't
  fade Fold all. Each failed on 0.8.8.
- [x] After the 0.8.10 live check (mod 0.8.11): `run.lua` "all
  commands": Lower all lowers each raised tool by its own Lower (the
  tractor's key while each is selected), raises them all once all are
  lowered, never presses the game's Lower all key; "implement screen":
  a rig with no Lower key still gets the game's combo. Failed on 0.8.10.
- [x] After the 0.8.9 live check (mod 0.8.10): `run.lua`
  "capabilities": no power, the lowered XT 390 can't raise, with the
  game's words; "all commands": Lower and Lower all press nothing and
  answer with them. `web/test.html`: Lower all faded with them. The Lua
  ones failed on 0.8.9.
  Checked in the browser pane at 1180×820, day and night.

Live check (mod 0.8.8; the spike is done; the rigs above). The open
rigs go through `scripts/rig_check.py` (2026-10-31): it prints what the
dashboard reads of each tool (to hold against the HUD), presses every
card button there and back, Tip side once per side, Reset count, each
tool's other keys twice (not Dump or Unload), Tip all and Cover all, and
with `--attach` Attach; an ok must change the cab, a faded button must be
refused with nothing changed, the selection must come back, and each line
names which way it went (`via`, now on the viewer's ack). LOOK lines are
Vincent's to answer. Judging tested in `client/tests/test_rig_check.py`.
- [x] Front and rear mowers: both cards; each card's Fold, Lower and Turn
  on act on its own mower; Unfold all, Lower all and Turn on all work
  both, one tap each.
  2026-10-30 (0.8.7, New Holland T7.300, Samasz KDF 341 S front, XT 390
  rear; confirmed by Vincent): both cards; the front card's Lower,
  Raise, Fold, Unfold and the rear card's Turn on / off, Fold, Unfold act
  on their own mower only, the selection back on the XT 390 each time;
  Unfold all, Turn on all and Fold all (both raised) move both, one tap
  each. Failed: no Lower on the XT 390's card (it lowers through its
  fold), so no Lower all; Fold all with the front lowered folded only the
  rear: the game's `FOLD_ALL_IMPLEMENTS` acts on every tool but won't
  fold one lowered on its joint ("Folding is not allowed while the tool
  is lowered."), and the XT 390 raises by folding.
- [x] Two trailers: Tip and Uncover per trailer; the three-way tipper's
  Tip side steps as the game's key does.
  2026-10-31 (0.8.15 and 0.8.16, the Vestrum 100 with two Farmtech EDK
  650, `rig_check.py`; confirmed by Vincent): Tip side 28 of 28 over five
  runs, each press a step by `TOGGLE_TIPSIDE` (Back, Grain door, Left,
  Right, four sides), the selection back each time; Tip per trailer and
  Tip all by revision 3. The EDK 650 has no cover (`hasCovers` false),
  so no Uncover; Cover waits for a rig with one.
- [ ] A sprayer with sections: its card's Fold and Turn on act on it
  (the width and sections are left out: open question 4).
- [ ] A plow: Rotate turns it; unavailable with the game's reason while
  raised.
- [ ] A baler: its chamber matches the HUD.
- [ ] A weight alone: Also attached with Lower; no card.
- [ ] A self-propelled sprayer and a tipper truck: the vehicle's own card.
- [ ] After any card button, the game's selected tool is the one it was.
- [ ] Attach is faded until you back up to a tool, lights up with the
  game's prompt, and attaches it.
- [x] A button on a tool that isn't selected acts within half a second
  (select, its key, back), and the game's own refusals come back in its
  words (fold a lowered mower).
- [ ] The selected tool's other keys: the plow's "Allow create fields",
  the baler's "Turn on automatic drop" and "Lower pickup" work as the
  keys do.
- [ ] The baler's count matches the game's bale counter; Reset count
  resets it.
- [x] The rear mower folded for transport still shows Raise / Lower
  (its joint lowers it), unavailable only while the game says so.
- [ ] mod log: which way each command went ("FOLD_IMPLEMENT via
  IMPLEMENT_EXTRA2" or "via setter") for the unverified names above.
- [x] The rear XT 390's card has Lower; it lowers and raises the mower
  (log: "LOWER_IMPLEMENT via LOWER_IMPLEMENT", not "via setter").
- [x] Both mowers lowered and on: one Fold all raises the front one, then
  folds both.
- [x] A folded mower: Turn on faded, Turn on all faded "Unfold first",
  no "Turn on mower" button; a tap on a faded button shows the game's
  words on its card.
  2026-10-30 (0.8.8, confirmed by Vincent): XT 390 Lower and Raise by
  the game's key, Lower all, Fold all from both lowered and on (the
  front raised first, both off and folded, the selection back), the
  folded mowers' faded Turn on with the game's words. Failed: with the
  engine off, Unfold all and Unfold pressed the key and answered ok,
  while the game said "Please start the engine first" and nothing moved.
- [x] The engine off: Fold / Unfold and Unfold all faded with "Please
  start the engine first"; with it on, they work.
  2026-10-30 (0.8.9): Unfold, Unfold all faded with "Please start the
  engine first!", a tap shows it on the card; with the engine on both
  work again and Unfold all unfolded both. Failed: Lower, engine off,
  pressed the key and answered ok while nothing moved; the folded front
  mower lowered at once with the engine on. Raising needs power too
  (Vincent).
- [x] The engine off: Lower / Raise and Lower all faded with the same
  words; with it on, they work.
  2026-10-30 (0.8.10, confirmed by Vincent): Lower, Lower all, Unfold
  and Unfold all faded with "Please start the engine first!"; with the
  engine on, Lower all lowered both (the folded XT 390 by unfolding down
  to work, the folded KDF 341 S in transport) and Raise all raised both.
  Every mower box above confirmed by Vincent the same day.
- [x] Lower all and Raise all (0.8.11, each tool's own Lower): one tap
  lowers or raises both, every time, also right after Unfold all and with
  the KDD in a work mode.
  2026-10-30: replaced by revision 2 (the game's key again); 0.8.15's
  live check: Lower all and Raise all one tap each, 8 of 8, right after
  Unfold all each round (confirmed by Vincent). The KDD in a work mode:
  spike 0.0.6, the mod's press of the key lowered both.

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
- 2026-10-30: live check (0.8.7), mowers, driven from the dashboard in
  the browser pane with `scripts/livewatch.py` reading log.txt and the
  stream, Vincent confirming in game (the 0.8.8 to 0.8.10 branch of
  2026-10-29 dropped). Each card button works on its own mower; Fold
  all, Unfold all and Turn on all work on both from raised. Fold all's
  failure has a new cause: the game's own key folds every tool but
  refuses one lowered on its joint, so the fix is to raise first, not
  to select each tool. Also seen: a faded button's reason is only in its
  hover title, out of reach on a tablet; Turn on all is hidden, not
  faded, while a tool is folded; the folded XT 390 shows its "Turn on
  mower" key as an other key, which only gets the game's warning; no
  Lower on the XT 390 (as on 2026-10-29).
- 2026-10-30: fixes after the mowers' live check (mod 0.8.8): Lower for a
  tool that lowers through its fold, pressed with the tractor's key when
  the tool has none (from the dropped 0.8.8 branch); Fold all raises what
  the game won't fold while lowered, then presses its key once; a folded
  tool keeps Turn on, faded with the game's warning, and its turn on key
  is never an other key; a tap on a faded button shows the reason on the
  card for 3 s. The mock rigs' fold direction was backwards (they started
  folded); the web's rig fixtures now show the dumps' working rigs.
- 2026-10-30: live check (0.8.8), mowers, by Vincent: the XT 390's Lower,
  Lower all, and Fold all from both lowered and on work; the folded
  mowers' Turn on is faded with the game's words (the XT 390's "fold up"
  is the game's own). New: with the engine off the fold keys only get
  "Please start the engine first". Fixed in 0.8.9: fold is not now
  without power (`getIsPowered`, unverified), so Fold / Unfold and the
  All row's are faded with those words, and Fold all presses nothing.
- 2026-10-30: live check (0.8.9), mowers: with the engine off, the fold
  buttons and Unfold all are faded with the game's "Please start the
  engine first!" (`getIsPowered` answers it); Lower still pressed the key
  for nothing, and raising needs power too (Vincent). Fixed in 0.8.10:
  lowering and raising are not now without power, on the cards and Lower
  all.
- 2026-10-30: live check (0.8.10), the rear mower swapped for a Samasz
  KDD 941 STH (a butterfly mower that lowers through its fold, like the
  XT 390): engine off, everything but Detach faded with the game's
  words; with it on, the KDD card's Unfold, Lower, Turn on / off, Raise
  and Fold by the game's keys, and its other keys once unfolded ("Toggle
  work mode", "Work mode left / middle / right"; Work mode left pressed
  `WORKMODE_LEFT`). Unfold all, Turn on all and Fold all from both
  lowered and on (the front raised first, the selection back) worked. To
  look at: the first Lower all after Unfold all answered ok and nothing
  lowered, the second lowered both (the KDD was in work mode left; in
  game nothing moved and no warning showed, Vincent); the other keys'
  labels are cut off four to a row ("Toggle work …"). Next: the same with
  the game's own Lower all key, to tell the game's behaviour from the
  mod's. Vincent: twice through the dashboard, the same (the first did
  nothing, the second lowered both); with Ctrl+V, the first press
  lowered both. So the mod's press differs from the keyboard's (it calls
  every handler registered for the key; which ones are there is
  unknown). Fixed in 0.8.11: Lower all is each tool's own Lower, which
  worked every time on all three mowers.
- 2026-10-30: spikes 0.0.5 and 0.0.6 (`csKeys`, `csTrace`, `csPress`) on
  the T7.300 with the KDF 341 S front and KDD 941 STH rear, mod 0.8.13,
  to find why the mod's Lower all failed every other time. Findings:
  - **One handler per All key**, raised or lowered, folded or not:
    `LOWER_ALL_IMPLEMENTS` belongs to the tractor; `FOLD_ALL_IMPLEMENTS`
    and `TURN_ON_ALL_IMPLEMENTS` to the selected tool (they follow the
    selection). So the mod's "call every handler" never pressed twice.
  - **The mod's press acts as the keyboard's.** 15 traced presses: the
    dashboard's Fold all and Turn on all did what Ctrl+X and Ctrl+B did,
    and `csPress` (Lower all exactly as `runInputAction` calls it, 8
    arguments) lowered both on the first press, unfolded right before,
    the KDD in work mode left (Vincent saw the same). The keyboard passes
    two more: device category 253 and the binding; the handlers don't
    need them.
  - Ctrl+V pressed about a second into an unfold lowered both: not
    "pressed while moving". While a tool rises, `getIsLowered` stays
    true until its fold animation ends.
  The 0.8.10 failure is not the key press; it was elsewhere in that
  build's command flow (0.8.8 to 0.8.11 are one commit, so it can't be
  looked at again). What stays true: an ack's ok only says a handler
  ran. Next (Vincent, 2026-10-30): answers that check the tools moved,
  then Lower all back on the game's key (NEXT.md). The four dumps are in
  `mod/tests/fixtures/spike0003/keys-*.json`.
- 2026-10-30: revision 2 drafted: an ok means the tools moved (fold,
  lower, turn on, on the cards and the All row), Lower all back on the
  game's key, Fold all's label by the game's rule (the dashboard said
  "Unfold all" where the game folded), and a scripted live check.
  Waiting for approval.
- 2026-10-30: revision 2 approved by Vincent and built (mod 0.8.14). Mod:
  a check phase in the jobs (`checking`, `unmovedOf`), `checked` and
  `unmoved` on the ack; Lower all on the game's key, Turn on all a job;
  Fold all (key and setter) folds while one is unfolded. Backend: the
  viewer's ack carries `checked`, `unmoved`. Web: the wait 5 s, "Fold
  all" by the game's rule, a failed answer's reason on the card and
  under the All row. `scripts/allrow_check.py` for the live check. Tests:
  a new Lua test, the mock rigs' keys act as the game's (older tests
  updated to the new rules), a backend test, test.html, the script's
  judging; 129 Python/Lua tests and test.html pass. Checked in the
  browser pane at 1180×820, day and night.
- 2026-10-30: live check (0.8.14), `allrow_check.py` on the T7.300 with
  the KDF 341 S and KDD 941 STH. A first run pressed while the KDD still
  moved (the script's wait was too short; fixed: nothing moving for 2 s,
  at least 4 s a step). The second: 29 of 36 passed (the log is in
  `fixtures/spike0003/allrow-run2-0.8.14.txt`): Unfold, Fold, Turn on and
  Turn off all three times; all 12 card buttons; the mixed rigs (Lower
  all lowers the rest, Turn on all turns on the rest, Fold all folds
  while one is unfolded: the labels match); the engine off, each All
  button failed with the game's words and nothing moved. The 7 failures
  were all Lower all and Raise all: the KDD moved 2.0 s after the KDF,
  after the 1 s check. Vincent saw the same. A card's own Lower moved the
  KDD at once.
- 2026-10-30: spike 0.0.7 (`csCombo`) on the T7.300 and a Valtra S 286
  (Vincent: the same 2 s): the game's Lower all runs the tractor's
  attacher joint combo (`attacherJointCombos`, `duration` 2000 ms), the
  rear moving when `isRunning` turns false. Rather than a fixed delay
  (Vincent: other tractors may differ), mod 0.8.15's check waits while
  the combo runs, then 1 s; at most 8 s; the dashboard waits 10 s. The
  Valtra's raise recording is `fixtures/spike0003/combo-valtra-raise.json`.
- 2026-10-30: live check (0.8.15), `allrow_check.py` on the T7.300 with
  the KDF 341 S and KDD 941 STH: **36 of 36 passed**
  (`fixtures/spike0003/allrow-run3-0.8.15.txt`). The All row three times
  from folded, raised and off, Lower all and Raise all included, each by
  the game's key, ok once the KDD moved at the combo's end; the 12 card
  buttons; the mixed rigs (the labels match the game); the engine off,
  every All button a failure with the game's words, nothing moved.
  Vincent: the game matched every step. Revision 2 live-checked on the
  mowers; the other rigs' boxes (trailers, sprayer, plow, baler, weight,
  truck, Attach) are still open.
- 2026-10-31: `scripts/rig_check.py` for the open rigs' live check: every
  card button on any rig, judged from the cab (ok means it changed, a
  faded button is refused, the selection comes back), Tip side per side,
  Reset count, the other keys, Tip all and Cover all, Attach. The
  backend passes the mod's `via` to the viewer, so each line says which
  way a command went. The sprayer's box drops the width (open question
  4). Tests: `client/tests/test_rig_check.py`, a backend test; 141
  Python/Lua tests pass.
- 2026-10-31: live check, `rig_check.py` on the Case IH Vestrum 100 with
  two Farmtech EDK 650 (loaded with wheat), mod 0.8.15. Tip side 16 of
  16 over two runs, each press a step (Left, Right, Back, Grain door) by
  `TOGGLE_TIPSIDE`, the selection back each time. Tip answered ok by
  `TOGGLE_TIPSTATE` every time but moved nothing twice where the game
  refused: over a sale point that doesn't take wheat, and on land not
  ours (Ctrl+I: "You don't have access to this land", Vincent); the
  dashboard showed neither. So Tip needs the moved check (NEXT.md). The
  run on our own land is next.
- 2026-10-31: spike 0.0.8 (`csKeys sale`, `csKeys ground`, the Vestrum
  100 with the EDK 650s, one over a sale point taking parsnips): both
  tip keys always `isActive`; the game hides the one it doesn't offer
  (`displayIsVisible` false), I over the sale point, Ctrl+I elsewhere;
  `getCanDischargeToObject` true only over the sale point. Revision 3
  drafted; Vincent chose one button whose label says where the load
  goes over two (Tip and "force tip"), approved, and built (mod 0.8.16):
  `liveInputFor` presses a shown key first, `tipTo` on each trailer,
  Tip and Tip all checked; web: Unload here / Tip / Stop. Tests: two Lua
  tests (the mocks' tip keys act as the game's), test.html; 142
  Python/Lua tests and test.html pass. Checked in the browser pane at
  1180×820, day and night.
- 2026-10-31: live check (0.8.16), `rig_check.py` on the trailers: on
  our land 14 of 14 (Unload here, each by Ctrl+I's key, Tip all both);
  over a parsnip sale point the front trailer's card Tip, tipped in by
  I's key and stopped, the rear's Unload here; on land not ours Tip
  "Nothing moved" and nothing tipped (the game warned we have no access).
  Confirmed by Vincent. Revision 3 live-checked; the trailers' box
  ticked (no cover on the EDK 650). The tip facts move to DONE.md. Seen
  once: the run's first reading had the front trailer's `tipTo` still
  "object" after driving off the sale point; it read "ground" by the
  press (the rig was likely still settling). Next rigs: sprayer, plow,
  baler, weight, truck, Attach.
