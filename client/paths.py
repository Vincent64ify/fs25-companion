"""Find the FS25 profile folder and the mod's stream file.

The profile folder holds mods/, savegames and modSettings/. No game install
path is needed: the mod reports map paths itself in its hello message.

* Windows: Documents/My Games/FarmingSimulator2025. Documents is resolved
  with SHGetKnownFolderPath, which follows OneDrive and other redirections.
* macOS: ~/Library/Application Support/FarmingSimulator2025, or the Mac App
  Store container ~/Library/Containers/*/Data/Library/Application Support/...

Pass --profile-dir (or --stream) to the client to skip discovery.
"""

import sys
from pathlib import Path
from typing import List, Optional

GAME_DIR_NAME = "FarmingSimulator2025"
STREAM_RELATIVE = Path("modSettings") / "FS25_Companion" / "stream.ndjson"

_FOLDERID_DOCUMENTS = "FDD39AD0-238F-46AF-ADB4-6C85480369C7"


def windows_documents() -> Optional[Path]:
    """The user's Documents folder as Windows itself resolves it."""
    if sys.platform != "win32":
        return None
    import ctypes
    import uuid

    guid = (ctypes.c_char * 16).from_buffer_copy(uuid.UUID(_FOLDERID_DOCUMENTS).bytes_le)
    path_ptr = ctypes.c_wchar_p()
    try:
        hr = ctypes.windll.shell32.SHGetKnownFolderPath(
            ctypes.byref(guid), 0, None, ctypes.byref(path_ptr))
    except (AttributeError, OSError):
        return None
    if hr != 0 or not path_ptr.value:
        return None
    try:
        return Path(path_ptr.value)
    finally:
        ctypes.windll.ole32.CoTaskMemFree(path_ptr)


def candidate_profile_dirs(platform: str = sys.platform, home: Optional[Path] = None,
                           documents: Optional[Path] = None) -> List[Path]:
    """Where the profile folder may be, most likely first."""
    home = home or Path.home()
    if platform == "darwin":
        support = Path("Library") / "Application Support" / GAME_DIR_NAME
        containers = sorted((home / "Library" / "Containers").glob(
            f"*/Data/Library/Application Support/{GAME_DIR_NAME}"))
        return [home / support, *containers]

    if documents is None and platform == "win32":
        documents = windows_documents()
    my_games = Path("My Games") / GAME_DIR_NAME
    out = []
    if documents is not None:
        out.append(documents / my_games)
    out += [home / "Documents" / my_games, home / "OneDrive" / "Documents" / my_games]
    return list(dict.fromkeys(out))


def find_profile_dir(**kwargs) -> Optional[Path]:
    for candidate in candidate_profile_dirs(**kwargs):
        if candidate.is_dir():
            return candidate
    return None


def stream_path(profile_dir: Path) -> Path:
    return Path(profile_dir) / STREAM_RELATIVE
