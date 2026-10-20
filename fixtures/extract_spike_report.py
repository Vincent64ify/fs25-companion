#!/usr/bin/env python3
"""Keep the PDA parts of a Phase 0 spike report as a small fixture.

    python fixtures/extract_spike_report.py <modSettings>/FS25_CompanionSpike/report.json \\
        fixtures/spike_solek_pda.json

The report (about 100 KB) holds the whole API dump. This keeps only what
the Phase 3 fixture is built from, as the game reported it:

* every PDA hotspot: category, name, owner farm, world position, visible.
  The 189 FIELD hotspots (category 1) sit at the farmland centres.
* every vehicle: id, name, typeName, owner farm, world position,
  propertyState, AI state
* every field: id, farmland, indicator position (no outline: the spike
  didn't record one), and the first field's area and state
* the farmland price per hectare
"""

import json
import sys


def extract(report: dict) -> dict:
    hotspots = []
    for h in report["hotspots"]["list"]:
        pos = h.get("pos") or [None, None]
        hotspots.append({
            "category": h.get("category"),
            "name": h.get("name"),
            "farmId": h.get("ownerFarmId"),
            "x": round(pos[0], 2),
            "z": round(pos[1], 2),
            "visible": h.get("visible", True),
        })
    vehicles = []
    for v in report["vehicles"]["list"]:
        x, y, z = v["pos"]
        vehicles.append({
            "id": v["id"], "name": v.get("name"), "typeName": v.get("typeName"),
            "farmId": v.get("ownerFarmId"), "propertyState": v.get("propertyState"),
            "isAI": v.get("isAIActive", False),
            "motorized": "spec_motorized" in v.get("specs", []),
            "x": round(x, 2), "y": round(y, 2), "z": round(z, 2),
        })
    fields = [{
        "id": f["getId"], "farmlandId": f.get("farmlandId"),
        "x": round(f["posX"], 2), "z": round(f["posZ"], 2),
    } for f in report["fields"]["list"]]
    first = report["fields"]["firstField"]["fields"]
    manager = report["farmlands"]["manager"]["fields"]
    return {
        "source": "Phase 0 spike report, Solek, 2026-10-20",
        "pricePerHa": manager.get("pricePerHa"),
        "hotspots": hotspots,
        "vehicles": vehicles,
        "fields": fields,
        "firstField": {
            "areaHa": round(first["areaHa"], 2),
            "fieldState": {k: v for k, v in first["fieldState"].items() if isinstance(v, int) and not isinstance(v, bool)},
        },
    }


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        data = extract(json.load(f))
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {len(data['hotspots'])} hotspots, {len(data['vehicles'])} vehicles and "
          f"{len(data['fields'])} fields to {out}")


if __name__ == "__main__":
    main()
