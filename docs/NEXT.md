# Next fixes

Things to fix next, in no particular order. Longer-term ideas are under
**Later** in [PLAN.md](PLAN.md).

- **The other buttons' answers:** since spec 0003 revision 2 (mod 0.8.14)
  fold, lower and turn on answer ok only once the tools moved, and Tip
  since revision 3 (mod 0.8.16). Pipe and tip side still answer once
  their key ran; each gets the same check in its rig's spec. Cover and
  Rotate have no button since 0003's close (mod 0.8.17); theirs get it
  in the cover and plow specs.
  Live (2026-10-31): Tip answered ok and nothing tipped over a sale
  point that doesn't take the load and on land not ours ("You don't
  have access to this land"); spec 0003's Log.
- **AI worker opens the game's worker screen** (spec 0008's live check,
  2026-10-31): `TOGGLE_AI` does nothing in a vehicle with no job set up
  (the L90H, the T7.300), so the button can't hire. Vincent: a tap
  should open the game's AI job screen (pick the job there), and stop a
  worker that runs. Opening that screen from the mod needs a game GUI
  call that isn't verified: find it first.
- **Tip with the engine off** (spec 0008's live check, 2026-10-31, the
  Vestrum 100 and two EDK 650): the game only says to start the engine,
  and Tip answers "Nothing moved" after its check's wait. Fold and lower
  are refused at once with the game's words (`VehicleState.powered`); tip
  should be too, and its card button fade, in the trailer's spec.
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
- **The vehicle's other keys:** with the tractor itself selected, its
  `extraKeys` list every driving key (Accelerate, Steer vehicle, Honk...;
  live 2026-10-31, the Vestrum 100). No card shows them today (a tractor
  has none), but a self-propelled sprayer's would. Built in
  [spec 0011](../specs/0011-sprayer.md) (mod 0.12.0): the vehicle's own
  keys leave its driving parts' keys out. Live (the Agrio DINO II):
  all but "Toggle AI Worker", spec 0011's fix 3.
- **The mod's version in hello** (spec 0011's live check, 2026-11-01):
  `Companion.VERSION` in `mod/src/Companion.lua` still says 0.9.1, so
  hello's `modVersion` is wrong since 0.9.1 (the game ran 0.12.1). Read it
  from `modDesc.xml` at load (`g_modManager`, unverified), or bump it with
  every mod version.
- **The design system artifact** needs a refresh (THEMES.md): spec 0011
  added four icons (`widthLeftIn`, `widthLeftOut`, `widthRightIn`,
  `widthRightOut`) and the width strip, and the selected tool card lost
  its tint (2026-11-01).
