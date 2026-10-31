import os
import re
from pathlib import Path

import pytest

from companion import commands as commands_mod
from companion.commands import FAST_POLL_S, CommandWriter


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


def make(tmp_path, session="S1", next_id=None):
    acks = []
    clock = Clock()
    writer = CommandWriter(tmp_path / "cmd", acks.append, clock=clock)
    hello = {"sessionId": session, "commands": {"dir": "x", "next": next_id or 1, "actions": 2}}
    writer.on_hello(hello)
    return writer, acks, clock


def attrs(path: Path):
    return dict(re.findall(r'(\w+)="([^"]*)"', path.read_text(encoding="utf-8")))


def test_writes_numbered_files_for_the_session(tmp_path):
    writer, acks, _ = make(tmp_path)
    writer.submit("7", "lights.toggle")
    writer.submit("8", "lights.toggle")
    assert acks == []
    assert sorted(p.name for p in (tmp_path / "cmd").iterdir()) == ["1.xml", "2.xml"]
    assert attrs(tmp_path / "cmd" / "1.xml") == {
        "version": "1.0", "encoding": "utf-8", "standalone": "no",
        "session": "S1", "id": "1", "action": "lights.toggle", "ref": "7"}
    assert attrs(tmp_path / "cmd" / "2.xml")["ref"] == "8"


def test_temp_file_is_read_back_before_the_rename(tmp_path, monkeypatch):
    writer, _, _ = make(tmp_path)
    events = []
    real_read, real_replace = Path.read_bytes, os.replace

    def read_bytes(self):
        events.append(("read", self.name))
        return real_read(self)

    def replace(src, dst):
        events.append(("replace", Path(src).name, Path(dst).name))
        real_replace(src, dst)

    monkeypatch.setattr(Path, "read_bytes", read_bytes)
    monkeypatch.setattr(commands_mod.os, "replace", replace)
    writer.submit("1", "lights.toggle")
    assert events == [("read", "1.xml.tmp"), ("replace", "1.xml.tmp", "1.xml")]
    assert not (tmp_path / "cmd" / "1.xml.tmp").exists()


def test_ack_deletes_the_file(tmp_path):
    writer, _, _ = make(tmp_path)
    writer.submit("1", "lights.toggle")
    writer.submit("2", "lights.toggle")
    writer.on_ack({"id": 1, "ref": "1", "ok": True})
    assert [p.name for p in (tmp_path / "cmd").iterdir()] == ["2.xml"]
    writer.on_ack({"id": 1, "ref": "1", "ok": True})  # twice: no error
    writer.on_ack({"ref": "x", "ok": False})  # a client-made ack has no id


def test_an_ack_without_its_ref_gets_it_from_the_number(tmp_path):
    """The mod couldn't read file 1 (live: a sharing violation) and answers
    by number only; the writer knows whose command 1 was."""
    writer, _, _ = make(tmp_path)
    writer.submit("r7", "lights.toggle")
    ack = {"id": 1, "ok": False, "reason": "unreadable command file"}
    writer.on_ack(ack)
    assert ack["ref"] == "r7"
    # one the writer never wrote keeps no ref
    other = {"id": 9, "ok": False, "reason": "unreadable command file"}
    writer.on_ack(other)
    assert "ref" not in other


def test_numbering_restarts_and_old_files_go_with_a_new_session(tmp_path):
    writer, _, _ = make(tmp_path)
    writer.submit("1", "lights.toggle")
    writer.submit("2", "lights.toggle")
    # the same session again (hello re-sent after a rotation): keep counting
    writer.on_hello({"sessionId": "S1", "commands": {"next": 2, "actions": 2}})
    writer.submit("3", "lights.toggle")
    assert attrs(tmp_path / "cmd" / "3.xml")["id"] == "3"
    (tmp_path / "cmd" / "9.xml.tmp").write_text("half", encoding="utf-8")
    writer.on_hello({"sessionId": "S2", "commands": {"next": 1, "actions": 2}})
    assert list((tmp_path / "cmd").iterdir()) == []
    writer.submit("4", "lights.toggle")
    assert attrs(tmp_path / "cmd" / "1.xml")["session"] == "S2"


def test_a_client_started_mid_session_continues_from_the_mods_next(tmp_path):
    (tmp_path / "cmd").mkdir()
    (tmp_path / "cmd" / "4.xml").write_text("<command/>", encoding="utf-8")
    writer, _, _ = make(tmp_path, next_id=5)
    assert (tmp_path / "cmd" / "4.xml").exists(), "mid-session: nothing cleared"
    writer.submit("1", "lights.toggle")
    assert attrs(tmp_path / "cmd" / "5.xml")["id"] == "5"
    # acks read from the stream's backlog move it on as well
    writer.on_ack({"id": 9, "ok": True})
    writer.submit("2", "lights.toggle")
    assert (tmp_path / "cmd" / "10.xml").exists()


def test_refusals_answer_at_once_and_write_nothing(tmp_path):
    writer, acks, _ = make(tmp_path)
    # a mod before 0.9.0 reads the game's names: nothing it could misread
    writer.on_hello({"sessionId": "OLD", "commands": {"dir": "x", "next": 1}})
    writer.submit("1", "lights.toggle")
    replay = CommandWriter(None, acks.append)
    replay.on_hello({"sessionId": "S1"})
    replay.submit("2", "lights.toggle")
    early = CommandWriter(tmp_path / "early", acks.append)
    early.submit("3", "lights.toggle")
    assert [(a["topic"], a["data"]["ref"], a["data"]["ok"], a["data"]["reason"]) for a in acks] == [
        ("command_ack", "1", False, "update the mod"),
        ("command_ack", "2", False, "no game (replay)"),
        ("command_ack", "3", False, "game not running"),
    ]
    assert not (tmp_path / "cmd").exists() or list((tmp_path / "cmd").iterdir()) == []
    assert not (tmp_path / "early").exists()


def test_fast_polling_for_two_seconds_after_a_command(tmp_path):
    writer, _, clock = make(tmp_path)
    assert not writer.fast()
    writer.submit("1", "lights.toggle")
    assert writer.fast()
    clock.now += FAST_POLL_S - 0.01
    assert writer.fast()
    clock.now += 0.02
    assert not writer.fast()


@pytest.mark.parametrize("ref", ['a"b', "<x>&"])
def test_refs_are_escaped(tmp_path, ref):
    writer, _, _ = make(tmp_path)
    writer.submit(ref, "lights.toggle")
    text = (tmp_path / "cmd" / "1.xml").read_text(encoding="utf-8")
    import xml.etree.ElementTree as ET
    assert ET.fromstring(text.split("?>", 1)[1]).get("ref") == ref


def test_the_file_carries_the_dashboards_action_and_value(tmp_path):
    """specs/0007: no list here; the mod checks the action and its value."""
    writer, acks, _ = make(tmp_path)
    sent = [("cruise.set", 23.5), ("implement.select", 5), ("implement.next", None),
            ("implement.key", 2), ("implement.tipAll", 1), ("someday.newButton", None)]
    for n, (action, value) in enumerate(sent, start=1):
        writer.submit(str(n), action, value)
        a = attrs(tmp_path / "cmd" / f"{n}.xml")
        assert a["action"] == action
        assert a.get("value") == (None if value is None else f"{value:.3f}")
    assert acks == []


def test_every_action_the_dashboard_sends_is_one_the_mod_runs():
    repo = Path(__file__).resolve().parents[2]
    lua = (repo / "mod" / "src" / "Commands.lua").read_text(encoding="utf-8")
    mod = set(re.findall(r'^    \["([a-zA-Z.]+)"\] = \{', lua, re.M))
    web = set()
    for js in (repo / "web" / "src").rglob("*.js"):
        text = js.read_text(encoding="utf-8")
        web |= set(re.findall(r'(?:action: |send\(|sendCommand\()"([a-z][a-zA-Z]*\.[a-z][a-zA-Z]*)"', text))
    assert len(web) > 20 and len(mod) > 20
    assert web <= mod, f"the mod doesn't run {sorted(web - mod)}"


def test_cruise_set_one_in_the_game_the_latest_waits(tmp_path):
    writer, acks, _ = make(tmp_path)
    writer.submit("a", "cruise.set", 10)
    writer.submit("b", "cruise.set", 11)  # waits
    writer.submit("c", "cruise.set", 12)  # replaces b
    writer.submit("d", "lights.toggle")   # other actions go straight in
    files = sorted(p.name for p in (tmp_path / "cmd").iterdir())
    assert files == ["1.xml", "2.xml"]
    assert attrs(tmp_path / "cmd" / "2.xml")["action"] == "lights.toggle"
    assert [(a["data"]["ref"], a["data"]["ok"], a["data"]["reason"]) for a in acks] == [("b", True, "superseded")]
    # the mod answers 1: the waiting one (12) goes in
    writer.on_ack({"id": 1, "ok": True})
    assert attrs(tmp_path / "cmd" / "3.xml")["value"] == "12.000"
    assert attrs(tmp_path / "cmd" / "3.xml")["ref"] == "c"
    writer.on_ack({"id": 2, "ok": True})  # the lights: nothing waiting moves
    writer.on_ack({"id": 3, "ok": True})
    writer.submit("e", "cruise.set", 13)
    assert attrs(tmp_path / "cmd" / "4.xml")["value"] == "13.000"


def test_cruise_slot_freed_by_a_hello_past_it(tmp_path):
    """specs/0004: the ack of 1 fell in a rotation; the hello after it says
    the mod read 1, so the waiting value goes in."""
    writer, _, _ = make(tmp_path)
    writer.submit("a", "cruise.set", 10)
    writer.submit("b", "cruise.set", 11)  # waits
    writer.on_hello({"sessionId": "S1", "commands": {"dir": "x", "next": 1, "actions": 2}})
    assert not (tmp_path / "cmd" / "2.xml").exists(), "1 not read yet: still waiting"
    writer.on_hello({"sessionId": "S1", "commands": {"dir": "x", "next": 2, "actions": 2}})
    assert attrs(tmp_path / "cmd" / "2.xml")["value"] == "11.000"
    assert attrs(tmp_path / "cmd" / "2.xml")["ref"] == "b"


def test_cruise_slot_given_up_after_the_timeout(tmp_path):
    writer, acks, clock = make(tmp_path)
    writer.submit("a", "cruise.set", 10)
    clock.now += commands_mod.IN_GAME_TIMEOUT_S - 1
    writer.submit("b", "cruise.set", 11)
    assert not (tmp_path / "cmd" / "2.xml").exists(), "within the timeout: waits"
    clock.now += 2
    writer.submit("c", "cruise.set", 12)
    assert attrs(tmp_path / "cmd" / "2.xml")["value"] == "12.000", "1 given up: the newest goes in"
    assert [(a["data"]["ref"], a["data"]["reason"]) for a in acks] == [("b", "superseded")]
    # a late ack for 1 changes nothing: 2 stays in the game
    writer.on_ack({"id": 1, "ok": True})
    writer.submit("d", "cruise.set", 13)
    assert not (tmp_path / "cmd" / "3.xml").exists()
    writer.on_ack({"id": 2, "ok": True})
    assert attrs(tmp_path / "cmd" / "3.xml")["value"] == "13.000"


def test_a_replayed_ack_changes_nothing(tmp_path):
    writer, acks, _ = make(tmp_path)
    writer.submit("a", "cruise.set", 10)
    writer.on_ack({"id": 1, "ok": True})
    writer.submit("b", "cruise.set", 11)  # 2, in the game
    writer.submit("c", "cruise.set", 12)  # waits
    writer.on_ack({"id": 1, "ok": True})  # 1 again, after a rotation
    assert sorted(p.name for p in (tmp_path / "cmd").iterdir()) == ["2.xml"]
    assert acks == []
