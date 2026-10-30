"""scripts/allrow_check.py's judging (spec 0003 revision 2): an ok means each
tool reached the asked state, a failure means one didn't."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from allrow_check import asked, judge  # noqa: E402


def cab(*tools):
    return {"rig": [{"id": 1, "depth": 0, "can": []}] + [
        {"id": i, "depth": 1, "name": n, "can": ["lower", "fold", "turnOn"], **s} for i, n, s in tools]}


FRONT, REAR = 994, 996


def mowers(front, rear):
    return cab((FRONT, "KDF 341 S", front), (REAR, "KDD 941 STH", rear))


def test_asked_follows_the_labels():
    folded = {"unfolded": False, "lowered": False, "turnedOn": False}
    unfolded = {"unfolded": True, "lowered": False, "turnedOn": False}
    assert asked(mowers(folded, folded), "fold") == ({FRONT: True, REAR: True}, "Unfold all")
    # one unfolded: Fold all, as the game's key (spike 0.0.5)
    assert asked(mowers(folded, unfolded), "fold") == ({REAR: False}, "Fold all")
    assert asked(mowers(unfolded, {**unfolded, "lowered": True}), "lower") == ({FRONT: True}, "Lower all")
    assert asked(mowers({**unfolded, "lowered": True}, {**unfolded, "lowered": True}), "lower") == \
        ({FRONT: False, REAR: False}, "Raise all")
    assert asked(mowers(unfolded, unfolded), "turnOn", REAR) == ({REAR: True}, "Turn on")


def test_a_run_that_passes():
    before = mowers({"unfolded": False}, {"unfolded": False})
    want, _ = asked(before, "fold")
    after = mowers({"unfolded": True}, {"unfolded": True})
    assert judge("fold", want, {"ok": True}, after) == (True, "KDF 341 S there, KDD 941 STH there")


def test_an_ok_with_nothing_moved_fails():
    """The 0.8.10 kind: ok, and nothing lowered."""
    before = mowers({"lowered": False}, {"lowered": False})
    want, _ = asked(before, "lower")
    passed, shown = judge("lower", want, {"ok": True}, before)
    assert not passed
    assert shown == "ok, but KDF 341 S not there, KDD 941 STH not there"


def test_a_failure_that_moved_fails_and_no_answer_fails():
    before = mowers({"turnedOn": False}, {"turnedOn": False})
    want, _ = asked(before, "turnOn")
    after = mowers({"turnedOn": True}, {"turnedOn": True})
    assert judge("turnOn", want, {"ok": False, "reason": "Nothing moved"}, after)[0] is False
    assert judge("turnOn", want, None, after)[0] is False


def test_a_failure_naming_the_one_that_didnt_move_passes_when_learning():
    before = mowers({"lowered": True}, {"lowered": False})
    want, _ = asked(before, "lower")
    after = mowers({"lowered": True}, {"lowered": False})
    ack = {"ok": False, "reason": "KDD 941 STH: Nothing moved"}
    assert judge("lower", want, ack, after, expect="learn")[0] is True
    assert judge("lower", want, ack, after, expect="works")[0] is False


def test_engine_off_must_fail_and_move_nothing():
    before = mowers({"unfolded": True}, {"unfolded": True})
    want, _ = asked(before, "fold")
    ack = {"ok": False, "reason": "Please start the engine first!"}
    assert judge("fold", want, ack, before, expect="blocked", before=before) == (True, "nothing moved")
    moved = mowers({"unfolded": False}, {"unfolded": True})
    assert judge("fold", want, ack, moved, expect="blocked", before=before)[0] is False
    assert judge("fold", want, {"ok": True}, before, expect="blocked", before=before)[0] is False
