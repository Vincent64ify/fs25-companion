# Map builder

Tools to produce the per-map configs the dashboard uses (`web/maps/<id>.json`).

## What you need per map

1. **The map image** — the picture the game shows on its map screen. It ships
   with the map mod (look for the large map PNG inside the map's files, or
   take a full-resolution screenshot of the in-game map without the vehicle
   markers).
2. **World bounds** — the world X/Z range the image covers.

## Getting the world bounds

- **GIANTS Editor 10** (official, free): open the map and read the terrain /
  map transform. Community script packs for FS25 exist, e.g.
  [FSGModding/FS25-GE10-Scripts-Modding-Tools](https://github.com/FSGModding/FS25-GE10-Scripts-Modding-Tools).
- **Empirically** (easiest for a first pass): open the dashboard, drive to a
  recognizable spot (your farm), note the live `Position` readout (world
  X/Z), and adjust `worldMinX/MinZ/MaxX/MaxZ` until the marker lands on it.
  Two well-separated points (farm + town) pin down the scale and origin.

## Generate the config

```bash
pip install Pillow   # optional, to read the image size
python make_map_config.py \
    --image ../web/maps/amdream.png \
    --id amdream --name "American Dream" \
    --min-x -1000 --min-z -1000 --max-x 1000 --max-z 1000
```

## Calibrating heading

The mod sends `deg(-rotY) % 360`. Drive due north (top of the map) and look
at the marker: if it points the wrong way, set `headingOffset` in the map
config to 90 / 180 / 270 until it matches.

## Ideas for later

- Extract road splines + field polygons from the map file (GIANTS Editor 10
  scripts) to draw a route graph / field-state overlay.
- Auto-detect the map from the `MapName` telemetry field and switch configs
  at runtime.
