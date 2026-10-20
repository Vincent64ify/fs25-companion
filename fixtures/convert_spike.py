#!/usr/bin/env python3
"""Convert the Phase 0 recordings into a protocol v1 fixture.

    python fixtures/convert_spike.py fixtures/spike_solek_pose.ndjson \\
        fixtures/spike_solek_pda.json fixtures/solek_farmlands.json \\
        fixtures/solek_v1.ndjson

The spike recorded real positions on Solek at 5 Hz (on foot and in a
tractor), and its report listed the PDA hotspots and the farm's vehicles
(spike_solek_pda.json, see extract_spike_report.py). This rewrites them as
the v1 topics the mod sends:

* ``hello`` once, with the Solek map values verified in Phase 0
* ``player`` for every sample. In the vehicle, the vehicle's pose and its
  verified heading. On foot, the spike's heading is the constant 180 deg of
  the non-rotating root node, so the heading is derived from the movement
  between samples instead (kept when standing still).
* ``vehicles`` every other sample: the four vehicles of the report. The
  recording's tractor started where the report saw the Volvo L90H, so that
  one follows the recorded vehicle pose and is parked where the drive ends.
  The others stay where the report saw them. A vehicle without an engine
  within 6 m of one with an engine counts as hitched to it. Parked
  headings are synthetic (the report has none).
* ``hotspots``, ``farmlands`` and ``fields`` every 60 s of game time. The
  hotspots are the report's, minus the categories the mod leaves out.
* ``farmlands`` and ``farmland_grid`` (once, after hello) are real: the
  last ones of a live Phase 3 session on Solek (solek_farmlands.json, see
  extract_stream.py).
* ``crop_types`` once. SYNTHETIC: the base-game crops with made-up indices
  and colours, ground type names guessed to fit the two values the spike
  saw (sown = 7, the first field's grass = 13), and the real soil levels.
* ``field_outlines`` once. SYNTHETIC: the report has the 162 fields'
  positions but no outlines, so each field is a rectangle (one corner cut)
  grown from its position inside its real farmland, 4 m off the border.
* ``fields``: real positions and farmlands. The first field's state is
  the real one; the others are made up, seeded by the field id.
* ``env`` every 5th sample. These values are synthetic (the spike didn't
  record time or weather): the clock starts at 08:00 on day 1 and follows
  the recorded game time.

Until a real v1 session is recorded, this file is the replay fixture.
"""

import json
import math
import random
import sys

HELLO = {
    "protocolVersion": 1,
    "modVersion": "fixture",
    "sessionId": "fixture-solek",
    "platform": "windows",
    "mapId": "FS25_Solek.SampleModMap",
    "mapTitle": "Solek",
    "isModMap": True,
    "isMultiplayer": False,
    "terrainSize": 2048,
    "ingameMap": {
        "worldSizeX": 2048, "worldSizeZ": 2048,
        "worldCenterOffsetX": 1024, "worldCenterOffsetZ": 1024,
        "mapExtensionScaleFactor": 0.5,
        "mapExtensionOffsetX": 0.25, "mapExtensionOffsetZ": 0.25,
    },
    "farmId": 1,
}
MIN_MOVE_M = 0.2
HITCH_M = 6.0
PARKED_HEADING = 200.0
# the mod sends hotspots and farmlands every 10 s, fields every 15 s; every
# 60 s keeps the fixture small
PDA_INTERVAL_MS = 60000

# the categories Hotspots.lua leaves out (fields, vehicles, AI, player)
SKIPPED_CATEGORIES = {1, 5, 6, 7, 8, 14, 15}

# synthetic fields: rectangles of farmland_grid cells, this many cells off
# the farmland border and off each other
FIELD_MARGIN_CELLS = 1
MAX_FIELD_CELLS = 120

# synthetic crop types: index, name, title, PDA colour (sRGB), growth
# states. Grass is 31 like Solek's first field; the rest is made up.
CROPS = [
    (1, "WHEAT", "Wheat", "#d8b44a", 8),
    (2, "BARLEY", "Barley", "#c9a061", 7),
    (3, "OAT", "Oat", "#e3d49b", 5),
    (4, "CANOLA", "Canola", "#efe03a", 9),
    (5, "SORGHUM", "Sorghum", "#b8582f", 5),
    (6, "SUNFLOWER", "Sunflower", "#f6c21b", 8),
    (7, "SOYBEAN", "Soybean", "#9db53e", 7),
    (8, "MAIZE", "Maize", "#e59a3a", 7),
    (9, "POTATO", "Potato", "#b5784a", 6),
    (10, "SUGARBEET", "Sugar beet", "#c75d7b", 6),
    (31, "GRASS", "Grass", "#5aa632", 8),
]
GRASS = 31
GROUND_TYPES = {
    "NONE": 0, "STUBBLE_TILLAGE": 1, "CULTIVATED": 2, "SEEDBED": 3, "ROLLED_SEEDBED": 4,
    "ROLLER_LINES": 5, "PLOWED": 6, "SOWN": 7, "DIRECT_SOWN": 8, "PLANTED": 9, "RIDGE": 10,
    "RIDGE_SOWN": 11, "HARVEST_READY": 12, "GRASS": 13, "GRASS_CUT": 14,
}
# the field manager's real values (Phase 0)
LEVELS = {"lime": 3, "plow": 1, "spray": 2}


def round_heading(h: float) -> float:
    return round(h, 1) % 360


def heading(dx: float, dz: float) -> float:
    return round_heading((math.degrees(math.atan2(dx, -dz)) + 360) % 360)


def hotspots_topic(pda: dict) -> dict:
    out = []
    for h in pda["hotspots"]:
        if h["category"] in SKIPPED_CATEGORIES:
            continue
        entry = {"category": h["category"], "x": round(h["x"], 1), "z": round(h["z"], 1),
                 "farmId": h["farmId"], "visible": h["visible"]}
        if h.get("name"):
            entry["name"] = h["name"]
        out.append(entry)
    out.sort(key=lambda e: (e["category"], e["x"], e["z"]))
    return {"hotspots": out}


def linear(hex_colour: str) -> list:
    """sRGB hex -> linear 0..1, how the game stores its map colours."""
    out = []
    for i in (1, 3, 5):
        c = int(hex_colour[i:i + 2], 16) / 255
        out.append(round(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4, 4))
    return out


def crop_types_topic() -> dict:
    fruits = []
    for index, name, title, colour, states in CROPS:
        fruits.append({
            "index": index, "name": name, "title": title,
            "color": linear(colour), "colorBlindColor": linear(colour),
            "numGrowthStates": states, "minHarvest": states, "maxHarvest": states,
            "withered": states + 1, "cut": states + 2, "minPrepare": -1, "maxPrepare": -1,
            "regrows": index == GRASS, "shownOnMap": True,
            "stateNames": {"1": "invisible", str(states): "harvestReady",
                           str(states + 1): "withered", str(states + 2): "cut"},
        })
    return {"fruits": fruits, "groundTypes": GROUND_TYPES, "levels": LEVELS}


def decode_grid(grid: dict) -> list:
    cells = []
    runs = grid["runs"]
    for i in range(0, len(runs), 2):
        cells += [runs[i]] * runs[i + 1]
    return cells


def grow_rectangle(cols: int, rows: int, col: int, row: int, ok) -> tuple:
    """A rectangle of ok cells around (col, row), grown one side at a time
    while the new strip is all ok. Returns (c0, r0, c1, r1), inclusive."""
    c0 = c1 = col
    r0 = r1 = row
    grown = True
    while grown and max(c1 - c0, r1 - r0) < MAX_FIELD_CELLS:
        grown = False
        if c0 > 0 and all(ok(c0 - 1, r) for r in range(r0, r1 + 1)):
            c0, grown = c0 - 1, True
        if c1 < cols - 1 and all(ok(c1 + 1, r) for r in range(r0, r1 + 1)):
            c1, grown = c1 + 1, True
        if r0 > 0 and all(ok(c, r0 - 1) for c in range(c0, c1 + 1)):
            r0, grown = r0 - 1, True
        if r1 < rows - 1 and all(ok(c, r1 + 1) for c in range(c0, c1 + 1)):
            r1, grown = r1 + 1, True
    return c0, r0, c1, r1


def field_outlines_topic(pda: dict, grid: dict) -> tuple:
    """(field_outlines data, area in ha per field id)"""
    cols, rows, cell = grid["cols"], grid["rows"], grid["cell"]
    ox, oz = grid["originX"], grid["originZ"]
    cells = decode_grid(grid)
    claimed = set()
    out, areas = [], {}
    m = FIELD_MARGIN_CELLS
    for f in sorted(pda["fields"], key=lambda f: f["id"]):
        col, row = int((f["x"] - ox) // cell), int((f["z"] - oz) // cell)
        if not (0 <= col < cols and 0 <= row < rows):
            continue
        farmland = cells[row * cols + col]

        def ok(c, r):
            if (c, r) in claimed:
                return False
            for cc in range(c - m, c + m + 1):
                for rr in range(r - m, r + m + 1):
                    if not (0 <= cc < cols and 0 <= rr < rows) or cells[rr * cols + cc] != farmland:
                        return False
            return True

        if farmland == 0 or not ok(col, row):
            continue
        c0, r0, c1, r1 = grow_rectangle(cols, rows, col, row, ok)
        if (c1 - c0 + 1) * (r1 - r0 + 1) < 4:
            continue
        claimed.update((c, r) for c in range(c0 - m, c1 + m + 1) for r in range(r0 - m, r1 + m + 1))
        x0, z0 = ox + c0 * cell, oz + r0 * cell
        x1, z1 = ox + (c1 + 1) * cell, oz + (r1 + 1) * cell
        cut = min(x1 - x0, z1 - z0) / 4
        points = [x0, z0, x1, z0, x1, z1 - cut, x1 - cut, z1, x0, z1]
        out.append({"id": f["id"], "points": [round(p, 1) for p in points]})
        areas[f["id"]] = round(((x1 - x0) * (z1 - z0) - cut * cut / 2) / 10000, 2)
    return {"fields": out}, areas


def synthetic_state(rnd: random.Random) -> dict:
    state = {
        "sprayLevel": rnd.randint(0, LEVELS["spray"]), "sprayType": 1,
        "limeLevel": rnd.choice([0, 1, 2, 3, 3]), "plowLevel": rnd.choice([0, 1, 1]),
        "rollerLevel": 0, "stubbleShredLevel": 0,
        "weedState": rnd.choice([0, 0, 0, 1, 2, 4]), "stoneLevel": rnd.randint(0, 2),
    }
    roll = rnd.random()
    if roll < 0.15:
        ground = rnd.choice(["PLOWED", "CULTIVATED", "STUBBLE_TILLAGE", "SEEDBED"])
        state.update(fruitTypeIndex=0, growthState=0, groundType=GROUND_TYPES[ground])
        return state
    index, _, _, _, states = rnd.choice(CROPS + [CROPS[-1]] * 2)
    if roll < 0.25:
        growth = states + 2  # harvested
    elif roll < 0.28:
        growth = states + 1  # withered
    elif roll < 0.48:
        growth = states  # ready
    else:
        growth = rnd.randint(1, states - 1)
    if index == GRASS:
        ground = "GRASS"
    else:
        ground = "HARVEST_READY" if growth == states else "SOWN"
    state.update(fruitTypeIndex=index, growthState=growth, groundType=GROUND_TYPES[ground])
    return state


def fields_topic(pda: dict, areas: dict) -> dict:
    first = pda["fields"][0]["id"]
    out = []
    for f in sorted(pda["fields"], key=lambda f: f["id"]):
        entry = {"id": f["id"], "farmlandId": f["farmlandId"], "x": round(f["x"], 1),
                 "z": round(f["z"], 1)}
        if f["id"] in areas:
            entry["areaHa"] = areas[f["id"]]
        if f["id"] == first:
            entry["areaHa"] = pda["firstField"]["areaHa"]
            state = pda["firstField"]["fieldState"]
            entry.update({k: v for k, v in state.items() if k not in (
                "farmlandId", "lastGrowthState", "ownerFarmId", "waterLevel", "weedFactor")})
        else:
            entry.update(synthetic_state(random.Random(f["id"])))
        out.append(entry)
    return {"fields": out}


class Fleet:
    """The report's vehicles; the one nearest the first driven pose is driven."""

    def __init__(self, pda: dict, first_drive):
        self.vehicles = {v["id"]: dict(v) for v in pda["vehicles"]}
        for v in self.vehicles.values():
            v["heading"] = PARKED_HEADING
            v["attached"] = False
        self.driven = min(self.vehicles.values(), key=lambda v: math.hypot(
            v["x"] - first_drive[0], v["z"] - first_drive[1]))["id"]
        engines = [v for v in self.vehicles.values() if v["motorized"]]
        self.hitched = {}
        for v in self.vehicles.values():
            if v["motorized"] or not engines:
                continue
            tug = min(engines, key=lambda e: math.hypot(e["x"] - v["x"], e["z"] - v["z"]))
            if math.hypot(tug["x"] - v["x"], tug["z"] - v["z"]) <= HITCH_M:
                v["attached"] = True
                self.hitched[v["id"]] = tug["id"]

    def drive(self, pose: dict, speed: float) -> None:
        v = self.vehicles[self.driven]
        v.update(x=pose["x"], y=pose["y"], z=pose["z"], heading=pose["heading"], speed=speed)
        for vid, tug in self.hitched.items():
            if tug == self.driven:
                self.vehicles[vid].update(x=pose["x"], y=pose["y"], z=pose["z"],
                                          heading=pose["heading"])

    def park(self) -> None:
        self.vehicles[self.driven]["speed"] = 0.0

    def topic(self, driving: bool) -> dict:
        out = []
        for vid in sorted(self.vehicles):
            v = self.vehicles[vid]
            entry = {
                "id": vid, "typeName": v["typeName"], "name": v["name"], "farmId": v["farmId"],
                "isAI": v["isAI"], "propertyState": v["propertyState"],
                "motorized": v["motorized"], "attached": v["attached"],
                "x": v["x"], "y": v["y"], "z": v["z"], "heading": v["heading"],
            }
            if v["motorized"]:
                entry["speed"] = v.get("speed", 0.0)
            if driving and vid == self.driven:
                entry["engineOn"] = True
                entry["implements"] = [
                    {"name": self.vehicles[h]["name"], "depth": 1, "lowered": False,
                     "turnedOn": False}
                    for h, tug in self.hitched.items() if tug == vid]
            out.append(entry)
        data = {"vehicles": out}
        if driving:
            data["controlledId"] = self.driven
        return data


def convert(src, pda: dict, farmlands: dict, out) -> int:
    seq = 0

    def emit(t: int, topic: str, data: dict) -> None:
        nonlocal seq
        seq += 1
        out.write(json.dumps({"v": 1, "seq": seq, "t": t, "topic": topic,
                              "data": data}, separators=(",", ":")) + "\n")

    records = [json.loads(line) for line in src]
    first_drive = next(r["data"]["vehicle"] for r in records if r["data"].get("vehicle"))
    fleet = Fleet(pda, (first_drive["x"], first_drive["z"]))
    hotspots = hotspots_topic(pda)
    grid = farmlands["farmland_grid"]
    outlines, areas = field_outlines_topic(pda, grid)
    fields = fields_topic(pda, areas)

    first_t = None
    last_pda_t = None
    last_foot = None
    last_drive = None
    foot_heading = 0.0
    for i, rec in enumerate(records):
        t = round(rec["t"])
        if first_t is None:
            first_t = t
            emit(t, "hello", HELLO)
            emit(t, "farmland_grid", grid)
            emit(t, "crop_types", crop_types_topic())
            emit(t, "field_outlines", outlines)
        if last_pda_t is None or t - last_pda_t >= PDA_INTERVAL_MS:
            last_pda_t = t
            emit(t, "hotspots", hotspots)
            emit(t, "farmlands", farmlands["farmlands"])
            emit(t, "fields", fields)
        d = rec["data"]
        vehicle = d.get("vehicle")
        if vehicle is not None:
            pose = {"x": round(vehicle["x"], 2), "y": round(vehicle["y"], 2),
                    "z": round(vehicle["z"], 2), "heading": round_heading(vehicle["hdg"])}
            speed = 0.0
            if last_drive is not None and t > last_drive[2]:
                speed = round(math.hypot(pose["x"] - last_drive[0], pose["z"] - last_drive[1])
                              / ((t - last_drive[2]) / 1000) * 3.6, 1)
            last_drive = (pose["x"], pose["z"], t)
            fleet.drive(pose, speed)
            player = dict(pose, inVehicle=True, vehicleId=fleet.driven, farmId=1)
            last_foot = None
        else:
            if last_drive is not None:
                fleet.park()
                last_drive = None
            x, y, z = d["playerGetPosition"]
            if last_foot is not None:
                dx, dz = x - last_foot[0], z - last_foot[1]
                if math.hypot(dx, dz) >= MIN_MOVE_M:
                    foot_heading = heading(dx, dz)
            last_foot = (x, z)
            player = {"x": round(x, 2), "y": round(y, 2), "z": round(z, 2),
                      "heading": foot_heading, "inVehicle": False, "farmId": 1}
        emit(t, "player", player)

        if i % 2 == 0:
            emit(t, "vehicles", fleet.topic(driving=vehicle is not None))

        if i % 5 == 0:
            minutes = 8 * 60 + (t - first_t) // 60000
            emit(t, "env", {
                "day": 1, "dayTimeMinutes": minutes, "season": 1,
                "money": {"1": 100000},
                "weather": {"tempMin": 12, "tempMax": 21, "tempTrend": 0},
            })
    return seq


def main() -> None:
    pose_path, pda_path, farmlands_path, out_path = sys.argv[1:5]
    with open(pda_path, encoding="utf-8") as f:
        pda = json.load(f)
    with open(farmlands_path, encoding="utf-8") as f:
        farmlands = json.load(f)
    with open(pose_path, encoding="utf-8") as src, \
            open(out_path, "w", encoding="utf-8", newline="\n") as out:
        n = convert(src, pda, farmlands, out)
    print(f"wrote {n} envelopes to {out_path}")


if __name__ == "__main__":
    main()
