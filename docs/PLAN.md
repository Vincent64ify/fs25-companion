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
  for those would need it (`env.timeScale`, from
  [specs/0017](../specs/0017-game-speed.md)).
- **Sell prices:** a `prices` topic (sell point → fill type → price, about
  every 60 s), and a way to show it.
- **AI workers:** their routes on the map.
- **GPS settings: as last time with this tool** (Vincent, 2026-11-26,
  asked in [specs/0022](../specs/0022-steering-assist-settings.md)'s
  revision 3, drawn on the GPS canvas's board "Glance day recall"): after
  a hitch the game puts the settings back to Auto, so a button on the
  field under the tag, "As last time with the LEMKEN Smaragd: 5.0 m · 2
  headlands · 0.3 m right", puts width, headlands and offset in the draft
  (not the direction: it's the field's); kept in the browser per tool.
- **GPS lanes on the Map** (Vincent, 2026-11-19, from
  [specs/0021](../specs/0021-gps-screen.md)'s questions): the lanes of the
  field you're on as a Map layer you can switch on and off, from the
  `steering_course` topic (the GPS screen's, since spec 0021).
- **AI worker button opens the game's worker screen** (spec 0008's live
  check, 2026-10-31): `TOGGLE_AI` did nothing live in a vehicle with no
  job set up, so the button can't hire. A tap should open the game's AI job
  screen (pick the job there), and stop a worker that runs. Opening that
  screen from the mod needs a game GUI call that isn't verified. Complex
  to put in place: it gets its own spec (Vincent, 2026-11-10). Open for
  that spec (spec 0020's review, 2026-11-18): the mod presses `TOGGLE_AI`
  down only, and the game's handler acts on a later call (per the game's
  source, unverified); whether a
  dashboard tap leaves H's hold timer armed (so the next real H opens the
  AI Settings dialog), and whether "needs a job" was the real cause.
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
