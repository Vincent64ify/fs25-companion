# Next fixes

Things to fix after Phase 4, in no particular order. Longer-term ideas are
under **Later** in [PLAN.md](PLAN.md).

## 1. Vehicle values that don't work

In the first live session (Solek, Volvo L90H), the controlled vehicle
arrived without `fuel`, `fuelCapacity`, `wear` and `operatingHours`, so the
panel shows "–" for fuel, wear and hours. What did arrive: rpm, rpm range,
engine on, motor temperature, mass, lights, speed and implements.

Leads (`mod/src/collectors/Vehicles.lua`):
- **Wear:** the implement's wear works through `getDamageAmount()`, but the
  vehicle reads `spec_wearable.wear`, which is nil. Use `getDamageAmount()`
  for the vehicle too.
- **Fuel:** `spec_motorized.fuelLevel` / `maxFuelLevel` are nil. FS25 keeps
  fuel in a fill unit: try `getConsumerFillUnitIndex(FillType.DIESEL)` (also
  electric charge and methane) with `getFillUnitFillLevel` /
  `getFillUnitCapacity`.
- **Hours:** `getOperationTime()` returned nothing. Try
  `vehicle.operatingTime` (ms) or `spec_motorized.operatingTime`.
- The Volvo L90H is a wheel loader; check a tractor too.
- The spike can dump the controlled vehicle's specs to find the right names.

Other values worth showing, if the API gives them:
- fill levels of the vehicle and implements (tank, trailer, sprayer, seeds)
- DEF / AdBlue level
- cruise control state and speed
- damage vs. wear (FS25 has both)
- current field number and work (from the field under the vehicle)
- AI worker state and job
- price / value of the vehicle
