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
- **Contracts: a potato harvest's expected litres arrive as 0** (same
  stream), so it shows "0 l" where it should show nothing or the real
  number. Look at how `HarvestMission` fills `expectedLiters` for root
  crops.
