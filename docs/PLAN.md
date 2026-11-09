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

- **Sell prices:** a `prices` topic (sell point → fill type → price, about
  every 60 s), and a way to show it.
- **Missions and contracts.**
- **AI workers:** their routes on the map.
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
