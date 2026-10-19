"""Map sync: make sure the dashboard has assets for the current savegame.

Thin wrapper around builder/import_map.py (kept importable). Runs at
client startup: reads the most recent savegame's careerSavegame.xml,
extracts/converts that map's PDA image and writes web/maps/<mapId>.json.

Everything is cached — this is a no-op once the assets exist and the
source image did not change. Failures are non-fatal (the dashboard just
falls back to a mapless view and logs a hint).
"""

import logging
import sys
from pathlib import Path

log = logging.getLogger("companion.map_sync")

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "builder"))

import import_map  # noqa: E402


def ensure_current_map() -> None:
    """Best-effort: import the current savegame's map into web/maps."""
    try:
        import_map.sync_current_map(quiet=False)
    except SystemExit as e:            # import_map signals problems this way
        log.warning("map sync skipped: %s", e)
    except Exception:
        log.warning("map sync failed", exc_info=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ensure_current_map()
