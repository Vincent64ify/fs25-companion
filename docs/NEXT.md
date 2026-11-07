# Next fixes

Things to fix next, in no particular order. Longer-term ideas are under
**Later** in [PLAN.md](PLAN.md).

- **The Vehicle page is slow to show on iPad** ([spec 0013](../specs/0013-vehicle-screen-calm.md),
  2026-11-07): on an iPad Pro M4 in Safari, opening Vehicle (from Map, or
  switching vehicles) waits ~100–300 ms, then everything appears at
  once. Harvester and Loader switch at once, so it's the field panel.
  Not reproduced in the Windows browser pane (taps paint in 16–24 ms,
  a full 20,000-point trail too). Likely cause: the panel's SVG draws
  the whole 4096 px `overview.png` to show one field, and Safari decodes
  it again each time the screen is shown. Needs a clean way to share
  the map between the Map screen and the panel; unverified until checked
  on the iPad. The fix is spec 0013's revision 2 (built 2026-11-07): no
  map image in the panel; this entry closes when the iPad check passes.

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
- **The other buttons' answers:** since spec 0003 revision 2 (mod 0.8.14)
  fold, lower and turn on answer ok only once the tools moved, Tip since
  revision 3 (mod 0.8.16), and spec 0012's switches (Rotate, Create
  fields, Automatic drop, Doubled rate, the rate) once their state reads
  back (mod 0.13.0). Pipe, Tip side and Cover (back since spec 0012:
  `implement.cover`, no `checked` in its ack on 2026-11-07) still answer
  once their key ran; each gets the same check in its rig's spec.
  Live (2026-10-31): Tip answered ok and nothing tipped over a sale
  point that doesn't take the load and on land not ours ("You don't
  have access to this land"); spec 0003's Log.
- **AI worker opens the game's worker screen** (spec 0008's live check,
  2026-10-31): `TOGGLE_AI` does nothing in a vehicle with no job set up
  (the L90H, the T7.300), so the button can't hire. Vincent: a tap
  should open the game's AI job screen (pick the job there), and stop a
  worker that runs. Opening that screen from the mod needs a game GUI
  call that isn't verified: find it first.
- **Lower all answered "Nothing moved" once** (spec 0008's live check,
  2026-10-31, T7.300 with the KDF 341 S and KDD 941 STH, both raised and
  unfolded, game in focus): the front lowered about 3 s after the press
  instead of at once, after the check's 1 s, and the doubled Lower all
  pressed the key again (both ended lowered). The same press a minute
  later was clean ([spec 0008](../specs/0008-commands-say-the-state.md)'s
  Log). The frames rotated away; next time, keep a copy of the stream and
  see whether the combo ran (`attacherJointCombos.isRunning`).
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
  a save without Precision Farming, if there ever is one.
- **The rig strip's names** (seen building spec 0012, 2026-11-03): the
  Vehicle page band's strip is rebuilt only when its key changes
  (`vehicleScreen.js`), and the key leaves out the model's name, which
  comes from the `vehicles` topic. Getting into another vehicle, the cab
  arrives first (every frame) and the vehicles topic up to 500 ms later,
  so the vehicle's tile can keep the last vehicle's name. Add
  `entryModel(e, v)` to the key.
- **Refill on the dashboard** (Vincent, spec 0011's live check,
  2026-11-02): at a fill station the game offers Refill for the sprayer;
  a button for it when the game shows it. It isn't one of the tool's
  keys (it comes from the station, the game's activatable objects; names
  unverified), so it needs its own spec.
- **The design system artifact** needs a refresh (THEMES.md): spec 0011
  added four icons (`widthLeftIn`, `widthLeftOut`, `widthRightIn`,
  `widthRightOut`) and the width strip, and the selected tool card lost
  its tint (2026-11-01); spec 0012 added the card's More button and its
  open row (no new icon, 2026-11-03).
