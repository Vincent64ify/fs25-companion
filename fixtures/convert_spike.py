#!/usr/bin/env python3
"""Convert the Phase 0 pose recording into a protocol v1 fixture.

    python fixtures/convert_spike.py fixtures/spike_solek_pose.ndjson fixtures/solek_v1.ndjson

The spike recorded real positions on Solek at 5 Hz (on foot and in a
tractor). This rewrites them as the v1 topics the new mod sends:

* ``hello`` once, with the Solek map values verified in Phase 0
* ``player`` for every sample. In the vehicle, the vehicle's pose and its
  verified heading. On foot, the spike's heading is the constant 180 deg of
  the non-rotating root node, so the heading is derived from the movement
  between samples instead (kept when standing still).
* ``vehicles`` every other sample (the controlled tractor, or an empty list)
* ``env`` every 5th sample. These values are synthetic (the spike didn't
  record time or weather): the clock starts at 08:00 on day 1 and follows
  the recorded game time.

Until a real v1 session is recorded, this file is the replay fixture.
"""

import json
import math
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
VEHICLE_ID = 1
MIN_MOVE_M = 0.2


def round_heading(h: float) -> float:
    return round(h, 1) % 360


def heading(dx: float, dz: float) -> float:
    return round_heading((math.degrees(math.atan2(dx, -dz)) + 360) % 360)


def convert(src, out) -> int:
    seq = 0

    def emit(t: int, topic: str, data: dict) -> None:
        nonlocal seq
        seq += 1
        out.write(json.dumps({"v": 1, "seq": seq, "t": t, "topic": topic,
                              "data": data}, separators=(",", ":")) + "\n")

    first_t = None
    last_foot = None
    foot_heading = 0.0
    for i, line in enumerate(src):
        rec = json.loads(line)
        t = round(rec["t"])
        if first_t is None:
            first_t = t
            emit(t, "hello", HELLO)
        d = rec["data"]
        vehicle = d.get("vehicle")
        if vehicle is not None:
            pose = {"x": round(vehicle["x"], 2), "y": round(vehicle["y"], 2),
                    "z": round(vehicle["z"], 2), "heading": round_heading(vehicle["hdg"])}
            player = dict(pose, inVehicle=True, vehicleId=VEHICLE_ID, farmId=1)
            last_foot = None
        else:
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
            vehicles = []
            if vehicle is not None:
                vehicles.append({
                    "id": VEHICLE_ID, "typeName": d.get("vehicleName", "tractor"),
                    "name": "Tractor", "farmId": 1, "isAI": False,
                    "x": player["x"], "y": player["y"], "z": player["z"],
                    "heading": player["heading"], "engineOn": True,
                    "implements": [],
                })
            data = {"vehicles": vehicles}
            if vehicles:
                data["controlledId"] = VEHICLE_ID
            emit(t, "vehicles", data)

        if i % 5 == 0:
            minutes = 8 * 60 + (t - first_t) // 60000
            emit(t, "env", {
                "day": 1, "dayTimeMinutes": minutes, "season": 1,
                "money": {"1": 100000},
                "weather": {"tempMin": 12, "tempMax": 21, "tempTrend": 0},
            })
    return seq


def main() -> None:
    src_path, out_path = sys.argv[1], sys.argv[2]
    with open(src_path, encoding="utf-8") as src, \
            open(out_path, "w", encoding="utf-8", newline="\n") as out:
        n = convert(src, out)
    print(f"wrote {n} envelopes to {out_path}")


if __name__ == "__main__":
    main()
