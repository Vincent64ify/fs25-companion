# Plan

What's next for FS25 Companion. What's already built, and the game API facts
it relies on, are in [DONE.md](DONE.md). Small fixes go in
[NEXT.md](NEXT.md).

## Where things stand (2026-10-23)

- Phases 0 to 4 of the rework are built and run live on Windows (Solek, and
  Kinlaig, a paid DLC map): the file stream, the client and backend, and the
  Leaflet map with the PDA's places, every vehicle, farmlands and fields.
- Themes T0 to T4 are done: the approved design, themes as data, our own
  icon set, and the New Holland style's chrome, Map screen and Vehicle
  screen in day and night, chosen from a Settings panel that Default has
  too. Next is T5, the responsive pass.
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
| T5 | Responsive pass across tablets and monitors | next |
| T6 | More data from the game (can start any time) | planned |

## After that: control the game from the dashboard

Buttons that trigger in-game actions (key binds), for example attach / detach
an implement, lower / raise, turn on, lights, cruise control.
- The button icons are our own SVG set, drawn in the cab-symbol style (see
  [THEMES.md](THEMES.md#icons)).
- The themes already reserve room for these buttons and show their state.

**A way back into the game.** Today the mod only writes, and Lua file
handles can't read (Phase 0). Two command channels, in this order:

1. **Simulated key presses (first).** This is how SIM Dashboard's "button
   box" works: nothing goes into the game; the PC presses the key.
   - The dashboard sends `{"action": "ATTACH"}` over its WebSocket. The
     backend relays it to the paired client only.
   - The client looks up the player's key for that action in
     `<profile>/inputBinding.xml`, so rebinds just work.
   - It presses the key with `SendInput` and scan codes on Windows, or
     `CGEventPost` on macOS (which needs the Accessibility permission once).
   - No mod change.
   - Limits: FS25 must be the focused window, and there's no direct
     confirmation. The telemetry shows the result, for example the implement
     leaves the list.
2. **XML command file (to test in a spike).**
   - The client writes `modSettings/FS25_Companion/commands.xml`.
   - The mod polls it every 100–200 ms with the GIANTS XML API
     (`XMLFile.load` / `loadXMLFile`), which mods use to read their settings.
   - It runs each new command through the game (attach/detach, lower, turn
     on, ...) and acknowledges it with a `command_ack` topic.
   - It works unfocused, needs no OS permission, and allows actions no key
     has ("detach the rear trailer").
   - To verify in the spike: can the mod re-read a file the client keeps
     rewriting, how fast, and at what cost per poll. In multiplayer the
     server decides what's allowed.

**Security.** Only paired viewers may send commands, and the client accepts
only actions from a known list, so nobody else on the network can press keys
on the PC.

**Icons.** The key glyphs and HUD icons are inside `dataS.gar`, which is
encrypted like the DLC maps, so they can't be extracted. We draw our own SVG
icons instead ([THEMES.md](THEMES.md#icons)).

## Open checks

Built, but not yet confirmed in game:
- **New Holland style live:** drive a tractor and check the readout, the
  control indicators (lights, beacon, hazard, turn signals, engine,
  implement lowered and working), the alert chips and Day / Night, on a
  tablet over the LAN and on a second monitor.
- **Vehicle screen live:** the readout card, condition tiles and implement
  rows while driving and working; the brand and shop category from the
  store manager (`getItemByXMLFilename`, `getBrandByIndex`,
  `getCategoryByName`, all unverified); and whether the Map screen's slot
  zoom (about 505 m across a 1180×820 screen) is close enough in a cab.
- **Season:** the status bar reads `env.season` as 0 = spring. The replay
  shows "Summer" on day 1; check it against the in-game calendar.
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
