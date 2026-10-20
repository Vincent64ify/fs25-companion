"""Runs mod/tests/run.lua through lupa, so `pytest` covers the mod too.

Skipped when lupa isn't installed (`pip install lupa`); `lua mod/tests/run.lua`
works without Python. run.lua raises on any failed test.
"""

from pathlib import Path

import pytest

lupa = pytest.importorskip("lupa")

MOD_ROOT = Path(__file__).resolve().parent.parent


def test_lua_suite(tmp_path):
    (tmp_path / "FS25_Companion").mkdir()
    lua = lupa.LuaRuntime()
    lua.globals().MOD_ROOT = MOD_ROOT.as_posix() + "/"
    lua.globals().TMP_DIR = tmp_path.as_posix()
    lua.execute((MOD_ROOT / "tests" / "run.lua").read_text(encoding="utf-8"))
