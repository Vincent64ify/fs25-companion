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
- **Code review of 2026-10-30:** seven findings (F1 to F7) in
  [REVIEW-2026-10-30.md](REVIEW-2026-10-30.md), with its suggested order.
  F2 is fixed ([spec 0005](../specs/0005-tailer-sees-every-new-file.md),
  client only, live-checked); F3 and F4 matter before a hosted relay. F1 is fixed
  ([spec 0004](../specs/0004-acks-survive-rotation.md), mod 0.8.13,
  live-checked); F5 (mod 0.8.12), F6 and F7 are fixed (2026-10-30).
- **Vehicle screen console error:** `vehicleTools.js` render (the "also
  attached" rows) throws "Cannot read properties of undefined (reading
  'badge')" on every vehicles update in the Solek replay: `rows.get(e.id)`
  misses for a row the order check skipped. Seen 2026-10-31 on the
  committed code (5d2d36c) as well as after spec 0006, so it predates S1.
- **The other keys' labels are cut off** four to a row on a card ("Toggle
  work …", "Work mode ri…" on the Samasz KDD 941 STH): let them wrap onto
  two lines. Live (2026-10-30): with all four the same at a glance,
  Vincent couldn't tell which was "Work mode left".
- **The vehicle's other keys:** with the tractor itself selected, its
  `extraKeys` list every driving key (Accelerate, Steer vehicle, Honk...;
  live 2026-10-31, the Vestrum 100). No card shows them today (a tractor
  has none), but a self-propelled sprayer's would.
