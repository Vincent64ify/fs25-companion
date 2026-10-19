"""Round-trip test for NamedPipeServer (the pipe_loop.py protocol).

Started with the version of the server current on 2026-10-19: blocking
ReadFile on the loop thread, instance recreated only on disconnect. A
fake "game" thread mimics the mod's behavior — connect, write one frame,
close, wait, repeat.

Windows only:
    py.exe -m pytest tests/test_pipe_roundtrip.py -v
"""

import sys
import threading
import time

import pytest

from pipe_server import NamedPipeServer

PIPE_NAME = "\\\\.\\pipe\\fsc-test-roundtrip"


def fake_game(pipe_name, frames, interval, stop):
    """Mimic the mod: io.open (CreateFileW), write, close, repeat."""
    import ctypes
    from ctypes import wintypes

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateFileW.restype = wintypes.HANDLE
    k32.CreateFileW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
        ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
    ]
    k32.WriteFile.argtypes = [
        wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p,
    ]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]

    OPEN_EXISTING = 3
    GENERIC_WRITE = 0x40000000
    INVALID = ctypes.c_size_t(-1).value

    while not stop.is_set():
        h = k32.CreateFileW(pipe_name, GENERIC_WRITE, 0, None,
                            OPEN_EXISTING, 0, None)
        if h is None or h == INVALID:
            time.sleep(0.05)   # instance not up yet — like the mod's retry
            continue
        wrote = wintypes.DWORD(0)
        for frame in frames:
            k32.WriteFile(h, frame, len(frame), ctypes.byref(wrote), None)
        k32.CloseHandle(h)     # disconnect — server should recreate
        for _ in range(int(interval / 0.05)):
            if stop.is_set():
                return
            time.sleep(0.05)


@pytest.mark.skipif(sys.platform != "win32", reason="Windows named pipes")
def test_frames_are_relayed_across_reconnects():
    frames = [b"HEADER<a<b<", b"BODY<1<2<", b"BODY<3<4<"]
    received = []
    server = NamedPipeServer(PIPE_NAME, received.append)
    stop = threading.Event()
    t_server = threading.Thread(target=server.run, daemon=True)
    t_game = threading.Thread(target=fake_game, daemon=True,
                              args=(PIPE_NAME, frames, 0.3, stop))
    t_server.start()
    t_game.start()

    deadline = time.monotonic() + 10
    completed = 0
    while time.monotonic() < deadline and completed < 3:
        time.sleep(0.1)
        joined = b"".join(received)
        completed = joined.count(b"BODY<3<4<")   # full frame sets seen

    stop.set()
    assert completed >= 3, f"server relayed {completed} frame sets; got " \
                           f"{received[:5] if received else 'NOTHING'}"
