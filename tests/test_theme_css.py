"""Every theme's stylesheet is flat CSS: braces balance, and no style rule
sits inside another one. A stray `.x {` once nested the rest of theme.css
under `.veh-card`, so none of it matched (the Loader cards lost their
surface after spec 0013)."""

import re
from pathlib import Path

import pytest

THEMES = sorted((Path(__file__).parent.parent / "web" / "src" / "themes").glob("*/*.css"))


def _blocks(css):
    """Yield (line, prelude, parent prelude) for each block that opens."""
    css = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), css, flags=re.S)
    css = re.sub(r"\"[^\"\n]*\"|'[^'\n]*'", lambda m: " " * len(m.group()), css)
    stack, start = [], 0
    for i, ch in enumerate(css):
        if ch == "{":
            prelude = css[start:i].split(";")[-1].strip()
            yield css.count("\n", 0, i) + 1, prelude, stack[-1] if stack else None
            stack.append(prelude)
            start = i + 1
        elif ch == "}":
            assert stack, f"line {css.count(chr(10), 0, i) + 1}: a '}}' with no '{{'"
            stack.pop()
            start = i + 1
    assert not stack, f"{len(stack)} block(s) never closed, first: {stack[0]!r}"


@pytest.mark.parametrize("path", THEMES, ids=lambda p: p.parent.name)
def test_theme_css_is_flat(path):
    for line, prelude, parent in _blocks(path.read_text(encoding="utf-8")):
        if parent is None or parent.startswith("@"):
            continue
        pytest.fail(f"{path.name}:{line}: {prelude!r} sits inside {parent!r}")
