# Plan

What's still ahead for FS25 Companion: the longer-term ideas. Nothing
here is history, and nothing here is a check:

- what's built, and where each feature stands, is the table in
  [specs/README.md](../specs/README.md);
- how it works, and the ground rules, are in
  [ARCHITECTURE.md](ARCHITECTURE.md);
- small fixes, and what's waiting for a spec, are in [NEXT.md](NEXT.md);
- a feature's live check is in its spec, and the game names nobody has
  confirmed yet are in [GAME-API.md](GAME-API.md#not-verified-yet).

## Later

- **The game's time scale** (Vincent, 2026-11-10): at x5 or x20 a
  vehicle still works at real-time rates (fuel, a tank filling or
  emptying), so the dashboard's "time left" estimates, timed on the
  browser's clock, are right at any speed. What the time scale changes
  is what runs on the game clock, such as production buildings: a screen
  for those would need it (its name in FS25 unverified, e.g.
  `missionInfo.timeScale`).
- **Sell prices:** a `prices` topic (sell point → fill type → price, about
  every 60 s), and a way to show it.
- **Missions and contracts.**
- **AI workers:** their routes on the map.
- **AI worker button opens the game's worker screen** (spec 0008's live
  check, 2026-10-31): `TOGGLE_AI` does nothing in a vehicle with no job
  set up, so the button can't hire. A tap should open the game's AI job
  screen (pick the job there), and stop a worker that runs. Opening that
  screen from the mod needs a game GUI call that isn't verified. Complex
  to put in place: it gets its own spec (Vincent, 2026-11-10).
- **Refill from the dashboard** (Vincent, spec 0011's live check,
  2026-11-02): a button for the game's Refill when the game offers it.
  Complex, so it gets its own spec (Vincent, 2026-11-10): a tool fills
  from many things (a sell point, your own silos and tanks, another
  vehicle or tool, pallets, big bags ...), each the game's own
  activatable or fill trigger, names unverified.
- **Multiplayer:** farm colours.
- **Tray app:** a system-tray companion built with PyInstaller.
- **A hosted relay:** a separate small service, plus a `--relay <url>`
  option on the local app that forwards the same viewer messages up and
  commands down, with pairing and tokens living only there. Nothing local
  depends on it. The code review of 2026-10-30 found that any visitor
  could fill the old relay's disk with uploads (its F3): the new one needs
  a real enrolment step and storage limits.
- More screens, layout editing and other brands are under Later in
  [THEMES.md](THEMES.md#later).

Ruled out: front loader and crane control from the dashboard (Vincent,
2026-10-24: "not efficient"), and with them held controls (press and
release).
