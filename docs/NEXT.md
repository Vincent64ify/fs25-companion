# Next

Things to do next, in no particular order: small fixes, which need no
spec, and features waiting for one. Longer-term ideas are in
[PLAN.md](PLAN.md).

- **Contracts: what a baling contract counts** ([spec 0018](../specs/0018-contracts.md)).
  Its progress shows (the game's completion), and it has no litres to
  deliver (spike, 2026-11-17). Not known: whether completion is the share
  of the windrow's straw picked up (`spawnedLiters` 24,324 l laid,
  `THRESHOLD_LITERS` 1500) or of the area, and whether any straw or bales
  are yours to keep (an Extra). Check: at a noted %, the litres in the
  bales made against `spawnedLiters` × completion; then see what's left
  after it finishes. (Mod 0.20.5 no longer reads BetterContracts'
  `BaleMission.FILL_SUCCESS_FACTOR`; the web gives baling no factor.)
