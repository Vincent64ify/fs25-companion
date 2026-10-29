"""The web's rig fixtures (specs/0003): spike 0.0.4's rig dumps run through
the mod's own Lua.

Each dump in mod/tests/fixtures/spike0003/ becomes mock game objects
(mod/tests/spike_rigs.lua), the mod's Cab collector reads them as it reads
the game, and its `cab` goes to web/fixtures/rigs/<rig>.json with a
`vehicles` topic made from the same dump (brands and categories, which the
dumps don't have, from the table below) and what the Vehicle page must show
for it (`expect`, checked by web/test.html "rig fixtures").

    python fixtures/rig_fixtures.py          # write the fixtures
    python fixtures/rig_fixtures.py --check  # fail if they're out of date

Needs lupa (pip install lupa), as the mod's tests do.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPIKE = ROOT / "mod" / "tests" / "fixtures" / "spike0003"
OUT = ROOT / "web" / "fixtures" / "rigs"

# what the dumps don't say: each member's shop brand, category and its
# title, the side it hangs on (rear unless named)
SHOP = {
    514: ("Versatile", "tractorsL", "Tractors L"),
    992: ("New Holland", "tractorsM", "Tractors M"),
    994: ("Samasz", "mowers", "Mowers", "front"),
    996: ("Samasz", "mowers", "Mowers"),
    998: ("Case IH", "tractorsS", "Tractors S"),
    1003: ("Farmtech", "trailers", "Trailers"),
    1004: ("Farmtech", "trailers", "Trailers"),
    1031: ("Berthoud", "sprayers", "Sprayers"),
    1033: ("CLAAS", "tractorsM", "Tractors M"),
    1035: ("Versatile", "tractorsM", "Tractors M"),
    1037: ("Pöttinger", "plows", "Plows"),
    1041: ("Göweil", "balers", "Balers"),
    1044: ("Fendt", "weights", "Weights", "front"),
    1051: ("Fliegl", "containerTrailers", "Container trailers"),
    1053: ("Mercedes-Benz Trucks", "trucks", "Trucks"),
}

# what the Vehicle page must show for each rig: the cards in driving order,
# each "model: button:state, ..." (unavailable: the game says not now);
# Also attached, each "line: buttons"; the All row; the plain tractor's
# Attach
EXPECT = {
    "mowers": {
        "cards": ["XT 390: Raise:on, Unfold:off, Turn on:unavailable, Detach:unavailable",
                  "KDF 341 S: Raise:on, Unfold:unavailable, Turn on:unavailable, Detach:off"],
        "selected": "XT 390",
        "also": [],
        "all": ["Unfold all:off", "Raise all:on", "Turn on all:unavailable"],
    },
    "trailers": {
        "cards": ["EDK 650: Tip:off, Tip side:off, Detach:off", "EDK 650: Tip:off, Tip side:off, Detach:off"],
        "selected": "EDK 650",
        "also": [],
        "all": ["Tip all:off"],
    },
    "sprayer": {
        "cards": ["Vantage 4300: Unfold:off, Turn on:unavailable, Detach:off, Dump:off, Dump on ground:off, Unload:off"],
        "selected": "Vantage 4300",
        "also": [],
        "all": [],
    },
    "plow": {
        "cards": ["SERVO T 6000 P: Lower:off, Unfold:off, Rotate:off, Detach:off, Allow create fields:off"],
        "selected": "SERVO T 6000 P",
        "also": [],
        "all": [],
    },
    "baler": {
        "cards": ["G-1 F125 Kombi: Turn on:off, Reset count:off, Detach:off, Turn on automatic drop:off, Lower pickup:off"],
        "selected": "G-1 F125 Kombi",
        "also": [],
        "all": [],
    },
    "weight": {
        "cards": [],
        "selected": None,
        "also": ["3300 · Fendt · Weights · Front · Raised: Lower:off, Detach:off"],
        "all": [],
    },
    "truck": {
        "cards": ["Push-Off Container: Lower:off, Tip:off, Tip side:off, Detach:unavailable",
                  "Arocs 4133 + TECTRUM RS26: Unfold:off"],
        "selected": "Push-Off Container",
        "also": [],
        "all": [],
    },
    "attach": {
        "cards": [],
        "selected": None,
        "also": [],
        "all": [],
        "attach": "available",
    },
}


def fix_name(name):
    """The spike wrote UTF-8 names read as Windows-1252 ("PÃ–TTINGER")."""
    try:
        return name.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def load_dump(rig):
    dump = json.loads((SPIKE / f"{rig}.json").read_text(encoding="utf-8"))
    for m in dump["members"]:
        m["name"] = fix_name(m["name"])
    return dump


def fills_of(member):
    """The fills the vehicles topic sends: the HUD's, empty ones without a fill type."""
    out = []
    for f in member.get("fills") or []:
        if not f.get("showOnHud") or not f.get("capacity"):
            continue
        entry = {"unit": f["unit"], "level": round(f["level"], 1), "capacity": f["capacity"]}
        if f["level"] > 0:
            entry["fillType"] = f["name"].lower()
            entry["fillTitle"] = f["name"].replace("_", " ").title()
        out.append(entry)
    return out


def vehicles_of(dump):
    """The vehicles topic for the rig, its vehicle controlled."""
    def info(m):
        brand, category, title = SHOP[m["id"]][:3]
        out = {"id": m["id"], "name": m["name"], "brand": brand, "category": category, "categoryTitle": title,
               "typeName": m["typeName"], "fills": fills_of(m), "wear": 0.12}
        if isinstance(m.get("workWidth"), (int, float)) and m["workWidth"] > 0:
            out["workWidth"] = round(m["workWidth"], 2)
        if isinstance(m.get("speedLimit"), (int, float)) and m.get("depth", 0) > 0:
            out["speedLimit"] = round(m["speedLimit"], 1)
        return out

    members = dump["members"]
    head = next(m for m in members if m["depth"] == 0)
    vehicle = {**info(head), "speed": 8.4, "engineOn": True, "fuel": 280, "fuelCapacity": 400, "wear": 0.23,
               "motorized": True, "implements": []}
    for m in members:
        if m["depth"] > 0:
            vehicle["implements"].append({**info(m), "depth": m["depth"]})
    return {"controlledId": head["id"], "vehicles": [vehicle]}


def lua_runtime():
    from lupa import LuaRuntime  # pip install lupa
    lua = LuaRuntime()
    for rel in ("src/Json.lua", "src/Geo.lua", "src/Api.lua", "src/VehicleState.lua", "src/collectors/Cab.lua",
                "tests/spike_rigs.lua"):
        lua.execute((ROOT / "mod" / rel).read_text(encoding="utf-8"))
    return lua


def cab_of(lua, dump):
    """The cab the mod sends for this rig, from its mock objects."""
    sides = {i: s[3] for i, s in SHOP.items() if len(s) > 3}
    lua_sides = lua.table_from(sides)
    collect = lua.eval("""function(text, sides)
        local Cab = Companion.Collectors.Cab
        Cab.reset()
        SpikeRigs.rig(SpikeRigs.decode(text), sides)
        return Companion.Json.encode(Cab.collect({}))
    end""")
    return json.loads(collect(json.dumps(dump), lua_sides))


def fixtures():
    lua = lua_runtime()
    out = {}
    for rig, expect in EXPECT.items():
        dump = load_dump(rig)
        out[rig] = {
            "rig": rig,
            "source": f"mod/tests/fixtures/spike0003/{rig}.json, through the mod's Cab collector",
            "cab": cab_of(lua, dump),
            "vehicles": vehicles_of(dump),
            "expect": expect,
        }
    return out


def text_of(fixture):
    return json.dumps(fixture, indent=1, ensure_ascii=False) + "\n"


def main(argv):
    check = "--check" in argv
    stale = []
    OUT.mkdir(parents=True, exist_ok=True)
    for rig, fixture in fixtures().items():
        path = OUT / f"{rig}.json"
        text = text_of(fixture)
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(path.name)
        else:
            path.write_text(text, encoding="utf-8", newline="\n")
            print("wrote", path.relative_to(ROOT))
    if stale:
        print("out of date:", ", ".join(stale), "(python fixtures/rig_fixtures.py)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
