"""web/fixtures/rigs/ (specs/0003) are what the mod's Cab collector makes of
spike 0.0.4's rig dumps: regenerate with `python fixtures/rig_fixtures.py`
when the mod or the dumps change."""

import sys
from pathlib import Path

import pytest

pytest.importorskip("lupa")

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "fixtures"))

import rig_fixtures  # noqa: E402


def test_rig_fixtures_are_up_to_date():
    assert rig_fixtures.main(["--check"]) == 0
