# Next fixes

Things to fix after Phase 4, in no particular order. Longer-term ideas are
under **Later** in [PLAN.md](PLAN.md).

## 1. Vehicle values that don't work

In the first live session (Solek, Volvo L90H), the controlled vehicle
arrived without `fuel`, `fuelCapacity`, `wear` and `operatingHours`, so the
panel shows "–" for fuel, wear and hours. What did arrive: rpm, rpm range,
engine on, motor temperature, mass, lights, speed and implements.

**Changed; works on a tractor (JCB Fastrac 2115, Kinlaig), wheel loader still to check** (`mod/src/collectors/Vehicles.lua`):
- **Wear:** now `getDamageAmount()`, like the implements (falls back to
  `spec_wearable.damage` / `.wear`).
- **Fuel:** now the motor's consumer fill unit,
  `getConsumerFillUnitIndex(FillType.DIESEL)` (then electric charge, then
  methane) with `getFillUnitFillLevel` / `getFillUnitCapacity`; also sends
  `fuelType`. Falls back to the old `spec_motorized` fields.
- **Hours:** now `getOperatingTime()`, then `vehicle.operatingTime`, then
  `spec_motorized.operatingTime`, all read as ms.
- Check both the Volvo L90H (wheel loader) and a tractor. The spike's
  `report.json` now has `vehicles.controlledDetail` with every candidate
  above, the consumer fill units and the motorized, wearable and fill unit
  specs: run `csDump` while seated if the panel still shows "–".

Other values worth showing, if the API gives them:
- fill levels of the vehicle and implements (tank, trailer, sprayer, seeds)
- DEF / AdBlue level
- cruise control state and speed
- damage vs. wear (FS25 has both)
- current field number and work (from the field under the vehicle)
- AI worker state and job
- price / value of the vehicle
