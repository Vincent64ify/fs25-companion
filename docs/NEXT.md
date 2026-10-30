# Next fixes

Things to fix next, in no particular order. Longer-term ideas are under
**Later** in [PLAN.md](PLAN.md).

- **Lower all: back to the game's own key.** We want the game's keys, not
  workarounds (Vincent, 2026-10-30). Since mod 0.8.11, Lower all runs each
  tool's own Lower, because the mod's press of `LOWER_ALL_IMPLEMENTS` did
  nothing every other time while Ctrl+V always worked (spec 0003, Log).
  Spikes 0.0.5 and 0.0.6 ruled out the suspected cause: the key has one
  handler (the tractor's), and pressed exactly as the mod does it lowered
  both mowers every time, in work mode left too. So the key can come
  back; do it after the checked answers below, so a failure would show.
- **Answers that check the tools moved:** a command's ok today only says
  a key's handler ran ("answered ok and nothing moved", spec 0003). The
  mod should answer ok once the tools' states moved the way the button
  asked (folded, lowered, on), else say nothing changed with the game's
  warning. Changes what spec 0003 promises: a revision of it first.
- **Code review of 2026-10-30:** seven findings (F1 to F7) in
  [REVIEW-2026-10-30.md](REVIEW-2026-10-30.md), with its suggested order.
  F2 is fixed ([spec 0005](../specs/0005-tailer-sees-every-new-file.md),
  client only, live-checked); F3 and F4 matter before a hosted relay. F1 is fixed
  ([spec 0004](../specs/0004-acks-survive-rotation.md), mod 0.8.13,
  live-checked); F5 (mod 0.8.12), F6 and F7 are fixed (2026-10-30).
- **The other keys' labels are cut off** four to a row on a card ("Toggle
  work …", "Work mode ri…" on the Samasz KDD 941 STH): let them wrap onto
  two lines.
