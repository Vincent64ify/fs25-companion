#!/usr/bin/env python3
"""Spec 0012's probe dumps (spike 0.0.9, csParts) as test fixtures.

    python research/spike/slim_parts.py "<profile>/modSettings/FS25_CompanionSpike"

Each parts-*.json holds, for every rig member, its parts and what spec 0012
reads in each, and every Precision Farming field (most of them maps and
HUD overlays). This keeps what the mod's capabilities read, in the member
format of spike 0.0.4's rig dumps (mod/tests/fixtures/spike0003/, read by
mod/tests/spike_rigs.lua), and writes mod/tests/fixtures/spike0012/:

* arion-off.json, arion-on.json: the CLAAS ARION 410 with the W 600 and the
  Berthoud Vantage 4300 (Precision Farming), the engine off, then on
* dino.json: the Agrio DINO II (self-propelled), the engine off
* rogator.json: the Fendt Rogator 937H (self-propelled), the engine on

What the probe didn't read is filled in, and marked here: every member is
selectable (the W 600 was selected), a tool may be detached (no tool's
isDetachAllowed was read), its fill units can be unloaded (FillUnit's
canBeUnloaded defaults to true) and none is lowered.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "mod" / "tests" / "fixtures" / "spike0012"
DUMPS = {"arion-off": "parts-off.json", "arion-on": "parts-on.json", "dino": "parts-dino.json",
         "rogator": "parts-rogator.json"}
PF = "spec_FS25_precisionFarming.extendedSprayer"
PF_RATE = ("sprayAmountAutoMode", "sprayAmountAutoModeChangeAllowed", "sprayAmountManual", "sprayAmountManualMin",
           "sprayAmountManualMax")


def short(spec):
    """"spec_FS25_precisionFarming.extendedSprayer" -> "FS25_precisionFarming.extendedSprayer"."""
    return spec[5:] if spec.startswith("spec_") else spec


def fields(part, prefix):
    """{"fold.foldAnimTime": 0} -> {"foldAnimTime": 0}."""
    return {k[len(prefix) + 1:]: v for k, v in ((part or {}).get("fields") or {}).items() if k.startswith(prefix + ".")}


def member(m):
    label = m["label"]
    out = {"id": label["id"], "name": label["name"], "typeName": label["typeName"], "depth": m["depth"]}
    if m.get("parent") is not None:
        out["parent"] = m["parent"]
    out["specs"] = sorted(short(s) for s in m.get("specs") or [])
    powered = m.get("powered") or []
    if powered and powered[0] is False and len(powered) > 1:
        out["noPower"] = powered[1]
    fold = m.get("fold")
    if fold:
        f = fields(fold, "fold")
        out["fold"] = {"allowed": fold.get("allowed"), "parts": fold.get("parts", 0),
                       "toggledDirection": 1 if fold.get("unfolded") else -1, "animTime": f.get("foldAnimTime"),
                       "moveDirection": f.get("foldMoveDirection"), "unfoldWarning": f.get("unfoldWarning")}
        if isinstance(f.get("foldMiddleAnimTime"), (int, float)):
            out["fold"]["middle"] = f["foldMiddleAnimTime"]
    turn_on = m.get("turnOn") or {}
    if turn_on.get("fields"):
        f = fields(turn_on, "turnOn")
        out["turnOn"] = {"canBeTurnedOn": turn_on.get("canBeTurnedOn"), "isAlwaysTurnedOn": f.get("isAlwaysTurnedOn"),
                         "turnedOnByAttacherVehicle": f.get("turnedOnByAttacherVehicle")}
        if turn_on.get("warning"):
            out["turnOn"]["warning"] = turn_on["warning"]
    joint = m.get("inputJoint")
    if joint:
        out["lower"] = {"allows": joint.get("allowsLowering") is True}
        out["inputJoint"] = {k: joint[k] for k in ("allowsLowering", "canBeTurnedOn") if k in joint}
    if m["depth"] > 0:
        out["detach"] = [True]
    fill = m.get("fillUnit") or {}
    out["fills"] = [{"unit": f["unit"], "name": f["name"], "level": f["level"], "capacity": f["capacity"],
                     "showOnHud": f.get("showOnHud")} for f in fill.get("fills") or []]
    if fill.get("unloadingPlaces"):
        out["unloading"] = fill["unloadingPlaces"]
    sprayer = fields(m.get("sprayer"), "sprayer")
    if sprayer:
        out["sprayer"] = {k: sprayer.get(k) for k in ("isFertilizerSprayer", "isSlurryTanker", "isManureSpreader",
                                                      "doubledAmountIsActive")}
    width = fields(m.get("width"), "width")
    if width:
        out["variableWorkWidth"] = {k: width.get(k) for k in ("hasSections", "hasCenter", "isActive", "leftSide",
                                                              "leftSideMax", "rightSide", "rightSideMax",
                                                              "minSideState")}
    pf = ((m.get("precisionFarming") or {}).get(PF)) or {}
    rate = {k: pf.get(f"{PF}.{k}") for k in PF_RATE if f"{PF}.{k}" in pf}
    if rate:
        out["precisionFarming"] = rate
    keys = m.get("keys")
    out["keys"] = {short(spec): [{"action": k["action"], "active": k["active"], "text": k["text"],
                                  "visible": k["shown"]} for k in lst]
                   for spec, lst in sorted((keys or {}).items())} if isinstance(keys, dict) else {}
    return out


def slim(dump):
    parts = dump["parts"]
    members = [member(m) for m in parts["rig"]]
    return {"spikeVersion": dump.get("spikeVersion"), "engineOn": parts.get("engineOn"),
            "selectedId": (parts.get("selected") or {}).get("id"), "selectable": [m["id"] for m in members],
            "members": members}


def main(argv):
    if len(argv) != 1:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    src = Path(argv[0])
    OUT.mkdir(parents=True, exist_ok=True)
    for name, file in DUMPS.items():
        out = slim(json.loads((src / file).read_text(encoding="utf-8")))
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        print("wrote", path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
