# Map assets

One config per game map, e.g. `amdream.json`:

```json
{
  "id": "amdream",
  "name": "American Dream",
  "image": "maps/amdream.png",
  "headingOffset": 0,
  "overviewSpanFactor": 2.0,
  "projection": {
    "imageWidth": 4000,
    "imageHeight": 4000,
    "view": { "x": 1000, "y": 1000, "w": 2000, "h": 2000 },
    "worldMinX": -1000,
    "worldMinZ": -1000,
    "worldMaxX": 1000,
    "worldMaxZ": 1000
  }
}
```

The dashboard maps world X/Z onto the image's `view` rectangle (the part of
the texture that corresponds to the playable terrain). The FS25 PDA overview
image covers **twice** the terrain size: the playable area is the central
quarter of the texture and the in-game PDA displays only that part — the
outer ring (clouds/vignette) never shows in game. The dashboard therefore
draws only the view rect too, so it stays 1:1 with the in-game PDA
(`overviewSpanFactor` 2.0 by default; set to 1.0 for maps whose image covers
just the terrain):

```
imageX = view.x + (worldX - worldMinX) / (worldMaxX - worldMinX) * view.w
imageY = view.y + (worldZ - worldMinZ) / (worldMaxZ - worldMinZ) * view.h
```

The bundled `amdream.json` has **placeholder bounds** — the marker will be
off until you generate a real one. See `../../builder/README.md` for how to
get the map image and the world bounds.

Map images are git-ignored (they're game assets and can be large); keep
them local or host them on a CDN and point `image` at the URL.
