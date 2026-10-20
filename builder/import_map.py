#!/usr/bin/env python3
"""Auto-generate dashboard map assets from a savegame.

Reads the most recent savegame's careerSavegame.xml to find out which map
is running (e.g. ``FS25_Solek.SampleModMap``), locates that map's XML
(mod zip in the FS25 mods folder, or the base game's ``data/maps/…``),
extracts the PDA overview image (DDS is converted to PNG via Pillow) and
writes ``web/maps/<mapId>.json`` + ``web/maps/<mapId>.png`` for the
dashboard. Re-runs are cached: nothing happens if the source image
has not changed.

World bounds come from the map XML's ``width``/``height`` (terrain size
in world units, centred on the origin):  FS25 world coordinates run from
-sort/2 .. +size/2 along both X and Z.

The intent is that this runs automatically at client startup
(client/map_sync.py calls ``sync_current_map()``); you normally only
run this manually when debugging:

    python builder/import_map.py                 # latest savegame
    python builder/import_map.py --savegame 1    # specific savegame
    python builder/import_map.py --map-id FS25_Solek.SampleModMap

Requires Pillow for DDS images (pip install Pillow).
"""

import json
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WEB_MAPS = REPO / "web" / "maps"

DEFAULT_GAME_INSTALLS = [
    r"C:\Program Files (x86)\Steam\steamapps\common\Farming Simulator 25",
    r"C:\Program Files\Steam\steamapps\common\Farming Simulator 25",
    r"D:\SteamLibrary\steamapps\common\Farming Simulator 25",
]
DEFAULT_DOCS = "My Games/FarmingSimulator2025"


# --- savegame ---------------------------------------------------------------

def find_games_dir() -> Path:
    docs = Path.home() / "Documents"
    p = docs / DEFAULT_DOCS
    if p.is_dir():
        return p
    # some setups relocate Documents; try OneDrive redirection via registry is
    # overkill — fall back to a sibling of HOME
    for cand in [Path.home() / DEFAULT_DOCS, Path.home() / "OneDrive" / "Documents" / DEFAULT_DOCS]:
        if cand.is_dir():
            return cand
    raise SystemExit(f"could not find {DEFAULT_DOCS!r} under {docs}")


def latest_savegame(games_dir: Path, number: int | None = None) -> tuple[str, dict]:
    """Return (savegame_dir_name, {mapId, mapTitle, saveDate})."""
    best = None  # (sortkey, name, meta)
    for cfg in sorted(games_dir.glob("savegame*/careerSavegame.xml")):
        if number is not None and not cfg.parent.name.endswith(str(number)):
            continue
        try:
            root = ET.parse(cfg).getroot()
        except ET.ParseError:
            continue
        meta = {
            "mapId": (root.findtext(".//mapId") or "").strip(),
            "mapTitle": (root.findtext(".//mapTitle") or "").strip(),
            "saveDate": (root.findtext(".//saveDateFormatted") or "").strip(),
        }
        if not meta["mapId"]:
            continue
        sortkey = (meta["saveDate"], cfg.stat().st_mtime)
        if best is None or sortkey > best[0]:
            best = (sortkey, cfg.parent.name, meta)
    if best is None:
        raise SystemExit("no savegame with a mapId found")
    return best[1], best[2]


# --- map xml ----------------------------------------------------------------

def resolve_map_source(map_id: str, games_dir: Path, game_dir: Path | None):
    """Return an opener-ish tuple describing where the map XML + image live.

    Returns ``(kind, root, map_xml_path)`` where kind is "mod_zip",
    "mod_dir" or "basegame" and map_xml_path is relative to root (mod
    zip/folder) or absolute (basegame). ``root`` may be a Path to a zip
    file, a Path to a folder, or the game install dir (basegame).
    """
    mod_name = map_id.split(".", 1)[0]
    mods_dir = games_dir / "mods"

    # mod, zipped
    zip_path = mods_dir / f"{mod_name}.zip"
    if zip_path.is_file():
        return "mod_zip", zip_path, _mod_map_xml_in_zip(zip_path, mod_name, map_id)

    # mod, folder
    mod_dir = mods_dir / mod_name
    if mod_dir.is_dir():
        return "mod_dir", mod_dir, _mod_map_xml_in_dir(mod_dir, mod_name, map_id)

    # basegame: <game>/data/maps/<name>/map*.xml
    if game_dir is None or not game_dir.is_dir():
        return None, None, None
    data = game_dir / "data" / "maps"
    for xml in sorted(data.glob("map*/map*.xml")):
        base = xml.stem.lower()
        # careerSavegame mapId forms seen/expected: "mapUS", "maps/mapUS.xml",
        # "$data/maps/mapUS.xml"; match loosely on the stem.
        if map_id.lower() == base or map_id.lower().rstrip('.xml').endswith(base):
            return "basegame", game_dir, xml
    return None, None, None


def _mod_map_xml_in_zip(zip_path: Path, mod_name: str, map_id: str) -> str:
    with zipfile.ZipFile(zip_path) as z:
        desc = ET.fromstring(z.read("modDesc.xml"))
    for m in desc.findall("./maps/map"):
        if f"{mod_name}.{m.attrib.get('id')}" == map_id:
            return m.attrib["configFilename"]
    return next(m.attrib["configFilename"]
                for m in desc.findall("./maps/map"))


def _mod_map_xml_in_dir(mod_dir: Path, mod_name: str, map_id: str) -> str:
    desc = ET.fromstring((mod_dir / "modDesc.xml").read_text(
        encoding="utf-8-sig"))
    for m in desc.findall("./maps/map"):
        if f"{mod_name}.{m.attrib.get('id')}" == map_id:
            return m.attrib["configFilename"]
    return next(m.attrib["configFilename"] for m in desc.findall("./maps/map"))


def read_map_xml(kind: str, root, map_xml_path: str):
    """Return {terrainSize, imageSrc} from the map XML."""
    if kind == "mod_zip":
        with zipfile.ZipFile(root) as z:
            data = z.read(map_xml_path)
    elif kind == "mod_dir":
        data = (Path(root) / map_xml_path).read_bytes()
    else:  # basegame
        p = Path(map_xml_path)
        if not p.is_absolute():
            p = root / "data" / Path(map_xml_path).with_suffix(".xml").name
        data = Path(p).read_bytes()
    node = ET.fromstring(data)
    return {
        "imageSrc": node.attrib.get("imageFilename", ""),
        "terrainSize": float(node.attrib.get("width", "0")) or None,
    }


def read_bytes(kind: str, root, rel: str) -> bytes | None:
    rel = rel.replace("$data/", "").replace("$dataS/", "").lstrip("/")
    if kind == "mod_zip":
        with zipfile.ZipFile(root) as z:
            return z.read(rel)
    if kind == "mod_dir":
        return (Path(root) / rel).read_bytes()
    p = Path(rel)
    if not p.is_absolute():
        p = Path(root) / "data" / rel   # basegame: xml paths are under data/
    try:
        return p.read_bytes()
    except FileNotFoundError:
        return None


def convert_image(kind: str, root, image_src: str, out_png: Path,
                  game_dir: Path | None, map_rel_dir: str):
    """Extract the PDA image, converting DDS -> PNG. Returns source info."""
    cands = [image_src]
    if image_src.lower().endswith(".png"):
        stem = image_src[:-4]
        cands.insert(0, stem + ".dds")
    else:
        cands.insert(0, image_src[:-4] + ".png")

    for cand in cands:
        data = None
        if kind == "basegame":
            # e.g. "$data/maps/mapUS/textures/ui/overview.dds" — but the map
            # xml's imageFilename may also be relative to the map xml's dir
            for path in (cand, str(Path(map_rel_dir).parent / cand)):
                data = read_bytes(kind, root, path)
                if data:
                    cand = path
                    break
        else:
            data = read_bytes(kind, root, cand)
        if not data:
            continue
        if data[:4] == b"DDS ":
            w, h = struct.unpack("<I", data[12:16])[0], struct.unpack("<I", data[16:20])[0]
            try:
                from PIL import Image
                import io as _io
                img = Image.open(_io.BytesIO(data))
                img.load()
            except ImportError:
                raise SystemExit("Pillow is required for DDS maps: pip install Pillow")
            img.save(out_png, optimize=True)
            return {"source": cand, "size": [w, h], "dds": True}
        out_png.write_bytes(data)
        try:
            from PIL import Image
            w, h = Image.open(out_png).size
        except Exception:
            return {"source": cand, "size": None, "dds": False}
        return {"source": cand, "size": [w, h], "dds": False}
    return None


# --- main sync ---------------------------------------------------------------

def sync_current_map(games_dir: Path | None = None, game_dir: Path | None = None,
                     savegame: int | None = None, map_id_arg: str | None = None,
                     map_title_arg: str | None = None, quiet: bool = False) -> dict:
    """Ensure web/maps/<mapId>.{json,png} exist for the current savegame.

    Returns the resulting config dict (or raises SystemExit on problems).
    Safe to call at every client start: re-runs are cached.
    """
    games_dir = games_dir or find_games_dir()
    if game_dir is None:
        for cand in DEFAULT_GAME_INSTALLS:
            if Path(cand).is_dir():
                game_dir = Path(cand)
                break
    else:
        game_dir = Path(game_dir)

    if map_id_arg:
        save_name, meta = "(--map-id)", {
            "mapId": map_id_arg, "mapTitle": map_title_arg or map_id_arg.split(".")[-1]}
    else:
        save_name, meta = latest_savegame(games_dir, savegame)

    map_id = meta["mapId"]
    out_json = WEB_MAPS / f"{map_id}.json"

    kind, mod_root, xml_path = resolve_map_source(map_id, games_dir, game_dir)
    if kind is None:
        raise SystemExit(
            f"map {map_id!r}: not found — looked for mods/{map_id.split('.')[0]}.zip "
            f"and basegame data/maps (is the game installed at a custom path? use --game)")

    info = read_map_xml(kind, mod_root, xml_path)
    if not info["imageSrc"] or not info["terrainSize"]:
        raise SystemExit(f"unexpected map xml {xml_path}: {info}")

    out_png = WEB_MAPS / f"{map_id}.png"
    src = convert_image(kind, mod_root, info["imageSrc"], out_png, game_dir,
                        xml_path)
    if src is None:
        raise SystemExit(f"map {map_id!r}: PDA image {info['imageSrc']!r} not found")

    size = src["size"] or [4096, 4096]
    w = min(size[0], size[1])
    half = info["terrainSize"] / 2.0
    # carry user calibration knobs through re-runs
    cfg_extra = {}
    if out_json.exists():
        try:
            old = json.loads(out_json.read_text())
            cfg_extra = {k: old[k] for k in ("overviewSpanFactor",)
                         if k in old}
        except Exception:
            pass
    # FS25 PDA overview images cover SPAN_FACTOR × the terrain size: the
    # playable terrain is the central quarter of the texture and the game's
    # PDA displays only that part (the outer ring is clouds/vignette).
    # Empirically verified on Solek with two world<->readout sample pairs.
    # knob: <id>.json "overviewSpanFactor" (1.0 = whole image is the world).
    span = float(cfg_extra.get("overviewSpanFactor", 2.0))
    vw = size[0] / span
    vh = size[1] / span
    view = {"x": (size[0] - vw) / 2.0, "y": (size[1] - vh) / 2.0,
            "w": vw, "h": vh}
    cfg = {
        "id": map_id,
        "name": meta["mapTitle"] or map_id,
        "image": f"maps/{out_png.name}",
        "headingOffset": 0,
        # world->image mapping knobs (calibrate live if the marker is off):
        #   rotateDeg : extra rotation of the IMAGE (90/180/270 …)
        #   flipX/flipZ : mirror world X / Z before projecting
        # FS25 in-game PDA readout gives world coords + size/2, 0..size;
        # the dashboard arrow position should match the in-game PDA marker.
        "rotateDeg": 0,
        "flipX": False,
        "flipZ": False,
        # knob kept in the output so per-map calibration survives re-runs:
        "overviewSpanFactor": span,
        "projection": {
            "imageWidth": size[0],
            "imageHeight": size[1],
            "view": view,
            "worldMinX": -half,
            "worldMinZ": -half,
            "worldMaxX": half,
            "worldMaxZ": half,
            "terrainSize": info["terrainSize"],
        },
        "_provenance": {
            "savegame": save_name,
            "source": src["source"],
            "dds": src["dds"],
        },
    }
    # only rewrite when changed (keeps the dashboard HTTP cache happy)
    if not out_json.exists() or json.loads(out_json.read_text()) != cfg:
        out_json.write_text(json.dumps(cfg, indent=2) + "\n")

    if not quiet:
        print(f"savegame {save_name}: map {map_id} ({cfg['name']})")
        print(f"  image : {out_png}  <- {src['source']} ({'dds' if src['dds'] else 'png'})")
        print(f"  config: {out_json}  (world ±{half})")
    return cfg


def main():
    import argparse
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--savegame", type=int, default=None,
                   help="savegame number (default: most recently saved)")
    p.add_argument("--map-id", default=None,
                   help="skip savegame detection; force a map id")
    p.add_argument("--games-dir", default=None)
    p.add_argument("--game", default=None,
                   help="FS25 install dir (for basegame maps)")
    args = p.parse_args()
    sync_current_map(
        games_dir=Path(args.games_dir) if args.games_dir else None,
        game_dir=Path(args.game) if args.game else None,
        savegame=args.savegame,
        map_id_arg=args.map_id,
    )


if __name__ == "__main__":
    main()
