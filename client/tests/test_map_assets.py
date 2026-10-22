import json
import struct
import zipfile

import pytest

import map_assets
from map_assets import (MapAssetError, PreparedMap, http_base, locate_map, placement,
                        prepare, read_file)

PIL = pytest.importorskip("PIL")

SOLEK_INGAME_MAP = {
    "worldSizeX": 2048, "worldSizeZ": 2048,
    "worldCenterOffsetX": 1024, "worldCenterOffsetZ": 1024,
    "mapExtensionScaleFactor": 0.5,
    "mapExtensionOffsetX": 0.25, "mapExtensionOffsetZ": 0.25,
}

MOD_DESC = """<?xml version="1.0" encoding="utf-8"?>
<modDesc><maps>
  <map id="TestMap" configFilename="map/map.xml" />
</maps></modDesc>"""

MAP_XML = '<map width="2048" height="2048" imageFilename="{image}" />'


def dds(width, height, rgba=(200, 100, 50, 255)):
    """An uncompressed 32-bit DDS, as the game ships its overview images
    (theirs are BC-compressed, which Pillow decodes the same way)."""
    pixel_format = struct.pack("<II4sI4I", 32, 0x41, b"\0\0\0\0", 32,
                               0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000)
    header = struct.pack("<7I44x", 124, 0x100F, height, width, width * 4, 0, 0)
    header += pixel_format + struct.pack("<5I", 0x1000, 0, 0, 0, 0)
    r, g, b, a = rgba
    return b"DDS " + header + bytes([b, g, r, a]) * (width * height)


@pytest.fixture
def zipped_mod(tmp_path):
    """profile/mods/FS25_Test.zip with a map whose XML names a .png that is
    really shipped as .dds."""
    mods = tmp_path / "profile" / "mods"
    mods.mkdir(parents=True)
    with zipfile.ZipFile(mods / "FS25_Test.zip", "w") as z:
        z.writestr("modDesc.xml", MOD_DESC)
        z.writestr("map/map.xml", MAP_XML.format(image="map/overview.png"))
        z.writestr("map/overview.dds", dds(16, 16))
    return tmp_path / "profile"


def hello_for(profile, **extra):
    return {"mapId": "FS25_Test.TestMap", "mapTitle": "Test", "terrainSize": 2048,
            "ingameMap": SOLEK_INGAME_MAP, **extra}


def test_placement_uses_the_pda_values():
    place = placement({"terrainSize": 2048, "ingameMap": SOLEK_INGAME_MAP})
    # the image covers twice the terrain; the terrain is its central half
    assert place["imageBounds"] == [-2048, -2048, 2048, 2048]
    assert place["playableBounds"] == [-1024, -1024, 1024, 1024]


def test_placement_without_ingame_map_defaults_to_twice_the_terrain():
    place = placement({"terrainSize": 4096})
    assert place["imageBounds"] == [-4096, -4096, 4096, 4096]
    assert place["playableBounds"] == [-2048, -2048, 2048, 2048]


def test_placement_with_an_off_centre_extension():
    im = dict(SOLEK_INGAME_MAP, mapExtensionOffsetX=0.0, mapExtensionScaleFactor=1.0)
    place = placement({"terrainSize": 2048, "ingameMap": im})
    assert place["imageBounds"][0] == -1024 and place["imageBounds"][2] == 1024


def test_read_file_looks_inside_a_zipped_mod(zipped_mod):
    # GIANTS reports a zipped mod as if it were a folder
    assert read_file(zipped_mod / "mods" / "FS25_Test" / "modDesc.xml").startswith(b"<?xml")
    assert read_file(zipped_mod / "mods" / "FS25_Test" / "map" / "overview.dds")[:4] == b"DDS "
    assert read_file(zipped_mod / "mods" / "FS25_Test" / "missing.xml") is None
    assert read_file(zipped_mod / "mods" / "Nope" / "x.xml") is None


def test_locate_from_hello_paths(zipped_mod):
    hello = hello_for(zipped_mod, mapDir=str(zipped_mod / "mods" / "FS25_Test") + "/",
                      mapXmlFilename="map/map.xml")
    assert locate_map(hello).how == "hello"


def test_locate_by_map_id_in_the_mods_folder(zipped_mod):
    # a replayed recording has no paths of this machine
    loc = locate_map(hello_for(zipped_mod), profile_dir=zipped_mod)
    assert loc.how == "mods folder"
    assert loc.xml_path.name == "map.xml"


def test_locate_base_game_map_from_game_dir(tmp_path):
    maps = tmp_path / "game" / "data" / "maps" / "mapUS"
    maps.mkdir(parents=True)
    (maps / "mapUS.xml").write_text(MAP_XML.format(image="$data/maps/mapUS/overview.png"))
    (maps / "overview.dds").write_bytes(dds(8, 8))
    hello = {"mapId": "MapUS", "terrainSize": 2048, "gameDir": str(tmp_path / "game"),
             "mapDir": "", "mapXmlFilename": "$data/maps/mapUS/mapUS.xml"}
    prepared = prepare(hello, tmp_path / "cache")
    assert prepared.meta["imageWidth"] == 8
    assert prepared.meta["source"].endswith("overview.dds")


def test_locate_failure_is_a_map_asset_error(tmp_path):
    with pytest.raises(MapAssetError):
        locate_map({"mapId": "FS25_Nope.Map"}, profile_dir=tmp_path)


def test_prepare_skips_paid_dlc_maps(tmp_path):
    hello = {"mapId": "pdlc_highlandsFishingPack.HighlandsFishingMap",
             "mapDir": str(tmp_path / "pdlc" / "highlandsFishingPack"),
             "mapXmlFilename": "map/map.xml"}
    with pytest.raises(MapAssetError, match="paid DLC"):
        prepare(hello, tmp_path / "cache")


def test_prepare_converts_and_caches(zipped_mod, tmp_path, monkeypatch):
    monkeypatch.setattr(map_assets, "SMALL_SIZE", 8)
    cache = tmp_path / "cache"
    prepared = prepare(hello_for(zipped_mod), cache, profile_dir=zipped_mod)
    assert prepared.map_id == "FS25_Test.TestMap"
    from PIL import Image
    with Image.open(prepared.files["overview.png"]) as img:
        assert img.size == (16, 16)
        assert img.getpixel((0, 0))[:3] == (200, 100, 50)
    with Image.open(prepared.files["overview_2048.png"]) as img:
        assert img.size == (8, 8)
    meta = json.loads(prepared.files["meta.json"].read_text())
    assert meta["imageBounds"] == [-2048, -2048, 2048, 2048]
    assert meta["imageWidth"] == 16
    assert meta["title"] == "Test"

    # second run: no conversion
    monkeypatch.setattr(map_assets, "_to_png", lambda blob: pytest.fail("converted again"))
    again = prepare(hello_for(zipped_mod), cache, profile_dir=zipped_mod)
    assert again.digest == prepared.digest

    # other PDA values place the image differently: a new hash
    moved = hello_for(zipped_mod, ingameMap=dict(SOLEK_INGAME_MAP, mapExtensionOffsetX=0.2))
    monkeypatch.undo()
    assert prepare(moved, cache, profile_dir=zipped_mod).digest != prepared.digest


def test_http_base():
    assert http_base("ws://127.0.0.1:8123") == "http://127.0.0.1:8123"
    assert http_base("wss://relay.example.com/") == "https://relay.example.com"
    assert http_base("wss://relay.example.com/fs/ws?pair=1") == "https://relay.example.com/fs"


def test_upload_skips_what_the_backend_has(tmp_path, monkeypatch):
    files = {}
    for name in ("overview.png", "overview_2048.png", "meta.json"):
        files[name] = tmp_path / name
        files[name].write_bytes(b"{}")
    prepared = PreparedMap("FS25_Test.TestMap", "0123456789abcdef0123", files)
    calls = []

    class Response:
        def close(self):
            pass

    def urlopen(req, timeout):
        calls.append((req.get_method(), req.full_url, req.get_header("Authorization")))
        if req.get_method() == "HEAD" and not have_meta:
            raise map_assets.urllib.error.HTTPError(req.full_url, 404, "", {}, None)
        return Response()

    monkeypatch.setattr(map_assets.urllib.request, "urlopen", urlopen)
    have_meta = False
    assert map_assets.upload(prepared, "http://h", "tok") is True
    assert [c[0] for c in calls] == ["HEAD", "PUT", "PUT", "PUT"]
    assert calls[-1][1] == "http://h/api/maps/FS25_Test.TestMap/0123456789abcdef0123/meta.json"
    assert calls[1][2] == "Bearer tok"

    calls.clear()
    have_meta = True
    assert map_assets.upload(prepared, "http://h", "tok") is False
    assert [c[0] for c in calls] == ["HEAD"]
