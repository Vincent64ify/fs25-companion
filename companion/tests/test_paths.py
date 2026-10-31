from pathlib import Path

from companion import paths


def make(p: Path) -> Path:
    p.mkdir(parents=True)
    return p


def test_windows_known_documents_folder_wins(tmp_path):
    docs = tmp_path / "OneDrive - Company" / "Documents"
    profile = make(docs / "My Games" / "FarmingSimulator2025")
    make(tmp_path / "home" / "Documents" / "My Games" / "FarmingSimulator2025")
    found = paths.find_profile_dir(platform="win32", home=tmp_path / "home", documents=docs)
    assert found == profile


def test_windows_falls_back_to_home_documents(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "windows_documents", lambda: None)
    profile = make(tmp_path / "Documents" / "My Games" / "FarmingSimulator2025")
    assert paths.find_profile_dir(platform="win32", home=tmp_path, documents=None) == profile


def test_windows_onedrive_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "windows_documents", lambda: None)
    profile = make(tmp_path / "OneDrive" / "Documents" / "My Games" / "FarmingSimulator2025")
    assert paths.find_profile_dir(platform="win32", home=tmp_path, documents=None) == profile


def test_macos_application_support(tmp_path):
    profile = make(tmp_path / "Library" / "Application Support" / "FarmingSimulator2025")
    assert paths.find_profile_dir(platform="darwin", home=tmp_path) == profile


def test_macos_app_store_container(tmp_path):
    profile = make(tmp_path / "Library" / "Containers" / "com.giants.fs25" / "Data" /
                   "Library" / "Application Support" / "FarmingSimulator2025")
    assert paths.find_profile_dir(platform="darwin", home=tmp_path) == profile


def test_not_found(tmp_path):
    assert paths.find_profile_dir(platform="darwin", home=tmp_path) is None
    assert paths.find_profile_dir(platform="win32", home=tmp_path, documents=tmp_path) is None


def test_stream_path(tmp_path):
    assert paths.stream_path(tmp_path) == \
        tmp_path / "modSettings" / "FS25_Companion" / "stream.ndjson"
