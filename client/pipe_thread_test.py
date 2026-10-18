#!/usr/bin/env python3
r"""Minimal client replica: creates the fssimx pipe EXACTLY like the real
client does (byte mode, max 1 instance, ReadFile on a worker thread), but
with NO asyncio and NO relay — it just prints what arrives.

Run with the game running and NO other client/probe running:
    python pipe_thread_test.py

If the game connects here but not to the real client, the difference is in
the client process (asyncio/relay), not the pipe setup.
"""

import ctypes
import threading
import time
from ctypes import wintypes

NAME = "\\\\.\\pipe\\fssimx"

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.CreateNamedPipeW.restype = wintypes.HANDLE
k32.CreateNamedPipeW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
    wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
]
k32.ReadFile.restype = wintypes.BOOL
k32.ReadFile.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p,
]
k32.CloseHandle.argtypes = [wintypes.HANDLE]


def main():
    # Identical parameters to pipe_server.py / pipe_probe.py:
    # INBOUND, BYTE type + BYTE readmode + WAIT, max 1 instance, 64 KiB.
    h = k32.CreateNamedPipeW(NAME, 1, 0, 1, 0, 65536, 0, None)
    if h is None or h == ctypes.c_size_t(-1).value:
        print(f"create failed: error {ctypes.get_last_error()}")
        return
    print("instance created (byte mode, max 1) — waiting 45 s", flush=True)

    def reader():
        buf = ctypes.create_string_buffer(65536)
        n = wintypes.DWORD(0)
        ok = k32.ReadFile(h, buf, 65536, ctypes.byref(n), None)
        if ok:
            print(f"READ {n.value} bytes: {buf.raw[:n.value][:120]!r}",
                  flush=True)
        else:
            print(f"read error {ctypes.get_last_error()}", flush=True)

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    t.join(45)
    k32.CloseHandle(h)
    print("done")


if __name__ == "__main__":
    main()
