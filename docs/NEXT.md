# Next fixes

Things to fix next, in no particular order. Longer-term ideas are under
**Later** in [PLAN.md](PLAN.md).

- **Lower all: back to the game's own key.** We want the game's keys, not
  workarounds (Vincent, 2026-10-30). Since mod 0.8.11, Lower all runs each
  tool's own Lower, because the mod's press of `LOWER_ALL_IMPLEMENTS` did
  nothing every other time while Ctrl+V always worked (spec 0003, Log).
  The likely cause: the mod's `runInputAction` calls every handler
  registered for the key, and the game presses only one. To fix it: log
  which events are registered for `LOWER_ALL_IMPLEMENTS` (their
  `targetObject`) on the mower rigs, press the one the game would (the
  vehicle's), then go back to the key and drop the workaround. The same
  check applies to Fold all and Turn on all, which work today with one
  press but go through the same function.
- **The other keys' labels are cut off** four to a row on a card ("Toggle
  work …", "Work mode ri…" on the Samasz KDD 941 STH): let them wrap onto
  two lines.
