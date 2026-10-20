"""Map sync: make sure the dashboard has assets for the map being played.

Thin wrapper around builder/import_map.py (kept importable). The client
calls it when the mod's hello names a map: it finds that map's XML (mod zip
or folder in mods/, or the base game's data/maps), converts the PDA
overview image and writes web/maps/<mapId>.json + .png.

Maps already in web/maps are skipped. Failures are non-fatal: the dashboard
just shows no background. Phase 2 replaces this with the paths from hello.
"""

import logging
import sys
from pathlib import Path
from typing import Optional

log = logging.getLogger("companion.map_sync")

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "builder"))

import import_map  # noqa: E402


def ensure_map(map_id: str, title: Optional[str] = None,
               profile_dir: Optional[Path] = None) -> None:
    """Best-effort: import one map's assets into web/maps."""
    if (import_map.WEB_MAPS / f"{map_id}.json").exists() and \
            (import_map.WEB_MAPS / f"{map_id}.png").exists():
        log.info("map %s: assets already in web/maps", map_id)
        return
    log.info("map %s: importing the overview image", map_id)
    try:
        import_map.sync_current_map(games_dir=profile_dir, map_id_arg=map_id,
                                    map_title_arg=title, quiet=True)
        log.info("map %s: imported", map_id)
    except SystemExit as e:            # import_map signals problems this way
        log.warning("map %s: no background image (%s)", map_id, e)
    except Exception:
        log.warning("map %s: import failed", map_id, exc_info=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ensure_map(sys.argv[1])
