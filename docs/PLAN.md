# Plan

What's next for FS25 Companion. What's already built, and the game API facts
it relies on, are in [DONE.md](DONE.md). Small fixes go in
[NEXT.md](NEXT.md). New features start as a spec in
[specs/](../specs/README.md): written and approved before the code, kept
up to date until the live check.

## Where things stand (2026-10-25)

- Phases 0 to 4 of the rework are built and run live on Windows (Solek, and
  Kinlaig, a paid DLC map): the file stream, the client and backend, and the
  Leaflet map with the PDA's places, every vehicle, farmlands and fields.
- Themes T0 to T5 are done: the approved design, themes as data, our own
  icon set, and the New Holland style's chrome, Map screen and Vehicle
  screen in day and night, chosen from a Settings panel that Default has
  too; it fits every tablet and monitor size checked, goes full screen, and
  can be added to a tablet's home screen. T6, more data from the game
  (fuel usage, DEF, cruise, fill levels, PTO, hitch, AI job, units), is
  built and waiting for a live check. The season, the engine-on reading and
  the map positions are confirmed in game.
- Controls C0 to C3 are done and work live on Windows (mod 0.7.1): lights,
  cruise, engine, AI worker and the implements from the dashboard, with
  the game's state shown the same frame; tapping a tool selects it in game.
- The Implement screen is built (mod 0.8.0, see [THEMES.md](THEMES.md#implement-screen-design-2026-10-24)):
  the rig band, the implement card with its buttons and tank estimates,
  the details card, Lower all, Pipe, Unload / Tipping and Cover. Its live
  check is under way: the Trailer Fill Limit (MAX and the weight limit on
  the fill bars, mod 0.8.1) and a combine unfolding itself (mod 0.8.2) are
  confirmed. The Map's field and farmland panel is one land panel
  (`3648def`).
- The Harvester screen is built, revision 2 (mod 0.8.4, spec
  [0001](../specs/0001-harvester-screen.md)): the Vehicle tab's page for a
  combine, picked by itself from what you drive (a setting, on by default)
  or from the tab's menu; a band with the tank, until full, yield and
  speed, then Combine and Header cards whose tiles are their buttons.
  Waiting for its live check; mod 0.8.4 is to install.
- macOS is still to test, and a few things are still to confirm in game (see
  [Open checks](#open-checks)).

## Ground rules

These decisions hold for all the work below:
- **Same on Windows and macOS.** The mod writes a plain NDJSON file and the
  client tails it: no pipes, sockets or OS-specific code in the mod.
- **No build step.** Vanilla ES modules with `// @ts-check` and JSDoc types.
  Libraries and fonts are vendored (Leaflet, Archivo), so the dashboard
  works on a LAN without internet.
- **One piece per feature.** One collector per topic in the mod, one layer or
  panel per feature on the web, and nothing to change in between.
- **One control per action.** Whatever is on screen at once, the chrome
  included, offers each action through one control only: no second engine
  button, and no Map button on a screen, since the bottom nav already opens
  the Map. Before adding a control, check that nothing visible does it yet.
- **World meters everywhere.** Positions stay in world (x, z) from the mod to
  the screen. The one transform lives in `web/src/map/mapView.js`.
- **Never break the game.** Game API names that aren't verified go through
  the guards in `mod/src/Api.lua`. A failing call drops one topic, never the
  game.
- **Protocol v1.** Topics may gain fields freely, and the web ignores unknown
  ones. `v` changes only for breaking changes.
- **Local or hosted.** The backend runs inside the client, or as a hosted
  relay with pairing codes. Uploads need the client's token.
- **Game files stay the user's.** Images and textures are read from the
  user's own install at runtime and never committed. Encrypted archives
  (`.dlc`, `dataS.gar`) stay closed.
- **Light footprint.** The goal is an installer that touches as little of
  the user's computer as it can. Read from the game only what we can't make
  ourselves (the map overview); draw the rest (icons). Every new cache,
  file or upload has to earn its place.

## Next: Themes and layouts

Planned in [THEMES.md](THEMES.md): themes based on the brands' in-cab
terminals, each with its own layout and screens. The first is a New Holland
style, after the IntelliView 12. The old Default theme was removed on
2026-10-24: New Holland style is the default until more brands come.

| Phase | What | Status |
|---|---|---|
| T0 | Design in Claude Design: a style frame, then the Map and Vehicle screens in both palettes and every size class | done 2026-10-23 |
| T1 | Foundation: themes as data, widgets, tokens. No visible change | done 2026-10-23 |
| T2 | Our own SVG icon set, in the cab-symbol style | done 2026-10-23 |
| T3 | New Holland style: chrome and Map screen | done 2026-10-23 |
| T4 | Vehicle screen: hero readout, condition tiles, implements, vehicle card | done 2026-10-23 |
| T5 | Responsive pass across tablets and monitors, full screen, home screen | done 2026-10-23 |
| T6 | More data from the game (can start any time) | built 2026-10-24, live check open |

## Now: Controls (control the game from the dashboard)

Buttons that trigger in-game actions, for example lights, beacon, hazard,
turn signals, engine, cruise control, PTO / implement on, lower / raise,
attach / detach and the AI worker. The icons are our own SVG set (see
[THEMES.md](THEMES.md#icons)), and the themes already reserve room for the
buttons and show their state.

Priorities (Vincent, 2026-10-24): a tap must feel instant and the in-game
state must show on the dashboard right away; no feature may be missing on
macOS. The main setup is a tablet on the LAN.

**Decision: one in-mod command channel, the same on Windows and macOS.**
Plan doc with the full comparison:
[Controls: plan](https://claude.ai/artifact/LeewQsC11ChSX2L58XRtBi).

| | Key presses (`SendInput` / `CGEventPost`) | In-mod command channel (chosen) |
|---|---|---|
| Feedback after a tap | next `vehicles` tick, up to 500 ms + 50 ms tail | same frame, about 30–50 ms end to end (estimate) |
| Confirmation | none | `command_ack` with ok or the reason |
| FS25 must be focused | yes | no |
| macOS | own code path + Accessibility permission | identical to Windows |
| Key binds | parse `inputBinding.xml` | not needed: actions by name |
| Targeted actions (cruise to 18 km/h, detach one implement) | impossible | through the game API |

Key presses stay a fallback, only if the spike shows the mod can't read
command files.

**How a tap travels:**
1. The dashboard shows the control as *pending* on touch-down and sends
   `{"type":"command","id":"c42","action":"lights.toggle"}` over its
   WebSocket.
2. The backend accepts `command` messages from paired viewers only, with an
   action on a fixed list, and forwards them to the client only.
3. The client writes `modSettings/FS25_Companion/cmd/<n>.xml` (temp file,
   read back once, then rename, atomic on NTFS and APFS), numbered from 1
   per game session. The read-back takes the first-open cost off the
   game's frame (see the C0 results).
4. Every frame the mod checks `fileExists` for the next number. When it's
   there it reads it with the GIANTS XML API, checks the action is allowed
   now, and runs it through the same action event callback a key press
   triggers (rebinds, mod actions and multiplayer events just work). Actions
   no key has go through the game API directly.
5. In the same frame the mod sends `command_ack {id, ok, reason}` and the
   `cab` topic, then flushes.
6. The client forwards the ack, deletes the command file and polls the
   stream every 10 ms for 2 s after a command (50 ms otherwise).

**The `cab` topic** holds only what the controls show (lights, beacon,
hazard, turn signals, engine, cruise state and speed, PTO, each implement
lowered and on, AI worker). The mod compares it every frame and sends it
when something changes, so the dashboard also follows keys pressed in game.
The 500 ms `vehicles` topic keeps the rest.

**Held controls** (`press` and `release`, released by the mod 300 ms after
the last keep-alive) are on hold: the front loader was their only user, and
Vincent ruled out front loader and crane control from the dashboard
(2026-10-24, "not efficient").

**Security.** Only paired viewers may send commands; the backend, the client
and the mod each accept only actions from the known list.

| Phase | What | Status |
|---|---|---|
| C0 | Spike: can the mod see and read a client-written file every frame, fresh and cheaply; can it run an action by name; round-trip time ([spike/README.md](../spike/README.md#command-spike-c0)) | done on Windows 2026-10-24 (results below); macOS to run |
| C1 | One control (lights) end to end: protocol, backend relay, client file writer, mod reader, ack, `cab` topic | done 2026-10-24: works live on Windows (mod 0.5.0); light stages as dots (0.5.1) and the reverse-light fix (0.5.2) confirmed live |
| C2 | The first control set in both themes, held controls with auto-release | done 2026-10-24 (`112c665`): works live on Windows (mod 0.6.3, after three live rounds); reverse cruise dropped; held controls (press / release) moved to C3 |
| C3 | Pick one implement precisely: the whole rig as a tree, Select (tap a tile selects that tool in game), actions aimed at a chosen tool (detach it, fold it); cruise to a set speed; round-trip readout in Settings. No front loader or crane control | done 2026-10-24: confirmed live by Vincent (mod 0.7.1, polish up to `6fe5b93`): `cab.rig` and `cab.keys`, Select / Prev tool / Next tool / Detach, Attached rows pick a tool, buttons name their tool, round trip in Settings |
| C4 | Live check on Windows and macOS, multiplayer as client and host | |

**C0 results (Windows, 2026-10-24).** The channel works:
- 50 commands, file written to ack seen: median 19 ms, p95 32 ms, max 43 ms
  (the game ran at about 90 fps).
- A file rewritten 10 times was read fresh 10 times out of 10.
- `fileExists` every frame costs 0.08–0.11 ms on average, 0.37 ms at most.
- Running an action by name works: `TOGGLE_BEACON_LIGHTS` through
  `g_inputBinding.actionEvents[<action>]` (keyed by the action, not its
  name) toggled the beacon, and `cab` showed it in the same frame. The
  direct setter (`setBeaconLightsVisibility`) works too.
- `csInput` in a tractor listed 70 active actions, among them ATTACH,
  DETACH, LOWER_IMPLEMENT, LOWER_ALL_IMPLEMENTS, TOGGLE_LIGHTS,
  TOGGLE_HIGH_BEAM_LIGHT, TOGGLE_TURNLIGHT_HAZARD / LEFT / RIGHT,
  TOGGLE_CRUISE_CONTROL, TOGGLE_MOTOR_STATE, TOGGLE_AI and
  AXIS_FRONTLOADER_ARM.
- **Never `io.open(path, "r")`:** the game warns "only write mode ('w') is
  allowed" and opens the file for writing, which empties it (seen in 0.1.1:
  every reader after it found an empty file). `io.lines` is nil.
- **Reading cost:** the first open of a new command file costs about 4 ms
  (3.3–27 ms) with either `loadXMLFile` or `XMLFile.load`; reading the same
  file again right after costs 0.06 ms. So it's the first open, not the
  reader, likely Windows scanning a newly written file.
- **Fix, verified in 0.1.2:** when the client reads its own temp file back
  before the rename, the mod's first open drops to 0.07–0.23 ms (30 of 30
  commands), against 3.5–19 ms without it. The round trip stays at a 20 ms
  median. C1 uses `XMLFile.load` (both readers cost the same) plus the
  read-back.

**C1 as built (2026-10-24, mod 0.5.0).** Lights is wired in both themes
(New Holland's control column, and a Controls card in Default).
- Web: `src/commands.js` (ids, 2 s timeout), `connection.js`
  `sendCommand`, `ui/control.js` (pending on pointerdown, the game's state
  after the ack, "Failed" with the reason for 2 s), and the controls read
  lights, engine and cruise from `cab` when the mod sends it.
- Backend: the allow-list is `protocol.COMMAND_ACTIONS`; a command goes to
  the paired client with the backend's own `ref` (two viewers' ids can't
  clash), and the ack goes back only to the viewer that sent it. Refused
  at once: an action off the list, no client, and pending commands when
  the client leaves. `command_ack` is an event: relayed, never stored.
- Client: `client/commands.py` maps `lights.toggle` to `TOGGLE_LIGHTS`,
  writes `<n>.xml.tmp`, reads it back, renames it; numbers from 1 per
  session or from `hello.commands.next` when started mid-session, clears
  `cmd/` on a new session, deletes each file on its ack, and polls the
  stream every 10 ms for 2 s after a command. Acks queue in order behind
  the batch's state, so the cab arrives before the ack.
- Mod: `Commands.lua` (fileExists for the next number, `XMLFile.load`,
  session and allow-list, the input event's callbacks, else
  `setLightsTypesMask`), `collectors/Cab.lua` (every frame, sent on
  change), `VehicleState.lua` (lights, engine, cruise for `vehicles` and
  `cab`; the beacon now reads `beaconLightsActive`, as C0 saw).
- Without the game, with a stand-in for the mod: tap to new state 23 ms
  (first tap 58 ms) through the real client and backend; with no answer
  the control falls back after 2.0 s.
- Live (Vincent, 2026-10-24): works. Each tap steps the lights like the
  key: stage 1, 2, 3, then off.
- **Light stages (mod 0.5.1):** the Lights button shows one dot per stage
  the vehicle has, lit up to the current one (●●○ = stage 2 of 3), in
  both themes. `cab.lights` (and `vehicles`) gain `stage` (0 = off) and
  `stages`, from the vehicle's `lightStates` / `currentLightState` (FS22
  names, unverified), else matched by mask; no dots when unreadable.
  Live (Vincent): the dots look right.
- **Reversing (mod 0.5.2):** the reverse lights are in the same light
  mask, so Lights read "on" while reversing with the stage at 0 (seen in
  the live stream). With stages known, "on" now means a stage is on (or,
  from the mask alone, one of the stages' own lights). Confirmed live
  (Vincent, 2026-10-24).

**C2 as built (2026-10-24, mod 0.6.0).** One button per toggle: it sends
the toggle and shows the game's state from `cab`; no on/off pairs (the
old Raise / Lower pair is one Lower button).
- Controls, in both themes (New Holland's column; Default's Controls card,
  now with the same three groups):
  - Lights: Lights, High beam, Beacon, Hazard, Turn L, Turn R.
  - Drive: Cruise −, Cruise, Cruise + (the set speed one km/h per tap),
    Engine, AI worker.
  - Implement (the selected one, named in the group label): Lower,
    Unfold (pending while the fold runs, on once the game reports it
    unfolded), Work (turn on), Hitch (detach what's attached, else attach
    what's in range).
  - New icons: fold, hitch, cruiseDown, cruiseUp.
- Input action names come from the game's own `inputBinding.xml`: fold is
  `IMPLEMENT_EXTRA2` (X), turn on `IMPLEMENT_EXTRA` (B), lower
  `LOWER_IMPLEMENT` (V), attach / detach `ATTACH` (Q) / `DETACH`, cruise
  speed the axis `AXIS_CRUISE_CONTROL`. There is no `IMPLEMENT_FOLD`.
- Mod: every action runs its input event first, as the key does (the
  implement keys' events belong to the selected implement), else the
  specialization's setter (FS22 names, guarded): `setLightsTypesMask`,
  `setBeaconLightsVisibility`, `setTurnLightState`, `startMotor` /
  `stopMotor`, `setCruiseControlState`, `handleLowerImplementEvent`,
  `setFoldState(getToggledFoldDirection())`, `setIsTurnedOn`,
  `detachImplementByObject`. Cruise −/+ use `setCruiseControlMaxSpeed`
  first (one exact step), the axis second. AI has no setter. The ack's
  `via` says which ran, and log.txt gets "command <action> via <what>"
  once per path.
- `cab` gains `aiActive`, `hitched` and `implement` (the selected one: name,
  lowered, canLower, turnedOn, canTurnOn, foldable, unfolded, foldMoving).
  The selected implement is `getSelectedVehicle()`, else
  `getSelectedImplement().object`, else the first attached; a fold runs
  while a folding part's animation plays (`getIsAnimationPlaying`), else
  while `foldAnimTime` is between the ends. Unverified in FS25.
- Held controls: none of the C2 set needs one (cruise −/+ are single
  steps), so press / release with auto-release moves to C3 with the front
  loader.
- Without the game, against a stand-in for the mod: every button 29–78 ms
  tap to new state; Unfold stayed pending for the 1.5 s fold, then on; the
  New Holland column fits 1180×820 without scrolling.
- First live test (Vincent): every button ran its input event (log.txt),
  the engine fell back to the setter once. Fixed in mod 0.6.1:
  - Pending is a "loading" border: a dash running clockwise round the
    button (SVG stroke-dashoffset) in the accent colour; a slow pulse with
    reduced motion.
  - Engine: `cab.engineState` (off / starting / on, `getMotorState`); the
    button stays pending from the tap until the game reports it running
    (and while it starts from a key in game).
  - Hitch is exactly the attach key: `ATTACH` (Q), whatever is selected;
    the first build ran `DETACH` for an attached implement. Pending until
    what's attached changes; after 1.5 s with no change it says "None in
    range" quietly. Lit while something is attached.
  - Cruise: FS25 keeps a set speed for forward and one for reverse. The
    button toggles as the key does and shows the set speed for the way the
    vehicle drives ("15 km/h", "R 8 km/h"); −/+ change that one. `cab` and
    `vehicles` carry `speedReverse` and `reverse` (the motor's direction,
    else a reverse gear, else the way it moves).
- Second round (mod 0.6.2):
  - Cruise −/+ hold to repeat: a tap is one step (1 km/h, or 1 mph);
    held, it repeats after 400 ms every 120 ms, every 50 ms after 1.5 s.
    The dashboard keeps the target, shows it on the Cruise button at once
    (pending), never past the vehicle's top set speed (`cab.cruise.maxSpeed`
    / `maxSpeedReverse`), and sends it as an absolute `cruise.set {value}`
    (km/h) at most every 50 ms, one at a time. The client holds a newer one
    until the mod answers the last, latest wins (the replaced one is
    answered "superseded"). The mod's `CRUISE_SET_SPEED` clamps it and sets
    the speed for the current direction (`setCruiseControlMaxSpeed`).
    Commands may carry a value: `protocol.COMMAND_VALUES` gives each
    action's range, checked by the backend and the client. Against the
    stand-in: 15 to 40 km/h in 2.5 s held, confirmed 21 ms after release.
  - Labels name what a tap will do, as the game's help does; lit is the
    state: "Lower" / "Raise" (with the hitch icon turning), "Unfold" /
    "Fold", and "Lowering…", "Raising…", "Folding…", "Unfolding…" while it
    runs. Hitch keeps its name (attach or detach isn't known in advance).
- Third round (mod 0.6.3): no reverse cruise speed. Live, the L90H has
  none, and the Fastrac iCON 4160 and the Valtra T195 Active (reverse
  driving position) use the main set speed in reverse; the stream showed
  `speedReverse` 33 = `maxSpeedReverse` 33, so the HUD's number while
  reversing looks like the reverse speed limit, not a set speed. Cruise
  and −/+ now always show and set the one main set speed (no "R"); a
  step goes from the number on the button. To find out what that HUD
  number is, the first time each vehicle reverses log.txt gets a
  "reverse cruise check" line: the cruise control's fields and the
  motor's speed limits (not sent to the dashboard).
- Live (Vincent, 2026-10-24): all of C2 works with 0.6.3. The reverse
  cruise check on the Volvo L90H: `speedReverse` = `maxSpeedReverse` = 46
  km/h = the motor's `getMaximumBackwardSpeed()` (12.78 m/s), so the HUD's
  number while reversing is the vehicle's top reverse speed.

**C3 plan: picking one implement (2026-10-24).** In game, G cycles the
tractor and every tool in turn (for example cultivator, front loader, loader
tool). On the dashboard the Implement screen's rig strip is the selector
instead, and it mirrors the game's own selection (Vincent's choice):
- **Rig tree.** `cab` gains `rig`: the tractor and every attached object,
  nested (the loader tool hangs off the front loader), each with an `id`,
  `parent`, name, category, side (front or rear, from the attacher joint),
  `selectable` and `selected`. Today the mod only sends "the selected one,
  else the first attached".
- **Select.** Tapping a tile sends `implement.select {target}`; the mod
  selects that object in game in the same frame. ‹ › and a swipe on the
  implement card select the previous or next one in the game's own order.
  G pressed in game moves the picked tile too, since `cab` follows the
  selection. The dashboard never keeps a pick of its own.
- **Buttons act as the keys do** (Vincent, 2026-10-24: "we don't want to
  change how the game works"). A button runs the key's events as they are
  at that moment, including the game's own shortcut: an action only one
  tool has stays live without selecting that tool (fold stayed on the
  cultivator with the loader selected). The mod reports, per action, which
  tool its live event belongs to (`targetObject`), and the button shows it
  ("Fold · Pöttinger"). A card's buttons send their `target` only so the
  mod can select that tool first when the game's selection moved since the
  tap. Detach detaches that tool (`detachImplementByObject` on its parent).
  Hitch stays exactly the Q key.
- **Front loader:** shown as a tile (state, Detach); a loader tool with a
  fill level gets its own tile and fill bar. No arm or tool controls.
- **Game API:** `root:setSelectedObject(entry of root.selectableObjects)`,
  verified by the selection spike (results below).

**Selection spike results (Windows, mod 0.6.4, 2026-10-24).** JCB Fastrac
iCON 4160 with a Quicke Q6M front loader, an Albutt bucket on it and a
Pöttinger Terria 6040 cultivator at the rear:
- **Direct selection works.** `root:setSelectedObject(object)` with an entry
  of `root.selectableObjects` selected the loader at the first try, same
  frame; `getSelectedObject` and `getSelectedVehicle` then both return it.
  `currentSelection.index` is the entry's index. Also present (not tried):
  `setSelectedVehicle`, `selectVehicle`, `setSelectedImplementByObject`,
  `unselectVehicle`, `getCanBeSelected`, `updateSelectableObjects`. No
  cycle fallback is needed; G is `SWITCH_IMPLEMENT` (`_BACK` the other way).
- **The game's order** is tractor, loader, bucket, cultivator (4 entries,
  no sub-selections): the bucket is selectable on its own, so it gets its
  own tile.
- **Front or rear** from the parent's attacher joint (`jointTransform` in the
  parent's `rootNode` frame): z 0.69 loader (jointType 12), z 2.90 bucket on
  the loader (jointType 7), z −2.95 cultivator (jointType 1). z ≥ 0 is
  front.
- **Not every key follows the selection, by design.** With the loader
  selected, `LOWER_IMPLEMENT`'s event belonged to the loader (inactive),
  but `IMPLEMENT_EXTRA2` (fold) still belonged to the cultivator, so X (and
  the dashboard's Fold, which runs the same event) folds the cultivator
  without cycling to it: the game keeps an action only one tool has live
  whatever is selected. `ATTACH` / `DETACH` belong to the tractor. The
  dashboard keeps this behaviour and shows which tool each button will
  act on.

**C3 build (mod 0.7.0, 2026-10-24), confirmed live.**
- Mod: `cab.rig` (the vehicle, then every attached object depth first: id,
  parent, depth, side, selectable, selected and each tool's implement
  state) and `cab.keys` (the rig id of the tool whose live event each of
  lower, fold and turn on would run). The vehicles topic's implements carry
  `id`. New actions: `SELECT_IMPLEMENT` (value: id, `setSelectedObject`),
  `SELECT_NEXT_IMPLEMENT` / `SELECT_PREVIOUS_IMPLEMENT` (`SWITCH_IMPLEMENT`
  / `_BACK`, else one step in `selectableObjects`), `DETACH_IMPLEMENT`
  (value: id; refused while `isDetachAllowed` says no). The spike's console
  commands are gone.
- Dashboard: on the Vehicle screen, tapping an Attached row selects it in
  game; the selected row has the selection outline, "Selected" and Detach.
  The Implement group gains Prev tool and Next tool; Lower, Fold and Work
  read the tool their key acts on and show its name when it isn't the
  selected one. Settings shows the controls' round trip (median of the
  last 30 answered commands, last, slowest).
- The Implement screen (THEMES.md) will reuse all of this.
- After the first live check (Vincent, mod 0.7.1): a button names its
  tool by the model alone ("TERRIA 6040", the brand from the vehicles
  topic's new `brand` per implement), cut off with "…" inside the button.
  Prev / Next tool moved out of the control column to ‹ › in the Attached
  header. On the Vehicle screen the readout card's engine chip is the
  Engine control (`{controls: true, omit: ["engineOn"]}`); Map keeps the
  button. A key with no tool named falls back to the selected implement,
  as in C2.
- Styling after the live check: the card's Engine button is a column
  button (blue while on, a green dot while the engine runs); the selected
  Attached row takes the readout card's dark blue by day and the night
  selection (yellow, dark ink) at night.

**Risks.** If the mod can't re-read a client-written file, fall back to key
presses (Windows first). Calling action callbacks by name may differ per
action; the fallback is the specialization's own setter. On a Mac App Store
install macOS may ask once to let the client into FS25's container, as it
already does for the stream. In multiplayer the server can refuse an action:
the ack carries the reason.

## Open checks

Built, but not yet confirmed in game:
- **Implement and Harvester screens (next to do):** mod 0.8.3 is
  installed. Restart the game and the client so the tablet loads the new
  page, then:
  - Seeder or cultivator: tap tiles in the band, ‹ › and a swipe change the
    game's selection; Lower, Work, Fold and Detach act exactly like V, B, X
    and detach; tank estimates appear after about 20 s of work ("Runs out
    first" with two tanks); Speed reads against the tool's limit ("11 / 12
    km/h"); working width and area this run in the details.
  - Combine with a trailer: Pipe (O) and Unload on the card, the job line
    "Harvesting · Wheat", "Call a trailer" as the tank nears full.
  - Tipping trailer: Tipping (I, or Ctrl+I to the ground), Cover (N) and
    the Load stat.
  - Lower all / Raise all (Ctrl+V), in the column under All implements.
  - Trailer Fill Limit, still to see: before the limit, the bar's shading
    and tick where the tank will stop, and "full in" and "Call a trailer"
    counting to it; with the setting off, nothing changes. (MAX at the
    limit is confirmed.)
  - Combine: after Unfold (confirmed), Work starts threshing.
  - Harvester screen (mod 0.8.4): the live check list is in its spec,
    [specs/0001-harvester-screen.md](../specs/0001-harvester-screen.md#acceptance).
  - The choices made while building (labels, when Pipe, Unload and Cover
    are unavailable, the tractor on the card when it's selected) are in
    THEMES.md, Implement screen, "As built": confirm or change them.
- **New Holland style live:** drive a tractor and check the readout, the
  control indicators (lights, beacon, hazard, turn signals, engine,
  implement lowered and working), the alert chips and Day / Night, on a
  tablet over the LAN and on a second monitor.
- **Vehicle screen live:** the readout card, condition tiles and implement
  rows while working with an implement, and whether the Map screen's slot
  zoom (about 505 m across a 1180×820 screen) is close enough in a cab.
  The gear, brand and shop category are confirmed (see DONE.md).
- **Full screen and home screen:** the full-screen button and toggle in
  Chrome or Edge on the PC and on the tablets (the app's browser pane
  doesn't answer the request), Keep screen on over `localhost`, and on an
  iPad: Add to Home Screen, then the app without bars and the safe areas
  around its status bar and home indicator.
- **Game data (T6):** in a tractor with DEF and cruise control, a seeder
  with a PTO on the rear hitch, and a combine with an AI worker: check
  fuel usage against the HUD, DEF, the cruise state and speed, the PTO
  chip, the hitch while it moves, the fill meters and the worker's job.
  Then switch the game to miles, Fahrenheit, acres and pounds and check
  the dashboard follows. If a value is missing, run the spike: its
  `controlledDetail` now dumps the specs these come from.
- **Overview image:** see it in a live session on a map whose image the
  client can read. Kinlaig is a DLC map, so it shows the plain stand-in.
- **Fields:** how fresh `fieldState` is, outline accuracy against the PDA,
  the colour space of `defaultMapColor`, what `weedState` means (the
  dashboard counts anything above 0 as weeds), and whether `rollerLevel`
  above 0 means the field needs rolling, as the land panel guesses.
- **Hitched implements:** check that `attached` (from
  `getAttacherVehicle()`) hides them on the map.
- **macOS:** a live run on a Mac, or at least the client in replay mode.
  `paths.py` discovery is already covered by tests.

How to run the tests and the replay: the README's
[Development](../README.md#development) section.

## Later

- **Sell prices:** a `prices` topic (sell point → fill type → price, about
  every 60 s), and a way to show it.
- **Missions and contracts.**
- **AI workers:** their routes on the map.
- **Multiplayer:** farm colours.
- **Tray app:** a system-tray client built with PyInstaller.

More screens, layout editing and other brands are under Later in
[THEMES.md](THEMES.md#later).
