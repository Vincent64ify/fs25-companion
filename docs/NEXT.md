# Next fixes

Things to fix after Phase 4, in no particular order. Longer-term ideas are
under **Later** in [PLAN.md](PLAN.md).

## 1. Field info hides the farmland under it

Clicking a field opens the field info panel (bottom left), which is fine.
But fields sit on top of farmlands, so the click never reaches the
farmland, and its popup (area in ha, sale price) no longer opens.

What the field panel shows today: owner, the sale price and the farmland
number. It doesn't show the farmland's own area, which differs from the
field's (a farmland is usually bigger than its field).

Options:
- Add a farmland section to the field panel: farmland number, its area,
  owner and price. One click shows both, no popup needed.
- Or make the panel cover any click: a field shows field + farmland, a
  spot outside fields shows the farmland alone, and the farmland popups go
  away so there's one way to see details.

## 2. Show only the playable area

The overview image is twice the size of the terrain (the playable area is
its centre quarter, `mapExtensionScaleFactor` 0.5), so the map shows a wide
border nobody can drive in. To be decided:

- Crop the image to the playable bounds, either in the client
  (`map_assets.py`, when it converts the DDS) or with Leaflet bounds only.
  `meta.json` already has `playableBounds`.
- Limit panning and zoom-out to the playable area (`constrainTo` in
  `mapView.js` currently uses the whole image plus a margin).
- The map is always square. How should it fit the dashboard so it stays
  neatly in place, stays responsive and fills the screen?
  - Wide screens: a square map using the full height, with the panels in
    the remaining width.
  - Tall screens (phones): a square map using the full width, panels below
    or in a drawer.
  - Or a full-screen map with the panels floating over it, and "fit" means
    the playable square fits the shorter side.

## 3. Vehicle values that don't work

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
