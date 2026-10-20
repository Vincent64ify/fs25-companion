#!/usr/bin/env python3
"""Zip the companion mod, and optionally install it.

    python scripts/build_mod.py              # -> dist/FS25_Companion.zip
    python scripts/build_mod.py --install    # also copy it into FS25's mods/

FS25 names a mod after its zip, so the file must stay FS25_Companion.zip.
"""

import argparse
import shutil
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MOD_DIR = REPO / "mod"
DIST = REPO / "dist"
ZIP_NAME = "FS25_Companion.zip"

sys.path.insert(0, str(REPO / "client"))
import paths  # noqa: E402


def mod_files():
    yield MOD_DIR / "modDesc.xml"
    yield MOD_DIR / "icon.png"
    yield from sorted((MOD_DIR / "src").rglob("*.lua"))


def build() -> Path:
    DIST.mkdir(exist_ok=True)
    out = DIST / ZIP_NAME
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in mod_files():
            z.write(f, f.relative_to(MOD_DIR).as_posix())
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--install", action="store_true", help="copy the zip into FS25's mods folder")
    p.add_argument("--profile-dir", type=Path, default=None,
                   help="FS25 profile folder (default: found automatically)")
    args = p.parse_args()

    out = build()
    print(f"built {out}")
    if args.install:
        profile = args.profile_dir or paths.find_profile_dir()
        if profile is None:
            sys.exit("FS25 profile folder not found; pass --profile-dir")
        dest = profile / "mods" / ZIP_NAME
        shutil.copy2(out, dest)
        print(f"installed {dest}")


if __name__ == "__main__":
    main()
