# Next

Things to do next, in no particular order: small fixes, which need no
spec, and features waiting for one. Longer-term ideas are in
[PLAN.md](PLAN.md).

- **Contracts: a baling contract has no litres needed and no Extra**
  ([spec 0018](../specs/0018-contracts.md)). The game has no
  `BaleMission.FILL_SUCCESS_FACTOR` (stream of 2026-11-16: only `field`
  and `harvest` factors arrive), so the mod sends no `bale` factor. Find
  the baling contract's real factor in the game's `BaleMission.lua`
  (gameSource.zip) and read that.
- **Trail: a self-propelled sprayer leaves none** (Vincent, 2026-11-17,
  the Rogator on a contract). `web/src/data/coverage.js` follows only the
  attached tools (`implementsOf`); a Rogator's boom is the vehicle
  itself. Count the vehicle as a tool when it has a working width or
  sections ([spec 0013](../specs/0013-vehicle-screen-calm.md)'s trail).
  Contract fields already count as yours (spec 0018).
- **Contracts: a potato harvest's expected litres arrive as 0** (same
  stream), so it shows "0 l" where it should show nothing or the real
  number. Look at how `HarvestMission` fills `expectedLiters` for root
  crops.
