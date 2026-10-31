"""Map assets: the overview image of the map being played, for the dashboard.

When the mod's ``hello`` names a map, the companion:

1. finds the map XML from ``hello.mapDir`` + ``hello.mapXmlFilename`` (paths
   the game itself reports), falling back to a lookup by map id in the
   profile's mods/ folder or the game install's data/maps;
2. reads the PDA overview image named by the XML's ``imageFilename``
   (DDS first: the game ships .dds even when the XML says .png);
3. converts it to PNG, plus a 2048 px variant for phones, and writes
   ``meta.json`` with the world rectangle the image covers;
4. keeps them in the cache under ``<mapId>/<hash>/``, where the server
   serves them as ``/api/maps/<mapId>/<hash>/<name>``, and tells the
   viewers which hash is the map's (``map_assets``).

Mod maps can be zipped: GIANTS reports a zipped mod's folder as if it were
unpacked (``.../mods/FS25_Solek/``), so every read also looks inside
``<folder>.zip``.

Paid DLC maps (map id ``pdlc_<pack>.<map>``) are the exception: they live in
an encrypted ``<game>/pdlc/<pack>.dlc`` archive that only the game can read,
so they get no image and the dashboard draws its plain map.

Everything stays in world meters. The one transform, placing the image, uses
the PDA's own values from ``hello.ingameMap``:

    u = (x + worldCenterOffsetX) / worldSizeX * mapExtensionScaleFactor
        + mapExtensionOffsetX

so the image's left edge (u = 0) and right edge (u = 1) are world X

    (0 - offset) / scale * worldSize - centerOffset
    (1 - offset) / scale * worldSize - centerOffset

and the same for Z. FS25 uses scale 0.5 and offset 0.25: the image covers
twice the terrain and the playable area is its central half.

Debug from the command line:

    python -m companion.map_assets --map-id FS25_Solek.SampleModMap
"""

import asyncio
import hashlib
import io
import json
import logging
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Tuple

log = logging.getLogger("companion.map_assets")

META_VERSION = 1
OVERVIEW = "overview.png"
OVERVIEW_SMALL = "overview_2048.png"
META = "meta.json"
SMALL_SIZE = 2048

# when hello has no ingameMap values: the image covers twice the terrain
DEFAULT_EXTENSION_SCALE = 0.5
DEFAULT_TERRAIN_SIZE = 2048.0

# last resort for base-game maps when the mod could not report the install
DEFAULT_GAME_INSTALLS = [
    Path(r"C:\Program Files (x86)\Steam\steamapps\common\Farming Simulator 25"),
    Path(r"C:\Program Files\Steam\steamapps\common\Farming Simulator 25"),
    Path(r"D:\SteamLibrary\steamapps\common\Farming Simulator 25"),
    Path.home() / "Library/Application Support/Steam/steamapps/common/Farming Simulator 25",
]

Bounds = Tuple[float, float, float, float]  # minX, minZ, maxX, maxZ


class MapAssetError(Exception):
    """The map's overview image can't be found or read. Not fatal: the
    dashboard then shows a plain background under the vector layers."""


# --- reading game files ------------------------------------------------------

def read_file(path: Path) -> Optional[bytes]:
    """Bytes of ``path``, looking inside a zipped mod when a folder on the
    way is really ``<folder>.zip``. None when it doesn't exist."""
    path = Path(path)
    try:
        if path.is_file():
            return path.read_bytes()
    except OSError:
        return None
    # walk up: .../mods/FS25_Solek/map/overview.dds -> mods/FS25_Solek.zip + map/overview.dds
    inner = PurePosixPath(path.name)
    for parent in path.parents:
        archive = parent.with_name(parent.name + ".zip") if parent.name else None
        if archive is not None and archive.is_file():
            try:
                with zipfile.ZipFile(archive) as z:
                    return z.read(str(inner))
            except (KeyError, zipfile.BadZipFile, OSError):
                return None
        if not parent.name:
            break
        inner = PurePosixPath(parent.name) / inner
    return None


def resolve(ref: str, base_dir: Optional[Path], game_dir: Optional[Path]) -> Optional[Path]:
    """A path as GIANTS writes it: ``$data/...`` (game install), absolute,
    or relative to the map's base directory."""
    ref = ref.replace("\\", "/")
    if ref.startswith("$data/") or ref.startswith("$dataS/"):
        if game_dir is None:
            return None
        return Path(game_dir) / "data" / ref.split("/", 1)[1]
    p = Path(ref)
    if p.is_absolute():
        return p
    if base_dir is None:
        return None
    return Path(base_dir) / ref


@dataclass
class MapLocation:
    xml_path: Path
    base_dir: Optional[Path]
    game_dir: Optional[Path]
    how: str


def _mod_map_xml(desc_bytes: bytes, mod_name: str, map_id: str) -> Optional[str]:
    desc = ET.fromstring(desc_bytes.decode("utf-8-sig"))
    maps = desc.findall("./maps/map")
    for m in maps:
        if f"{mod_name}.{m.attrib.get('id')}" == map_id and "configFilename" in m.attrib:
            return m.attrib["configFilename"]
    return next((m.attrib["configFilename"] for m in maps if "configFilename" in m.attrib), None)


def candidate_game_dirs(hello: Dict[str, Any]) -> List[Path]:
    out = [Path(hello["gameDir"])] if hello.get("gameDir") else []
    out += [p for p in DEFAULT_GAME_INSTALLS if p not in out]
    return out


def is_paid_dlc(hello: Dict[str, Any]) -> bool:
    return (hello.get("mapId") or "").startswith("pdlc_")


def locate_map(hello: Dict[str, Any], profile_dir: Optional[Path] = None) -> MapLocation:
    """Where the map XML is: from the paths in hello, else by map id."""
    game_dirs = candidate_game_dirs(hello)
    game_dir = next((g for g in game_dirs if g.is_dir()), None)

    map_dir, xml_name = hello.get("mapDir"), hello.get("mapXmlFilename")
    if xml_name:
        base = Path(map_dir) if map_dir else None
        xml_path = resolve(xml_name, base, game_dir)
        if xml_path is not None and read_file(xml_path) is not None:
            return MapLocation(xml_path, base, game_dir, "hello")

    map_id = hello.get("mapId") or ""
    profile = profile_dir or hello.get("profileDir")
    profile_dir = Path(profile) if profile else None
    if map_id and profile_dir is not None:
        mod_name = map_id.split(".", 1)[0]
        mod_dir = profile_dir / "mods" / mod_name
        desc = read_file(mod_dir / "modDesc.xml")
        if desc is not None:
            rel = _mod_map_xml(desc, mod_name, map_id)
            if rel:
                return MapLocation(mod_dir / rel, mod_dir, game_dir, "mods folder")

    if map_id:
        stem = map_id.rsplit("/", 1)[-1].lower().removesuffix(".xml")
        for g in game_dirs:
            for xml in sorted((g / "data" / "maps").glob("map*/map*.xml")):
                if xml.stem.lower() == stem:
                    return MapLocation(xml, xml.parent, g, "game install")

    raise MapAssetError(
        f"map {map_id!r}: map XML not found (mapDir={map_dir!r}, "
        f"mapXmlFilename={xml_name!r}, profile={profile_dir})")


def read_overview(loc: MapLocation) -> Tuple[bytes, str, Optional[float]]:
    """(image bytes, where they came from, terrain width from the XML)."""
    data = read_file(loc.xml_path)
    if data is None:
        raise MapAssetError(f"can't read {loc.xml_path}")
    node = ET.fromstring(data.decode("utf-8-sig"))
    image = node.attrib.get("imageFilename", "")
    if not image:
        raise MapAssetError(f"{loc.xml_path} has no imageFilename")
    try:
        width = float(node.attrib.get("width", "0")) or None
    except ValueError:
        width = None

    stem = image.rsplit(".", 1)[0]
    names = list(dict.fromkeys([stem + ".dds", image, stem + ".png"]))
    bases = list(dict.fromkeys(b for b in (loc.base_dir, loc.xml_path.parent) if b is not None))
    for name in names:
        for base in bases:
            path = resolve(name, base, loc.game_dir)
            if path is None:
                continue
            blob = read_file(path)
            if blob:
                return blob, str(path), width
    raise MapAssetError(f"overview image {image!r} not found next to {loc.xml_path}")


# --- placement ---------------------------------------------------------------

def _num(d: Dict[str, Any], key: str) -> Optional[float]:
    v = d.get(key)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def placement(hello: Dict[str, Any], xml_width: Optional[float] = None) -> Dict[str, Any]:
    """World rectangles of the whole image and of the playable terrain."""
    im = hello.get("ingameMap") or {}
    terrain = _num(hello, "terrainSize") or xml_width or DEFAULT_TERRAIN_SIZE

    def axis(suffix: str) -> Tuple[float, float, float, float]:
        size = _num(im, "worldSize" + suffix) or terrain
        center = _num(im, "worldCenterOffset" + suffix)
        center = size / 2 if center is None else center
        scale = _num(im, "mapExtensionScaleFactor") or DEFAULT_EXTENSION_SCALE
        offset = _num(im, "mapExtensionOffset" + suffix)
        offset = (1 - scale) / 2 if offset is None else offset
        img_min = (0 - offset) / scale * size - center
        img_max = (1 - offset) / scale * size - center
        return img_min, img_max, -center, size - center

    x0, x1, px0, px1 = axis("X")
    z0, z1, pz0, pz1 = axis("Z")
    r = lambda v: round(v, 3)  # noqa: E731
    return {
        "terrainSize": terrain,
        "imageBounds": [r(x0), r(z0), r(x1), r(z1)],
        "playableBounds": [r(px0), r(pz0), r(px1), r(pz1)],
    }


# --- conversion --------------------------------------------------------------

@dataclass
class PreparedMap:
    map_id: str
    digest: str
    files: Dict[str, Path] = field(default_factory=dict)
    meta: Dict[str, Any] = field(default_factory=dict)


def _to_png(blob: bytes) -> Tuple[bytes, bytes, Tuple[int, int]]:
    try:
        from PIL import Image
    except ImportError as e:
        raise MapAssetError("Pillow is needed for map images: pip install Pillow") from e
    try:
        img = Image.open(io.BytesIO(blob))
        img.load()
    except Exception as e:
        raise MapAssetError(f"can't decode the overview image ({e})") from e
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    full = io.BytesIO()
    img.save(full, format="PNG", compress_level=6)
    small = img
    if max(img.size) > SMALL_SIZE:
        small = img.resize((SMALL_SIZE, round(img.size[1] * SMALL_SIZE / img.size[0])),
                           Image.Resampling.LANCZOS)
    small_buf = io.BytesIO()
    small.save(small_buf, format="PNG", compress_level=6)
    return full.getvalue(), small_buf.getvalue(), img.size


def prepare(hello: Dict[str, Any], cache_dir: Path,
            profile_dir: Optional[Path] = None) -> PreparedMap:
    """Find, convert and cache the map's assets. Raises MapAssetError."""
    map_id = hello.get("mapId")
    if not map_id:
        raise MapAssetError("hello has no mapId")
    if is_paid_dlc(hello):
        raise MapAssetError(f"{map_id} is a paid DLC map: its files are encrypted, "
                            "the dashboard draws a plain map")
    loc = locate_map(hello, profile_dir)
    blob, source, xml_width = read_overview(loc)
    place = placement(hello, xml_width)
    meta_inputs = {"v": META_VERSION, "mapId": map_id, **place}
    digest = hashlib.sha256(
        blob + json.dumps(meta_inputs, sort_keys=True).encode()).hexdigest()[:20]

    out = Path(cache_dir) / safe_segment(map_id) / digest
    files = {name: out / name for name in (OVERVIEW, OVERVIEW_SMALL, META)}
    if all(p.is_file() for p in files.values()):
        meta = json.loads(files[META].read_text(encoding="utf-8"))
        log.info("map %s: cached assets %s", map_id, digest)
        return PreparedMap(map_id, digest, files, meta)

    log.info("map %s: converting %s (via %s)", map_id, source, loc.how)
    full, small, size = _to_png(blob)
    meta = {
        **meta_inputs,
        "title": hello.get("mapTitle") or map_id,
        "imageWidth": size[0],
        "imageHeight": size[1],
        "images": {OVERVIEW: size[0], OVERVIEW_SMALL: min(size[0], SMALL_SIZE)},
        "source": source,
    }
    out.mkdir(parents=True, exist_ok=True)
    for name, data in ((OVERVIEW, full), (OVERVIEW_SMALL, small),
                       (META, json.dumps(meta, indent=2).encode())):
        tmp = files[name].with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(files[name])
    return PreparedMap(map_id, digest, files, meta)


def safe_segment(text: str) -> str:
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in text).lstrip(".") or "_"


# --- serving ---------------------------------------------------------------

MAP_ID_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\-]{0,127}$")
HASH_RE = re.compile(r"^[0-9a-f]{16,64}$")
FILE_TYPES = {OVERVIEW: "image/png", OVERVIEW_SMALL: "image/png", META: "application/json"}


def cached_file(cache_dir: Path, map_id: str, digest: str, name: str) -> Optional[Path]:
    """The cached file the dashboard asks for at
    /api/maps/<mapId>/<hash>/<name>, or None."""
    if not (MAP_ID_RE.match(map_id) and HASH_RE.match(digest)) or name not in FILE_TYPES:
        return None
    path = Path(cache_dir) / safe_segment(map_id) / digest / name
    return path if path.is_file() else None


class MapPublisher:
    """Prepares the assets of each map named by a hello and announces them:
    ``announce(map_id, digest)`` (async) once the files are in the cache."""

    def __init__(self, announce: Callable[[str, str], Awaitable[None]], cache_dir: Path,
                 profile_dir: Optional[Path] = None):
        self.announce = announce
        self.cache_dir = Path(cache_dir)
        self.profile_dir = profile_dir
        self._map_id: Optional[str] = None
        self._tasks: set = set()

    def on_hello(self, hello: Dict[str, Any]) -> None:
        map_id = hello.get("mapId")
        if not map_id or map_id == self._map_id:
            return
        self._map_id = map_id
        task = asyncio.get_running_loop().create_task(self._prepare(dict(hello)))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _prepare(self, hello: Dict[str, Any]) -> None:
        try:
            prepared = await asyncio.to_thread(prepare, hello, self.cache_dir, self.profile_dir)
        except MapAssetError as e:
            log.warning("no map image for the dashboard: %s", e)
            return
        except Exception:
            log.warning("map %s: preparing the image failed", hello.get("mapId"), exc_info=True)
            return
        if prepared.map_id != self._map_id:
            return  # another map loaded meanwhile
        await self.announce(prepared.map_id, prepared.digest)


def _main(argv: Optional[Iterable[str]] = None) -> None:
    import argparse

    from . import paths

    p = argparse.ArgumentParser(description="convert one map's overview image (debugging)")
    p.add_argument("--map-id", required=True)
    p.add_argument("--map-dir", default=None)
    p.add_argument("--map-xml", default=None)
    p.add_argument("--game-dir", default=None)
    p.add_argument("--profile-dir", type=Path, default=None)
    p.add_argument("--out", type=Path, default=None, help="cache folder (default: the companion's)")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    hello = {"mapId": args.map_id, "mapDir": args.map_dir,
             "mapXmlFilename": args.map_xml, "gameDir": args.game_dir}
    prepared = prepare(hello, args.out or paths.cache_dir() / "maps",
                       args.profile_dir or paths.find_profile_dir())
    print(json.dumps(prepared.meta, indent=2))
    for name, path in prepared.files.items():
        print(f"{name}: {path}")


if __name__ == "__main__":
    _main()
