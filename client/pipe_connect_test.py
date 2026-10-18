#!/usr/bin/env python3
r"""Connect test: does the live client's fssimx instance accept a client
connection (what the game's io.open must be doing)?

Run while the companion client is RUNNING (game may be running or not):
    python pipe_connect_test.py
"""

import ctypes
import threading
from ctypes import wintypes

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
OPEN_EXISTING = 3
INVALID_HANDLE_VALUE = ctypes.c_size_t(-1).value
NAME = "\\\\.\\pipe\\fssimx"

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.CreateFileW.restype = wintypes.HANDLE
k32.CreateFileW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
    ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
]
k32.CloseHandle.argtypes = [wintypes.HANDLE]


def try_connect(access, label):
    result = {}

    def run():
        h = k32.CreateFileW(NAME, access, 0, None, OPEN_EXISTING, 0, None)
        if h is None or h == INVALID_HANDLE_VALUE:
            result["r"] = f"error {ctypes.get_last_error()}"
        else:
            result["r"] = "connected"
            result["h"] = h

    t = threading.Thread(target=run, daemon=True)
    t.start()
    t.join(3.0)
    status = result.get("r", "blocked (instance busy with another client)")
    if result.get("h"):
        k32.CloseHandle(result["h"])
    print(f"  {label:40s} -> {status}")


if __name__ == "__main__":
    print(f"connect test for {NAME} (companion client must be running)\n")
    try_connect(GENERIC_WRITE, "GENERIC_WRITE (what io.open 'w' wants)")
    try_connect(GENERIC_READ | GENERIC_WRITE, "GENERIC_READ|GENERIC_WRITE")
