#!/usr/bin/env python3
r"""Diagnostic: which CreateFileW combination can create \\.\pipe\fssimx?

Run on the Windows machine with the game NOT running and no other
companion client processes alive:

    python diagnose_pipe.py

Each attempt runs in a thread with a short timeout, because a *successful*
creation blocks until a client connects. Interpret the output:

  blocked (waiting for client)   -> SUCCESS: this combination creates the
                                    pipe; the client code should use it
  created (connected)            -> a pipe instance already exists (a
                                    leftover process is holding it)
  error N                        -> CreateFileW failed with Win32 error N
                                    (2 = FILE_NOT_FOUND, 5 = ACCESS_DENIED)
"""

import ctypes
import threading
from ctypes import wintypes

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
OPEN_EXISTING = 3
FILE_FLAG_FIRST_PIPE_INSTANCE = 0x00000008
FILE_FLAG_WRITE_THROUGH = 0x00000002
INVALID_HANDLE_VALUE = ctypes.c_size_t(-1).value

NAME = "\\\\.\\pipe\\fssimx"

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.CreateFileW.restype = wintypes.HANDLE
k32.CreateFileW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
    ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
]
k32.CloseHandle.argtypes = [wintypes.HANDLE]

ATTEMPTS = [
    ("READ, flags=0",
     GENERIC_READ, 0),
    ("READ, FIRST_PIPE_INSTANCE",
     GENERIC_READ, FILE_FLAG_FIRST_PIPE_INSTANCE),
    ("READ|WRITE, FIRST_PIPE_INSTANCE  (.NET combination)",
     GENERIC_READ | GENERIC_WRITE, FILE_FLAG_FIRST_PIPE_INSTANCE),
    ("READ|WRITE, FIRST_PIPE_INSTANCE|WRITE_THROUGH",
     GENERIC_READ | GENERIC_WRITE,
     FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_WRITE_THROUGH),
]


def attempt(access, flags, timeout=2.0):
    result = {}

    def run():
        h = k32.CreateFileW(NAME, access, 0, None, OPEN_EXISTING, flags, None)
        if h is None or h == INVALID_HANDLE_VALUE:
            result["status"] = f"error {ctypes.get_last_error()}"
        else:
            result["status"] = "created (connected to existing instance)"
            result["handle"] = h

    t = threading.Thread(target=run, daemon=True)
    t.start()
    t.join(timeout)

    if "status" not in result:
        # still blocked inside CreateFileW: the pipe was created and the
        # call is waiting for a client — that's a success
        return "blocked (waiting for client) — SUCCESS"

    handle = result.get("handle")
    if handle:
        k32.CloseHandle(handle)
    return result["status"]


if __name__ == "__main__":
    print(f"probing {NAME}\n")
    for label, access, flags in ATTEMPTS:
        status = attempt(access, flags)
        print(f"  {label:50s} -> {status}")
