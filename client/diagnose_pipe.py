#!/usr/bin/env python3
r"""Pipe diagnostic v2.

Tests whether named pipes work at all on this machine:

  1. CreateNamedPipeW (the dedicated pipe-creation API) with a unique
     name, then a full client<->server round trip (client connects,
     writes, server reads).
  2. CreateNamedPipeW with the real fssimx name.
  3. The CreateFileW creation variant that the earlier diagnostic used,
     with a unique name (to compare mechanisms).

Run on the Windows machine with the game NOT running and no companion
client processes alive:

    python diagnose_pipe.py
"""

import ctypes
import random
import threading
import time
from ctypes import wintypes

GENERIC_WRITE = 0x40000000
GENERIC_READ_WRITE = 0xC0000000
OPEN_EXISTING = 3
FILE_FLAG_FIRST_PIPE_INSTANCE = 0x00000008
INVALID_HANDLE_VALUE = ctypes.c_size_t(-1).value

PIPE_ACCESS_INBOUND = 1
PIPE_TYPE_MESSAGE = 0x04
PIPE_READMODE_MESSAGE = 0x02

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.CreateNamedPipeW.restype = wintypes.HANDLE
k32.CreateNamedPipeW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
    wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
    wintypes.DWORD, ctypes.c_void_p,
]
k32.CreateFileW.restype = wintypes.HANDLE
k32.CreateFileW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
    ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
]
k32.ReadFile.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p,
]
k32.WriteFile.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p,
]
k32.CloseHandle.argtypes = [wintypes.HANDLE]


def err():
    return ctypes.get_last_error()


def make_named_pipe(name):
    h = k32.CreateNamedPipeW(
        name, PIPE_ACCESS_INBOUND,
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE,
        1, 0, 65536, 0, None)
    if h is None or h == INVALID_HANDLE_VALUE:
        return None, err()
    return h, None


def client_connect(name):
    h = k32.CreateFileW(name, GENERIC_WRITE, 0, None, OPEN_EXISTING, 0, None)
    if h is None or h == INVALID_HANDLE_VALUE:
        return None, err()
    return h, None


def round_trip(tag):
    name = f"\\\\.\\pipe\\fsc-diag-{tag}"
    srv, e = make_named_pipe(name)
    if srv is None:
        print(f"  CreateNamedPipeW(unique name)            -> error {e}")
        return
    print(f"  CreateNamedPipeW(unique name)            -> OK (instance created)")

    data = {}

    def reader():
        buf = ctypes.create_string_buffer(256)
        n = wintypes.DWORD(0)
        ok = k32.ReadFile(srv, buf, 256, ctypes.byref(n), None)
        data["read"] = buf.raw[:n.value] if ok else f"error {err()}"

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    time.sleep(0.2)

    cli, e = client_connect(name)
    if cli is None:
        print(f"  CreateFileW client connect              -> error {e}")
        k32.CloseHandle(srv)
        return
    print(f"  CreateFileW client connect              -> OK")

    msg = b"hello"
    n = wintypes.DWORD(0)
    k32.WriteFile(cli, msg, len(msg), ctypes.byref(n), None)
    t.join(2.0)
    got = data.get("read", "timeout")
    ok_mark = "OK" if got == b"hello" else "MISMATCH"
    print(f"  round trip (client wrote, server read)  -> {got!r} [{ok_mark}]")

    k32.CloseHandle(cli)
    k32.CloseHandle(srv)


def createfile_variant(tag):
    name = f"\\\\.\\pipe\\fsc-diag-cf-{tag}"
    result = {}

    def run():
        h = k32.CreateFileW(name, GENERIC_READ_WRITE, 0, None,
                            OPEN_EXISTING, FILE_FLAG_FIRST_PIPE_INSTANCE, None)
        if h is None or h == INVALID_HANDLE_VALUE:
            result["r"] = f"error {err()}"
        else:
            result["r"] = "OK (created, waiting for client)"
            result["h"] = h

    t = threading.Thread(target=run, daemon=True)
    t.start()
    t.join(1.5)
    status = result.get("r", "blocked in CreateFileW (created, waiting) — OK")
    if result.get("h"):
        k32.CloseHandle(result["h"])
    print(f"  CreateFileW + FIRST_PIPE_INSTANCE (unique) -> {status}")


if __name__ == "__main__":
    tag = random.randint(1000, 9999)
    print(f"== 1. CreateNamedPipeW + full round trip (tag {tag}) ==")
    round_trip(tag)
    print()
    print("== 2. CreateNamedPipeW with the real name ==")
    h, e = make_named_pipe("\\\\.\\pipe\\fssimx")
    if h is None:
        print(f"  CreateNamedPipeW(\\\\.\\pipe\\fssimx)          -> error {e}")
    else:
        print(f"  CreateNamedPipeW(\\\\.\\pipe\\fssimx)          -> OK (instance created)")
        k32.CloseHandle(h)
    print()
    print("== 3. CreateFileW creation variant (unique name) ==")
    createfile_variant(tag)
