# Plan

Later ideas for FS25 Companion, with no history and no checks. Elsewhere:

- what's built, and where each feature stands: the table in
  [specs/README.md](../specs/README.md);
- how it works, and the ground rules: [ARCHITECTURE.md](ARCHITECTURE.md);
- small fixes, and what's waiting for a spec: [NEXT.md](NEXT.md);
- a feature's live check: its spec; game names nobody has confirmed:
  [GAME-API.md](GAME-API.md#not-verified-yet).

## Later

- **The game's time scale** (Vincent, 2026-11-10): what runs on the game
  clock, such as production buildings, speeds up with it, so a screen
  for those would need `env.timeScale` (from
  [specs/0017](../specs/0017-game-speed.md)). Vehicles keep real-time
  rates, so the dashboard's estimates need nothing
  ([specs/0021](../specs/0021-gps-screen.md)).
- **Sell prices:** a `prices` topic (sell point → fill type → price, about
  every 60 s); how to show it is open.
- **GPS settings: as last time with this tool** (Vincent, 2026-11-26,
  from [specs/0022](../specs/0022-steering-assist-settings.md)'s
  revision 3; sketched on the GPS canvas's board "Glance day recall"):
  after a hitch the game puts the settings back to Auto. A button under
  the field's tag, "As last time with the LEMKEN Smaragd: 5.0 m · 2
  headlands · 0.3 m right", puts that tool's last width, headlands and
  offset in the draft. Not the direction: it's the field's. Kept in the
  browser, per tool.
- **GPS lanes on the Map** (Vincent, 2026-11-19, from
  [specs/0021](../specs/0021-gps-screen.md)'s questions): the lanes of
  the field you're on as a Map layer you can switch on and off, from the
  GPS screen's `steering_course` topic.
- **AI workers:** their routes on the map.
- **AI worker button opens the game's worker screen** (spec 0008's live
  check, 2026-10-31): `TOGGLE_AI` does nothing in a vehicle with no job
  set up, so the button can't hire. A tap should open the game's AI job
  screen (pick the job there), and stop a worker that runs. Opening that
  screen from the mod needs a game GUI call nobody has verified, so it
  gets its own spec (Vincent, 2026-11-10). Open for that spec (spec
  0020's review, 2026-11-18): the mod presses `TOGGLE_AI` down only, and
  per the game's source (unverified) its handler acts on a later call.
  Does a dashboard tap leave the H key's hold timer armed, so the next
  real H opens the AI Settings dialog? And was the missing job the real
  cause?
- **Refill from the dashboard** (Vincent, spec 0011's live check,
  2026-11-02): a button for the game's Refill when the game offers it.
  Complex, so it gets its own spec (Vincent, 2026-11-10): a tool fills
  from many sources (a sell point, your own silos and tanks, another
  vehicle or tool, pallets, big bags ...), each its own game activatable
  or fill trigger, names unverified.
- **Multiplayer:** farm colours.
- **Tray app:** the companion as a system-tray app, packaged with
  PyInstaller.
- **A hosted relay:** a separate service, plus a `--relay <url>` option on
  the companion that forwards the same viewer messages up and commands
  down. Pairing and tokens live only on the relay; nothing local depends
  on it. It needs an enrolment step and storage limits: the old relay let
  any visitor fill its disk with uploads (F3 of the code review of
  2026-10-30).
- More screens, layout editing and other brands are under Later in
  [THEMES.md](THEMES.md#later).

## Ruled out

Front loader and crane control from the dashboard (Vincent, 2026-10-24:
"not efficient"), and with them held controls (press and release).
