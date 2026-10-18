#!/usr/bin/env python3
"""Generate a web map config (web/maps/<id>.json) from a map image.

The map image is the one the game uses for its map screen (from the map
mod). The projection maps world X/Z coordinates onto the image:

    imageX = (worldX - worldMinX) / (worldMaxX - worldMinX) * imageWidth
    imageY = (worldZ - worldMinZ) / (worldMaxZ - worldMinZ) * imageHeight

World bounds: open the map in GIANTS Editor 10 and read the terrain/map
transform (see README.md), or verify empirically — the dashboard shows the
live world X/Z, so drive to a known spot (e.g. your farm) and nudge the
bounds until the marker lands on it.

Usage:
    python make_map_config.py --image amdream.png --id amdream \
        --name "American Dream" \
        --min-x -1000 --min-z -1000 --max-x 1000 --max-z 1000 \
        --out ../web/maps/amdream.json
"""

import argparse
import json
from pathlib import Path


def image_size(path: Path):
    try:
        from PIL import Image
    except ImportError:
        return None
    with Image.open(path) as img:
        return img.size


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--image", required=True, help="path to the map image (copied reference only)")
    p.add_argument("--id", required=True, help="map config id, e.g. amdream")
    p.add_argument("--name", default="", help="display name")
    p.add_argument("--min-x", type=float, required=True)
    p.add_argument("--min-z", type=float, required=True)
    p.add_argument("--max-x", type=float, required=True)
    p.add_argument("--max-z", type=float, required=True)
    p.add_argument("--width", type=int, default=0, help="image width (if Pillow unavailable)")
    p.add_argument("--height", type=int, default=0, help="image height (if Pillow unavailable)")
    p.add_argument("--out", default=None, help="output JSON path (default: ../web/maps/<id>.json)")
    args = p.parse_args()

    img = Path(args.image)
    size = image_size(img)
    if size is None:
        if not (args.width and args.height):
            raise SystemExit("install Pillow (pip install Pillow) or pass --width/--height")
        w, h = args.width, args.height
    else:
        w, h = size

    out = Path(args.out) if args.out else Path(__file__).parent.parent / "web" / "maps" / f"{args.id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "id": args.id,
        "name": args.name or args.id,
        "image": f"maps/{img.name}",
        "headingOffset": 0,
        "projection": {
            "imageWidth": w,
            "imageHeight": h,
            "worldMinX": args.min_x,
            "worldMinZ": args.min_z,
            "worldMaxX": args.max_x,
            "worldMaxZ": args.max_z,
        },
    }, indent=2) + "\n")
    print(f"wrote {out}")
    print("remember to make sure the image is available at the `image` path")
    print("relative to the web app root (web/maps/ in this repo).")


if __name__ == "__main__":
    main()
