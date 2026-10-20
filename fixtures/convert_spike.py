#!/usr/bin/env python3
"""Convert the Phase 0 recordings into a protocol v1 fixture.

    python fixtures/convert_spike.py fixtures/spike_solek_pose.ndjson \\
        fixtures/spike_solek_pda.json fixtures/solek_v1.ndjson

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
* ``hotspots`` and ``farmlands`` every 10 s of game time. The hotspots are
  the report's, minus the categories the mod leaves out. The farmlands sit
  at the report's FIELD hotspots (one per farmland) with their real owner.
  Ids, areas and prices are synthetic.
* ``farmland_grid`` once, after hello. SYNTHETIC: the report has no grid,
  so each cell gets the nearest farmland centre (a Voronoi diagram), with
  gaps along the borders and far from any centre standing in for roads and
  forest. It looks nothing like Solek's real farmlands. It exercises the
  dashboard's outline tracing.
* ``env`` every 5th sample. These values are synthetic (the spike didn't
  record time or weather): the clock starts at 08:00 on day 1 and follows
  the recorded game time.

Until a real v1 session is recorded, this file is the replay fixture.
"""

import json
import math
import sys
from collections import defaultdict

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
# the mod sends hotspots and farmlands every 10 s; every 60 s keeps the fixture small
PDA_INTERVAL_MS = 60000

# the categories Hotspots.lua leaves out (fields, vehicles, AI, player)
SKIPPED_CATEGORIES = {1, 5, 6, 7, 8, 14, 15}
FIELD_CATEGORY = 1

# synthetic farmland grid, same layout as FarmlandGrid.lua on a 2 km map
TERRAIN = 2048
CELL = 4
COLS = TERRAIN // CELL
ROAD_M = 7.0
REACH_M = 230.0
BUCKET_M = 256


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


def synthetic_grid(centres):
    """centres: [(id, x, z)] -> (runs, cell count per id)"""
    buckets = defaultdict(list)
    for c in centres:
        buckets[(int((c[1] + TERRAIN / 2) // BUCKET_M), int((c[2] + TERRAIN / 2) // BUCKET_M))].append(c)
    runs, counts = [], defaultdict(int)
    run_id, run_len = None, 0
    for row in range(COLS):
        z = -TERRAIN / 2 + (row + 0.5) * CELL
        bz = int((z + TERRAIN / 2) // BUCKET_M)
        for col in range(COLS):
            x = -TERRAIN / 2 + (col + 0.5) * CELL
            bx = int((x + TERRAIN / 2) // BUCKET_M)
            d1 = d2 = math.inf
            best = 0
            for i in (bx - 1, bx, bx + 1):
                for j in (bz - 1, bz, bz + 1):
                    for fid, cx, cz in buckets.get((i, j), ()):
                        d = (x - cx) ** 2 + (z - cz) ** 2
                        if d < d1:
                            d1, d2, best = d, d1, fid
                        elif d < d2:
                            d2 = d
            d1, d2 = math.sqrt(d1), math.sqrt(d2)
            fid = best if d1 <= REACH_M and d2 - d1 >= ROAD_M else 0
            counts[fid] += 1
            if fid == run_id:
                run_len += 1
            else:
                if run_id is not None:
                    runs += [run_id, run_len]
                run_id, run_len = fid, 1
    runs += [run_id, run_len]
    return runs, counts


def farmland_topics(pda: dict):
    centres = [(i + 1, h["x"], h["z"], h["farmId"] or 0)
               for i, h in enumerate(h for h in pda["hotspots"] if h["category"] == FIELD_CATEGORY)]
    runs, counts = synthetic_grid([c[:3] for c in centres])
    grid = {"cell": CELL, "cols": COLS, "rows": COLS, "originX": -TERRAIN / 2,
            "originZ": -TERRAIN / 2, "runs": runs}
    farmlands = []
    for fid, x, z, farm_id in centres:
        area = round(counts[fid] * CELL * CELL / 10000, 2)
        farmlands.append({
            "id": fid, "farmId": farm_id, "areaHa": area,
            "price": round(area * pda["pricePerHa"]),
            "x": round(x, 1), "z": round(z, 1), "name": str(fid), "listed": True,
        })
    return {"farmlands": farmlands}, grid


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


def convert(src, pda: dict, out) -> int:
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
    farmlands, grid = farmland_topics(pda)

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
        if last_pda_t is None or t - last_pda_t >= PDA_INTERVAL_MS:
            last_pda_t = t
            emit(t, "hotspots", hotspots)
            emit(t, "farmlands", farmlands)
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
    pose_path, pda_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(pda_path, encoding="utf-8") as f:
        pda = json.load(f)
    with open(pose_path, encoding="utf-8") as src, \
            open(out_path, "w", encoding="utf-8", newline="\n") as out:
        n = convert(src, pda, out)
    print(f"wrote {n} envelopes to {out_path}")


if __name__ == "__main__":
    main()
