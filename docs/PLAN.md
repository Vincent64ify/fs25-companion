# Plan

What's next for FS25 Companion. What's already built, and the game API facts
it relies on, are in [DONE.md](DONE.md). Small fixes go in
[NEXT.md](NEXT.md).

## Where things stand (2026-10-23)

- Phases 0 to 4 of the rework are built and run live on Windows (Solek, and
  Kinlaig, a paid DLC map): the file stream, the client and backend, and the
  Leaflet map with the PDA's places, every vehicle, farmlands and fields.
- Themes T0 to T5 are done: the approved design, themes as data, our own
  icon set, and the New Holland style's chrome, Map screen and Vehicle
  screen in day and night, chosen from a Settings panel that Default has
  too; it fits every tablet and monitor size checked, goes full screen, and
  can be added to a tablet's home screen. T6, more data from the game
  (fuel usage, DEF, cruise, fill levels, PTO, hitch, AI job, units), is
  built and waiting for a live check.
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
style, after the IntelliView 12. Today's look stays as the Default theme.

| Phase | What | Status |
|---|---|---|
| T0 | Design in Claude Design: a style frame, then the Map and Vehicle screens in both palettes and every size class | done 2026-10-23 |
| T1 | Foundation: themes as data, widgets, tokens. No visible change | done 2026-10-23 |
| T2 | Our own SVG icon set, in the cab-symbol style | done 2026-10-23 |
| T3 | New Holland style: chrome and Map screen | done 2026-10-23 |
| T4 | Vehicle screen: hero readout, condition tiles, implements, vehicle card | done 2026-10-23 |
| T5 | Responsive pass across tablets and monitors, full screen, home screen | done 2026-10-23 |
| T6 | More data from the game (can start any time) | built 2026-10-24, live check open |

## After that: Controls (control the game from the dashboard)

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

**Held controls** (front loader, hitch while held) send `press` and
`release`; the mod releases by itself 300 ms after the last keep-alive.

**Security.** Only paired viewers may send commands; the backend, the client
and the mod each accept only actions from the known list.

| Phase | What | Status |
|---|---|---|
| C0 | Spike: can the mod see and read a client-written file every frame, fresh and cheaply; can it run an action by name; round-trip time ([spike/README.md](../spike/README.md#command-spike-c0)) | done on Windows 2026-10-24 (results below); macOS to run |
| C1 | One control (lights) end to end: protocol, backend relay, client file writer, mod reader, ack, `cab` topic | done 2026-10-24: works live on Windows (mod 0.5.0); light stages as dots built (0.5.1), live check open |
| C2 | The first control set in both themes, held controls with auto-release | |
| C3 | Targeted actions (cruise speed, detach a chosen implement), round-trip readout in Settings | |
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
  Live check: the dots follow the taps and the key in game.

**Risks.** If the mod can't re-read a client-written file, fall back to key
presses (Windows first). Calling action callbacks by name may differ per
action; the fallback is the specialization's own setter. On a Mac App Store
install macOS may ask once to let the client into FS25's container, as it
already does for the stream. In multiplayer the server can refuse an action:
the ack carries the reason.

## Open checks

Built, but not yet confirmed in game:
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
- **Season:** read 0-based, `env.season` showed Autumn in August. The mod
  now sends `env.month` from `environment.currentPeriod` (1 = March) and the
  status bar names the season from it (Mar-May spring ... Dec-Feb winter);
  check it against the in-game calendar.
- **Engine on:** `spec_motorized.engineStarted` was always nil, so the
  engine read as off. Now `getIsMotorStarted()`, else `isMotorStarted`;
  check the readout's Engine on/off and the Engine control.
- **Positions:** compare the player marker and the hotspots with the in-game
  PDA at three spots: a map corner, the centre and a sell point.
- **Overview image:** see it in a live session on a map whose image the
  client can read. Kinlaig is a DLC map, so it shows the plain stand-in.
- **Fields:** how fresh `fieldState` is, outline accuracy against the PDA,
  the colour space of `defaultMapColor`, and what `weedState` means.
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
