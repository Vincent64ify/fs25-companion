# Next

Things to do next, in no particular order: small fixes, which need no
spec, and features waiting for one. Longer-term ideas are in
[PLAN.md](PLAN.md).

- **Time estimates and the game's time scale** (Vincent, 2026-10-31):
  the "time left" estimates (fuel and DEF range, a seed or spray tank
  empty, a grain tank full) must take the game's speed into account (x1,
  x5, x20 ...). Today they ignore it: `web/src/data/rates.js` times the
  levels with the browser's clock (`performance.now()`), and the fuel
  range divides by the game's L/h (`lastFuelUsageDisplay`), while the
  dashboard's clock shows game time. To do: send the time scale from the
  mod (`env` topic; its name in FS25 is unverified, e.g.
  `missionInfo.timeScale`, behind `Api.lua`); check in game at x1 and x5
  what scales (does a tank drop faster per real minute? is the HUD's L/h
  per game hour?); then say which time each estimate shows (real minutes,
  game time, or "until 14:30" on the game clock) and convert. Needs a
  spec (mod, protocol field and screens).
- **A sprayer without Precision Farming** (specs 0011 and 0012, not
  checked): every sprayer in the save has Precision Farming's sprayer
  part, so its four width buttons (Left in / out, Right in / out, faded
  while the spray type has no partial width) and Doubled rate on a
  slurry tanker or a manure spreader were never seen live. Check them in
  a save without Precision Farming, if there ever is one, with spec 0013
  revision 4's last box: the strip and the trail follow the sections set
  by hand (no `spraySpans`).
