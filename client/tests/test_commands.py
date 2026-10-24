import os
import re
from pathlib import Path

import pytest

import commands as commands_mod
from commands import FAST_POLL_S, CommandWriter
from companion_client import forwarder
from relay import Outbox, WebSocketRelay


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


def make(tmp_path, session="S1", next_id=None):
    acks = []
    clock = Clock()
    writer = CommandWriter(tmp_path / "cmd", acks.append, clock=clock)
    hello = {"sessionId": session}
    if next_id is not None:
        hello["commands"] = {"dir": "x", "next": next_id}
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
        "session": "S1", "id": "1", "action": "TOGGLE_LIGHTS", "ref": "7"}
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


def test_numbering_restarts_and_old_files_go_with_a_new_session(tmp_path):
    writer, _, _ = make(tmp_path)
    writer.submit("1", "lights.toggle")
    writer.submit("2", "lights.toggle")
    # the same session again (hello re-sent after a rotation): keep counting
    writer.on_hello({"sessionId": "S1", "commands": {"next": 2}})
    writer.submit("3", "lights.toggle")
    assert attrs(tmp_path / "cmd" / "3.xml")["id"] == "3"
    (tmp_path / "cmd" / "9.xml.tmp").write_text("half", encoding="utf-8")
    writer.on_hello({"sessionId": "S2", "commands": {"next": 1}})
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
    writer.submit("1", "engine.explode")
    replay = CommandWriter(None, acks.append)
    replay.on_hello({"sessionId": "S1"})
    replay.submit("2", "lights.toggle")
    early = CommandWriter(tmp_path / "early", acks.append)
    early.submit("3", "lights.toggle")
    assert [(a["topic"], a["data"]["ref"], a["data"]["ok"], a["data"]["reason"]) for a in acks] == [
        ("command_ack", "1", False, "action not allowed"),
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


def test_forwarder_passes_hellos_and_acks_on():
    outbox = Outbox()
    hellos, acks = [], []
    put = forwarder(outbox, [hellos.append], acks.append)
    put({"v": 1, "seq": 1, "t": 0, "topic": "hello", "data": {"sessionId": "S"}})
    put({"v": 1, "seq": 2, "t": 0, "topic": "command_ack", "data": {"id": 1, "ok": True}})
    put({"v": 1, "seq": 3, "t": 0, "topic": "player", "data": {}})
    assert hellos == [{"sessionId": "S"}]
    assert acks == [{"id": 1, "ok": True}]


def test_relay_hands_commands_to_on_command():
    relay = WebSocketRelay("ws://h", "1", Outbox())
    got = []
    relay.on_command = lambda ref, action, value=None: got.append((ref, action))
    relay.handle_message('{"type": "command", "ref": "4", "action": "lights.toggle"}')
    relay.handle_message('{"type": "replaced"}')
    relay.handle_message('{"type": "command", "ref": 4}')
    relay.handle_message("not json")
    assert got == [("4", "lights.toggle")]


@pytest.mark.parametrize("ref", ['a"b', "<x>&"])
def test_refs_are_escaped(tmp_path, ref):
    writer, _, _ = make(tmp_path)
    writer.submit(ref, "lights.toggle")
    text = (tmp_path / "cmd" / "1.xml").read_text(encoding="utf-8")
    import xml.etree.ElementTree as ET
    assert ET.fromstring(text.split("?>", 1)[1]).get("ref") == ref


def test_every_backend_action_maps_to_a_mod_action(tmp_path):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from backend.app.protocol import COMMAND_ACTIONS
    assert set(commands_mod.ACTIONS) == set(COMMAND_ACTIONS)
    lua = (Path(__file__).resolve().parents[2] / "mod" / "src" / "Commands.lua").read_text(encoding="utf-8")
    allowed = set(re.findall(r"^    ([A-Z_]+) = \{", lua, re.M))
    assert set(commands_mod.ACTIONS.values()) == allowed, "the mod allows exactly what the client sends"
    writer, acks, _ = make(tmp_path)
    writer.submit("9", "implement.fold")
    assert attrs(tmp_path / "cmd" / "1.xml")["action"] == "FOLD_IMPLEMENT"
    assert acks == []


def test_cruise_set_writes_its_value_and_checks_the_range(tmp_path):
    writer, acks, _ = make(tmp_path)
    writer.submit("1", "cruise.set", 23.5)
    assert attrs(tmp_path / "cmd" / "1.xml")["value"] == "23.500"
    assert attrs(tmp_path / "cmd" / "1.xml")["action"] == "CRUISE_SET_SPEED"
    writer.submit("2", "cruise.set", 999)
    writer.submit("3", "cruise.set", "fast")
    writer.submit("4", "lights.toggle", 5)
    assert [a["data"]["reason"] for a in acks] == ["value not allowed"] * 3


def test_cruise_set_one_in_the_game_the_latest_waits(tmp_path):
    writer, acks, _ = make(tmp_path)
    writer.submit("a", "cruise.set", 10)
    writer.submit("b", "cruise.set", 11)  # waits
    writer.submit("c", "cruise.set", 12)  # replaces b
    writer.submit("d", "lights.toggle")   # other actions go straight in
    files = sorted(p.name for p in (tmp_path / "cmd").iterdir())
    assert files == ["1.xml", "2.xml"]
    assert attrs(tmp_path / "cmd" / "2.xml")["action"] == "TOGGLE_LIGHTS"
    assert [(a["data"]["ref"], a["data"]["ok"], a["data"]["reason"]) for a in acks] == [("b", True, "superseded")]
    # the mod answers 1: the waiting one (12) goes in
    writer.on_ack({"id": 1, "ok": True})
    assert attrs(tmp_path / "cmd" / "3.xml")["value"] == "12.000"
    assert attrs(tmp_path / "cmd" / "3.xml")["ref"] == "c"
    writer.on_ack({"id": 2, "ok": True})  # the lights: nothing waiting moves
    writer.on_ack({"id": 3, "ok": True})
    writer.submit("e", "cruise.set", 13)
    assert attrs(tmp_path / "cmd" / "4.xml")["value"] == "13.000"


def test_relay_passes_the_value_on():
    relay = WebSocketRelay("ws://h", "1", Outbox())
    got = []
    relay.on_command = lambda ref, action, value: got.append((ref, action, value))
    relay.handle_message('{"type": "command", "ref": "4", "action": "cruise.set", "value": 21}')
    relay.handle_message('{"type": "command", "ref": "5", "action": "lights.toggle"}')
    assert got == [("4", "cruise.set", 21), ("5", "lights.toggle", None)]
