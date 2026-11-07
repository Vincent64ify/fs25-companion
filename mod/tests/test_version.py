"""hello's modVersion is Companion.VERSION (mod/src/Companion.lua): it must
be the version in mod/modDesc.xml, which every mod change bumps."""

import re
from pathlib import Path

MOD = Path(__file__).resolve().parents[1]


def test_companion_version_is_moddesc_version():
    desc = re.search(r"<version>([^<]+)</version>", (MOD / "modDesc.xml").read_text(encoding="utf-8"))
    lua = re.search(r'^Companion\.VERSION = "([^"]+)"', (MOD / "src" / "Companion.lua").read_text(encoding="utf-8"),
                    re.MULTILINE)
    assert desc and lua
    assert lua.group(1) == desc.group(1), "bump Companion.VERSION with modDesc.xml's <version>"
