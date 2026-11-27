# Architecture

How FS25 Companion works today, and the rules it's built by. Each part
has its own page for the detail: [the mod](../mod/README.md),
[the companion](../companion/README.md), the design in
[THEMES.md](THEMES.md), what the game's API does in
[GAME-API.md](GAME-API.md), and each feature in its
[spec](../specs/README.md).

```text
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

- **A session is one game load.** The mod opens it with `hello`: a new
  session id, the mod and protocol versions, the map and its extent,
  and where commands go. A new id tells the companion to start over.
- **The mod writes a plain file.** One collector per topic, each at its
  own rate, writes a versioned envelope
  (`{"v":1,"seq":…,"t":…,"topic":…,"data":…}`) and flushes. The envelope
  and the topics are listed in [mod/README.md](../mod/README.md#envelope-protocol-v1).
- **A failing collector doesn't stop the game.** The scheduler runs each
  one under `pcall`: a failing API call drops that topic for that tick and
  logs once. Slow work (the farmland grid) is cut into slices per frame,
  and a costly topic (contracts) checks for changes every frame without
  collecting ([mod/README.md](../mod/README.md)).
- **Rotation.** At 2 MB the mod reopens the file with `"w"`, which empties
  it, then sends `hello` again, the last data of every topic sent once,
  and the command answers of the last 5 s
  ([spec 0004](../specs/0004-acks-survive-rotation.md)), so a reader that
  starts late still gets `hello` and every topic's latest data.
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
  sender, so a slow one never holds up the others: one whose queue is full
  gets the latest state instead of its backlog, and one whose send is
  stuck for 10 s is dropped. The viewer protocol is in
  `companion/server.py`'s docstring.
- **Recording and replay.** The stream file is already a recording:
  `--record` saves one, `--replay` plays it without the game. The Solek
  replay feeds the tests and the browser checks
  ([fixtures/](../fixtures/README.md)).

## Commands

The `cab` topic holds what the controls show (lights, engine, cruise, the
rig, which is the vehicle and everything hitched to it, and each tool's
state). The mod compares it every frame and sends it when something
changes, so the dashboard also follows keys pressed in the game.

How a tap on the dashboard reaches the game:

1. **The dashboard** shows the control as waiting on touch-down and sends
   the state it wants over its WebSocket, for example
   `{"type":"command","id":"…","action":"beacon.set","value":1}`. Some
   commands add their target: `tool`, a rig id
   ([spec 0008](../specs/0008-commands-say-the-state.md)); `contract`, its
   id ([spec 0019](../specs/0019-contract-actions.md)); or `settings`,
   Steering Assist's rows such as `"width=6.6;direction=auto"`
   ([spec 0022](../specs/0022-steering-assist-settings.md)).
2. **The companion** checks the command's shape only and writes it to
   `modSettings/FS25_Companion/cmd/<n>.xml`, numbered from 1 per game
   session. It writes a temp file, reads it back once (so the file's first
   open, about 4 ms, isn't on the game's frame), then renames it, so the
   mod never sees half a file.
3. **The mod** looks for the next number every frame. It checks that the
   command is this session's, and its action and value against
   `Commands.ACTIONS`, the one list of actions (`SteeringCommands.lua` adds
   Steering Assist's). It reads the state the cab reports and presses the
   game's own key only when the game isn't there yet; already there, it
   presses nothing and answers `already`. A key the game has no live event
   for right now answers "not available now". Where the game has no key,
   it runs the game's own functions instead (see
   [Why it's built this way](#why-its-built-this-way)).
4. **The mod** answers with a `command_ack` envelope, with the `cab` topic
   in the same frame. A tool's button answers ok only once the tool moved
   (specs [0003](../specs/0003-implement-screen.md) and
   [0014](../specs/0014-checked-pipe-tipside-cover.md)).
5. **The companion** reads the stream every 10 ms for 2 s after a command.
   It sends the new cab state to every viewer, then the answer to the
   viewer that asked, and deletes `cmd/<n>.xml`.
6. **The dashboard** shows the game's state. A press that failed, or got
   no answer within 10 s, says "Failed" on its button
   ([spec 0013](../specs/0013-vehicle-screen-calm.md), revision 6).

## The dashboard

`connection.js` feeds `store.js`; map layers and widgets each subscribe to
the topics they show.

```text
web/
  index.html      an empty #app the theme draws
  style.css       what every theme shares: the map, its overlays, the legend
  manifest.json   the Home Screen app, its icons in icons/
  test.html       the browser tests, with fixtures/
  tools/          icons.html, the icons' contact sheet
  src/
    main.js         wires the connection, the store, the map and the theme
    connection.js   the WebSocket, reconnecting
    commands.js     sends commands and times their answers
    store.js        the latest data per topic, with subscriptions
    types.js        JSDoc types: the one description of each topic
    data/           pure reads of the store (selectors, units, estimates)
    map/            mapView.js (the one world ↔ map transform), the overview
                    image, the legend, layers/ (one per feature), helpers
    themes/         render.js (the theme contract and its one renderer),
                    registry.js, newholland/ (one folder per theme)
    widgets/        every widget by id (index.js): the names a theme's
                    layout uses
    ui/             control.js (a control button), icons.js (our own SVG
                    set), the Settings and speed panels, shared helpers
    panels/         the Map's land panel
  vendor/         Leaflet and the Archivo font
```

- **The map is in world meters** ([Ground rules](#ground-rules)):
  `lng = x`, `lat = -z`. The overview image is placed with the game's own
  map-extension values from `hello`, so there's nothing to calibrate. The
  companion reads the image from the player's own install and converts
  it; a paid DLC map's image can't be read and gets a plain stand-in.
- **Farmlands** arrive as a grid of ids; the browser traces the outlines
  (`map/farmlandGeometry.js`). Fields draw on the same canvas, coloured
  like the PDA's filters.
- **A theme is data.** It names its screens, their layout and the widgets
  in each slot; `render.js` builds them once and switches screens. The
  look is in [THEMES.md](THEMES.md).

## What guards it

- `mod/tests`: the mod's Lua against a stubbed game, through pytest and
  lupa, and the rig dumps recorded from the game.
- `companion/tests`: the tailer, the state, the commands, the server.
- `tests/test_golden.py`: every message a viewer gets from the Solek
  replay, pinned.
- `tests/test_theme_css.py`: every theme's CSS flat (no rule nested by a
  stray brace).
- `web/test.html`: the dashboard's pure functions and widgets, in the
  browser.
- Live checks, in the game, by Vincent: each spec lists its own, and
  `scripts/livewatch.py`, `scripts/rig_check.py` and
  `scripts/allrow_check.py` read the files while they run.

## Ground rules

- **Same on Windows and macOS.** The mod writes a plain NDJSON file and the
  companion tails it: no pipes, sockets or OS-specific code in the mod.
- **No build step.** Vanilla ES modules with `// @ts-check` and JSDoc types.
  Libraries and fonts are vendored (Leaflet, Archivo), so the dashboard
  works on a LAN without internet.
- **One piece per feature.** One collector per topic in the mod, one layer or
  panel per feature on the web; the companion passes new topics through
  unchanged.
- **One control per action.** Whatever is on screen at once, the chrome
  included, offers each action through one control only: no second engine
  button, and no Map button on a screen, since the bottom nav already opens
  the Map. Before adding a control, check that nothing visible does it yet.
- **World meters everywhere.** Positions stay in world (x, z) from the mod to
  the screen. The one transform lives in `web/src/map/mapView.js`.
- **Never break the game.** Game API names that aren't verified go through
  the guards in `mod/src/Api.lua`, and each collector runs under `pcall`
  ([the stream](#the-stream-game-to-dashboard)).
- **Protocol v1.** Topics may gain fields freely (the web ignores unknown
  ones); `v` changes only for breaking changes.
- **Local first.** One local process (`python -m companion`) tails the
  game and serves the dashboard; a hosted relay is a later idea
  ([PLAN.md, Later](PLAN.md#later)).
- **Game files stay the user's.** Images and textures are read from the
  user's own install at runtime and never committed. Encrypted archives
  (`.dlc`, `dataS.gar`) stay closed.
- **Light footprint.** Touch as little of the user's computer as we can.
  Read from the game only what we can't make ourselves (the map overview);
  draw the rest (icons). Every new cache, file or upload has to earn its
  place.

## Why it's built this way

The decisions behind the rules above, and the reasons for each.

- **A file, not a pipe or a socket.** The first prototype used a Windows
  named pipe: Windows only, and it could get stuck until the game
  restarted. A macOS FIFO blocks the writer until a reader exists, which
  would freeze the game, and luasocket isn't reliably there for mods. A
  plain file never blocks the game.
- **Commands through the mod, not key presses.** Sending key presses from
  outside needs the game focused, a second code path, a permission on
  macOS and the player's key binds, and it gets no answer. Through the mod
  a command is answered in the same frame (about 20 ms round trip, see
  [GAME-API.md](GAME-API.md#c0-the-command-channel)), works the same on
  both systems, and can aim at one tool.
- **The game's keys, not its setters.** A command presses the key's own
  event, so it does exactly what the player's key does (rebinds, other
  mods and multiplayer included) and never what the game wouldn't allow.
  Where the game has no key, the mod calls the game's own functions: the
  cruise set speed, select and detach
  ([spec 0009](../specs/0009-one-way-to-run-each-action.md)), and two the
  game offers only in a menu or a dialog: a contract's accept, cancel and
  hand in ([spec 0019](../specs/0019-contract-actions.md)), and Steering
  Assist's settings, as its AI Settings dialog's OK does
  ([spec 0022](../specs/0022-steering-assist-settings.md)). Those two run
  the game's own checks first, answer ok only once the game reads the
  change back, and work only where the game is the server.
- **Commands say the state they want.** A lost or doubled command then
  does no harm, so nothing has to deduplicate, replace or resend them.
- **One local process.** The first build had a client and a relay backend
  with pairing and uploads; for a game on the same PC that was four hops.
  Since [spec 0006](../specs/0006-one-local-process.md) it's one.
