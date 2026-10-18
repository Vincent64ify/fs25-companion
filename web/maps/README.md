# Map assets

One config per game map, e.g. `amdream.json`:

```json
{
  "id": "amdream",
  "name": "American Dream",
  "image": "maps/amdream.png",
  "headingOffset": 0,
  "projection": {
    "imageWidth": 4000,
    "imageHeight": 4000,
    "worldMinX": -1000,
    "worldMinZ": -1000,
    "worldMaxX": 1000,
    "worldMaxZ": 1000
  }
}
```

The dashboard maps world X/Z onto the image with:

```
imageX = (worldX - worldMinX) / (worldMaxX - worldMinX) * imageWidth
imageY = (worldZ - worldMinZ) / (worldMaxZ - worldMinZ) * imageHeight
```

The bundled `amdream.json` has **placeholder bounds** — the marker will be
off until you generate a real one. See `../../builder/README.md` for how to
get the map image and the world bounds.

Map images are git-ignored (they're game assets and can be large); keep
them local or host them on a CDN and point `image` at the URL.
