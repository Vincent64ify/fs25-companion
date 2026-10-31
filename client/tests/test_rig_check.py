"""scripts/rig_check.py's judging (spec 0003's live check on every rig): an
ok means the cab changed the way the button asked, a refusal the mod
predicted (canNow) means nothing changed, and the selection comes back."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from rig_check import (entries, judge_all, judge_bales, judge_key, judge_selection,  # noqa: E402
                       judge_tip_side, judge_toggle, read, skip_key)

TRACTOR, FRONT, REAR = 998, 1003, 1004


def trailer(i, name="EDK 650", **s):
    return {"id": i, "depth": 1, "name": name, "can": ["tip", "tipSide", "cover", "detach"], **s}


def cab(*tools, selected=REAR):
    rig = [{"id": TRACTOR, "depth": 0, "name": "Vestrum 100", "can": []}] + list(tools)
    return {"rig": [{**e, "selected": e["id"] == selected} for e in rig]}


def test_entries_are_what_has_a_button():
    truck = {"id": 1, "depth": 0, "name": "Arocs", "can": ["fold"]}
    assert [e["id"] for e in entries({"rig": [truck, trailer(2)]})] == [1, 2]
    assert [e["id"] for e in entries(cab(trailer(FRONT)))] == [FRONT]


def test_read_follows_each_capability():
    e = trailer(FRONT, discharging=True, cover={"open": False}, plow={"rotated": True}, pipe={"out": True})
    assert (read(e, "tip"), read(e, "cover"), read(e, "rotate"), read(e, "pipe")) == (True, False, True, True)
    assert read({"lowered": "x"}, "lower") is None


def test_a_toggle_passes_only_when_the_cab_follows_the_answer():
    shut, open_ = trailer(FRONT, cover={"open": False}), trailer(FRONT, cover={"open": True})
    assert judge_toggle("cover", shut, open_, {"ok": True})[0] == "PASS"
    assert judge_toggle("cover", shut, shut, {"ok": True}) == ("FAIL", "ok, but cover stayed False")
    assert judge_toggle("cover", shut, open_, {"ok": False, "reason": "x"})[0] == "FAIL"
    # a refusal nobody predicted is a failure too: the button wasn't faded
    assert judge_toggle("cover", shut, shut, {"ok": False, "reason": "no"}) == ("FAIL", "refused: no")
    assert judge_toggle("cover", shut, None, {"ok": True}) == ("FAIL", "the tool is gone")
    assert judge_toggle("cover", shut, open_, None)[0] == "FAIL"


def test_a_tip_that_ends_by_itself_still_moved():
    # live 2026-10-31: the front trailer tipped and stopped before the step's wait ended
    still, tipping = trailer(FRONT, discharging=False), trailer(FRONT, discharging=True)
    assert judge_toggle("tip", still, still, {"ok": True}, seen=[still, tipping, still]) == \
        ("PASS", "False -> True, then back by itself")
    assert judge_toggle("tip", still, still, {"ok": True}, seen=[still, still])[0] == "FAIL"


def test_a_predicted_refusal_passes_when_nothing_changed():
    raised = {"id": 7, "name": "SERVO", "can": ["rotate"], "plow": {"rotated": False},
              "canNow": {"rotate": False}, "whyNot": {"rotate": "Lower the plow first"}}
    words = {"ok": False, "reason": "Lower the plow first"}
    assert judge_toggle("rotate", raised, raised, words) == ("PASS", "refused, as faded: Lower the plow first")
    assert judge_toggle("rotate", raised, {**raised, "plow": {"rotated": True}}, {"ok": True})[0] == "FAIL"
    # other words than the card's: still refused, but say so
    verdict, shown = judge_toggle("rotate", raised, raised, {"ok": False, "reason": "not allowed now"})
    assert verdict == "PASS" and "the card said" in shown


def test_tip_side_steps():
    back = trailer(REAR, tipSide={"index": 1, "count": 2, "name": "Back"})
    left = trailer(REAR, tipSide={"index": 2, "count": 2, "name": "Left"})
    assert judge_tip_side(back, left, {"ok": True}) == ("PASS", "Back -> Left (2 of 2)")
    assert judge_tip_side(back, back, {"ok": True}) == ("FAIL", "ok, but still Back (1 of 2)")
    assert judge_tip_side(back, left, {"ok": False, "reason": "x"})[0] == "FAIL"


def test_the_selection_comes_back():
    before = cab(trailer(FRONT), trailer(REAR))
    assert judge_selection(before, cab(trailer(FRONT), trailer(REAR))) is None
    assert judge_selection(before, cab(trailer(FRONT, "front"), trailer(REAR), selected=FRONT)) == \
        "the selection moved from EDK 650 to front"


def test_a_key_passes_when_its_label_turns():
    def baler(text):
        return {"id": 9, "name": "G-1", "can": ["turnOn"], "extraKeys": [
            {"action": "IMPLEMENT_EXTRA4", "text": text}, {"action": "LOWER_IMPLEMENT", "text": "Lower pickup"}]}
    on, off = baler("Turn on automatic drop"), baler("Turn off automatic drop")
    assert judge_key("IMPLEMENT_EXTRA4", on, off, {"ok": True}) == \
        ("PASS", "Turn on automatic drop -> Turn off automatic drop")
    # the same label: the game may still have acted (Allow create fields): Vincent looks
    assert judge_key("IMPLEMENT_EXTRA4", on, on, {"ok": True})[0] == "LOOK"
    assert judge_key("IMPLEMENT_EXTRA4", on, {"id": 9, "name": "G-1"}, {"ok": True})[0] == "LOOK"
    assert judge_key("IMPLEMENT_EXTRA4", on, off, {"ok": False, "reason": "x"})[0] == "FAIL"


def test_keys_that_empty_a_tool_are_skipped():
    assert skip_key("Dump on ground") and skip_key("Unload round bale") and skip_key("Unload")
    assert not skip_key("Turn on automatic drop") and not skip_key("Allow create fields")


def test_bale_reset():
    def baler(n):
        return {"id": 9, "name": "G-1", "can": ["bales"], "bales": {"count": n}}
    assert judge_bales(baler(3), baler(0), {"ok": True}) == ("PASS", "3 -> 0")
    assert judge_bales(baler(3), baler(3), {"ok": True}) == ("FAIL", "ok, but 3 -> 3")
    assert judge_bales(baler(0), baler(0), {"ok": True})[0] == "LOOK"


def test_tip_all_and_cover_all():
    before = cab(trailer(FRONT, discharging=False), trailer(REAR, discharging=False))
    both = cab(trailer(FRONT, discharging=True), trailer(REAR, discharging=True))
    one = cab(trailer(FRONT, discharging=True), trailer(REAR, discharging=False))
    assert judge_all("tip", True, before, both, {"ok": True}) == ("PASS", "EDK 650 there, EDK 650 there")
    verdict, shown = judge_all("tip", True, before, one, {"ok": True})
    assert verdict == "FAIL" and "EDK 650 not there" in shown
    assert judge_all("tip", True, before, one, {"ok": False, "reason": "EDK 650: no"})[0] == "PASS"
