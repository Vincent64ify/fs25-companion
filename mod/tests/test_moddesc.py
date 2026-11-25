"""Every Lua file under mod/src is in modDesc.xml's list, Companion.lua
last (specs/0022): the tests load the files themselves, so a file left out
of the list passes them and never loads in the game."""

import re
from pathlib import Path

MOD = Path(__file__).resolve().parent.parent


def test_every_source_file_is_listed():
    desc = (MOD / "modDesc.xml").read_text(encoding="utf-8")
    listed = re.findall(r'<sourceFile filename="([^"]+)"', desc)
    files = sorted(p.relative_to(MOD).as_posix() for p in (MOD / "src").rglob("*.lua"))
    assert sorted(listed) == files
    assert len(listed) == len(set(listed)), "a file listed twice"
    assert listed[-1] == "src/Companion.lua"
