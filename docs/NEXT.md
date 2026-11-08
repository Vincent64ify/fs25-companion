# Next fixes

Things to fix next, in no particular order. Longer-term ideas are under
**Later** in [PLAN.md](PLAN.md).

- **Tip fades when the game won't tip** (for the trailer's spec; rule 2
  of [spec 0012](../specs/0012-card-buttons.md)): two cases where Tip
  stays live and answers "Nothing moved" after its check's wait, both
  on the Vestrum 100 with two EDK 650:
  - The engine off (spec 0008's live check, 2026-10-31): the game only
    says to start the engine. Fold and lower are refused at once with
    the game's words (`VehicleState.powered`); Tip should be too.
  - The grain door side (spec 0012's live check, 2026-11-07, mod
    0.13.2): the other sides tipped. Not the second trailer: the game's
    Trailer.lua reads each tip side's XML `canTip` ("if false, only back
    door control is allowed") and `getCanDischargeToGround` is false for
    it; `canTipIfEmpty` false does the same on an empty tank. Our reason
    ("This side only opens its door"); unverified whether the game's key
    does anything else on that side (the door).
- **AI worker opens the game's worker screen** (spec 0008's live check,
  2026-10-31): `TOGGLE_AI` does nothing in a vehicle with no job set up
  (the L90H, the T7.300), so the button can't hire. Vincent: a tap
  should open the game's AI job screen (pick the job there), and stop a
  worker that runs. Opening that screen from the mod needs a game GUI
  call that isn't verified: find it first.
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
- **Code review of 2026-10-30:** seven findings (F1 to F7) in
  [REVIEW-2026-10-30.md](REVIEW-2026-10-30.md), with its suggested order.
  F2 is fixed ([spec 0005](../specs/0005-tailer-sees-every-new-file.md),
  client only, live-checked); F3 and F4 matter before a hosted relay. F1 is fixed
  ([spec 0004](../specs/0004-acks-survive-rotation.md), mod 0.8.13,
  live-checked); F5 (mod 0.8.12), F6 and F7 are fixed (2026-10-30).
- **A sprayer without Precision Farming** (specs 0011 and 0012, not
  checked): every sprayer in the save has Precision Farming's sprayer
  part, so its four width buttons (Left in / out, Right in / out, faded
  while the spray type has no partial width) and Doubled rate on a
  slurry tanker or a manure spreader were never seen live. Check them in
  a save without Precision Farming, if there ever is one, with spec 0013
  revision 4's last box: the strip and the trail follow the sections set
  by hand (no `spraySpans`).
- **Refill on the dashboard** (Vincent, spec 0011's live check,
  2026-11-02): at a fill station the game offers Refill for the sprayer;
  a button for it when the game shows it. It isn't one of the tool's
  keys (it comes from the station, the game's activatable objects; names
  unverified), so it needs its own spec.
