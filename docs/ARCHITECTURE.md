# Architecture

How FS25 Companion works today, and the rules it's built by. Each part
has its own page for the detail: [the mod](../mod/README.md),
[the companion](../companion/README.md), the design in
[THEMES.md](THEMES.md), what the game's API does in
[GAME-API.md](GAME-API.md), and each feature in its
[spec](../specs/README.md).

```
FS25 + the mod (Lua)
   │  one JSON envelope per line                ▲  reads cmd/<n>.xml
   ▼                                            │  every frame
<profile>/modSettings/FS25_Companion/stream.ndjson      cmd/<n>.xml
   │  tailed every 50 ms                        ▲  written per command
   ▼                                            │
The companion (Python, one process): latest state per topic, the map images
   │  WebSocket: snapshot, then updates         ▲  commands
   ▼                                            │
The dashboard (browser): store → map layers and widgets, drawn by a theme
```

## The stream: game to dashboard

- **The mod writes a plain file.** One collector per topic, each at its
  own rate, writes a versioned envelope
  (`{"v":1,"seq":…,"t":…,"topic":…,"data":…}`) and flushes. The envelope
  and the topics are listed in [mod/README.md](../mod/README.md#envelope-protocol-v1).
- **A collector can't break the game.** The scheduler runs each one under
  `pcall`: a failing API call drops that topic for that tick and logs
  once. Slow work (the farmland grid) is a cursor job cut into slices per
  frame, since the game's Luau has no coroutines.
- **Rotation.** At 2 MB the mod reopens the file with `"w"`, which empties
  it, then sends `hello` again, the last data of every topic sent once,
  and the command answers of the last 5 s
  ([spec 0004](../specs/0004-acks-survive-rotation.md)). A reader that
  starts late always gets what it needs.
- **The companion tails it.** It keeps an offset, buffers partial lines,
  drops lines that aren't envelopes, and starts from the top when the file
  is new: smaller than the offset, or a different first line
  ([spec 0005](../specs/0005-tailer-sees-every-new-file.md)). The game and
  the companion start in any order.
- **One description of each topic.** `web/src/types.js` says what a
  topic's data holds. The companion checks the envelope only, and passes
  unknown topics and fields through
  ([spec 0007](../specs/0007-protocol-in-one-place.md)).
- **Viewers get the latest.** The companion keeps the latest envelope per
  topic. A browser gets a `snapshot` on connect and on a new game session,
  then one `update` per envelope. Each viewer has its own queue and
  sender, so a slow one never holds up the others: one that falls far
  behind gets the latest state instead of its backlog, and one whose send
  is stuck for 10 s is dropped. The viewer protocol is in
  `companion/server.py`'s docstring.
- **Recording and replay.** The stream file is already a recording:
  `--record` saves one, `--replay` plays it without the game. The Solek
  replay feeds the tests and the browser checks
  ([fixtures/](../fixtures/README.md)).

## Commands

How a tap on the dashboard reaches the game:

1. **The dashboard** shows the control as waiting on touch-down and sends
   the state it wants over its WebSocket, for example
   `{"type":"command","id":"…","action":"beacon.set","value":1}`; a tool's
   button adds `tool`, its rig id
   ([spec 0008](../specs/0008-commands-say-the-state.md)).
2. **The companion** checks the command's shape only and writes it to
   `modSettings/FS25_Companion/cmd/<n>.xml`, numbered from 1 per game
   session: a temp file, read back once, then renamed, so it appears
   whole and its first-open cost stays off the game's frame.
3. **The mod** looks for the next number every frame. It checks the
   session, the action and its value against `Commands.ACTIONS`, the one
   list of actions. It reads the state the cab reports and presses the
   game's own key only when the game isn't there yet; already there, it
   presses nothing and answers `already`. A key with no live event answers
   "not available now". Three actions have no key and run a setter: the
   cruise set speed, select and detach
   ([spec 0009](../specs/0009-one-way-to-run-each-action.md)).
4. **The answer** is a `command_ack` envelope, with the `cab` topic in the
   same frame. A tool's button answers ok only once the tool moved
   (specs [0003](../specs/0003-implement-screen.md) and
   [0014](../specs/0014-checked-pipe-tipside-cover.md)).
5. **The companion** polls every 10 ms for 2 s after a command, sends the
   new cab state and then the answer to the viewer that asked, and deletes
   the file.
6. **The dashboard** shows the game's state. A press that failed, or got
   no answer within 10 s, says "Failed" on its button
   ([spec 0013](../specs/0013-vehicle-screen-calm.md), revision 6).

The `cab` topic holds what the controls show (lights, engine, cruise, the
rig and each tool's state). The mod compares it every frame and sends it
when something changes, so the dashboard also follows keys pressed in the
game.

## The dashboard

Vanilla ES modules, no build step. `connection.js` feeds `store.js`; map
layers and widgets each subscribe to the topics they show.

```
web/
  index.html      an empty #app the theme draws
  test.html       the browser tests (all green)
  src/
    main.js         wires the connection, the store, the map and the theme
    connection.js   the WebSocket, reconnecting; commands.js sends and times commands
    store.js        the latest data per topic, with subscriptions
    types.js        JSDoc types: the one description of each topic
    data/           pure reads of the store: selectors, units, rates (tank
                    estimates), coverage (the trail on a field)
    map/            mapView.js (the one world ↔ map transform), mapFrame.js,
                    the overview image, the legend, layers/ (one per feature)
    themes/         render.js (the theme contract and its one renderer),
                    registry.js, newholland/ (the theme's data and CSS)
    widgets/        every widget by id (index.js): the names a theme's
                    layout uses
    ui/             control.js (a control button), icons.js (our own SVG
                    set), settings.js, screenMode.js, dom.js
    panels/         the Map's land panel
  vendor/         Leaflet and the Archivo font, so it works without internet
```

- **The map is in world meters.** `lng = x`, `lat = -z`. The overview
  image is placed with the game's own map-extension values from `hello`,
  so there's nothing to calibrate. The companion reads the image from the
  player's own install and converts it; a paid DLC map's image can't be
  read and gets a plain stand-in.
- **Farmlands** arrive as a grid of ids on 4 m cells; the browser traces
  the outlines (`map/farmlandGeometry.js`). Fields draw on the same
  canvas, coloured like the PDA's filters.
- **A theme is data.** It names its screens, their layout and the widgets
  in each slot; `render.js` builds them once and switches screens. The
  look is in [THEMES.md](THEMES.md).

## What guards it

- `mod/tests`: the mod's Lua against a stubbed game, through pytest and
  lupa, and the rig dumps recorded from the game.
- `companion/tests`: the tailer, the state, the commands, the server.
- `tests/test_golden.py`: every message a viewer gets from the Solek
  replay, pinned.
- `web/test.html`: the dashboard's pure functions and widgets, in the
  browser.
- Live checks, in the game, by Vincent: each spec lists its own, and
  `scripts/livewatch.py`, `rig_check.py` and `allrow_check.py` read the
  files while they run.

## Ground rules

These decisions hold for all the work:

- **Same on Windows and macOS.** The mod writes a plain NDJSON file and the
  companion tails it: no pipes, sockets or OS-specific code in the mod.
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
- **Local first; hosted later as an add-on.** One local process
  (`python -m companion`) tails the game and serves the dashboard. A hosted
  relay, if it comes back, is a separate service the local app forwards
  to ([PLAN.md, Later](PLAN.md#later)).
- **Game files stay the user's.** Images and textures are read from the
  user's own install at runtime and never committed. Encrypted archives
  (`.dlc`, `dataS.gar`) stay closed.
- **Light footprint.** The goal is an installer that touches as little of
  the user's computer as it can. Read from the game only what we can't make
  ourselves (the map overview); draw the rest (icons). Every new cache,
  file or upload has to earn its place.

## Why it's built this way

- **A file, not a pipe or a socket.** The first prototype used a Windows
  named pipe: Windows only, and it could get stuck until the game
  restarted. A macOS FIFO blocks the writer until a reader exists, which
  would freeze the game, and luasocket isn't reliably there for mods. A
  plain file never blocks the game and doesn't care who starts first.
- **Commands through the mod, not key presses.** Sending key presses from
  outside needs the game focused, a second code path and a permission on
  macOS, the player's key binds, and it gives no answer. Through the mod a
  command is answered in the same frame (about 20 ms round trip, see
  [GAME-API.md](GAME-API.md#c0-the-command-channel)), works the same on
  both systems, and can aim at one tool.
- **The game's keys, not its setters.** A command presses the key's own
  event, so it does exactly what the player's key does (rebinds, other
  mods and multiplayer included) and never what the game wouldn't allow.
- **Commands say the state they want.** A lost or doubled command then
  does nothing wrong, so nothing has to number, replace or resend them.
- **One local process.** The first build had a client and a relay backend
  with pairing and uploads; for a game on the same PC that was four hops.
  Since [spec 0006](../specs/0006-one-local-process.md) it's one.
