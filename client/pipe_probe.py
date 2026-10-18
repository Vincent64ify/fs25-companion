#!/usr/bin/env python3
r"""Probe the fssimx pipe while the game is running.

Creates the pipe the same way the client does, then for ~60 s (or Ctrl+C):
  - prints every successful read (first bytes of the data)
  - on any unexpected ReadFile failure, dumps GetNamedPipeInfo +
    PeekNamedPipe (is a client connected? what's buffered?) and retries
    with smaller read buffers

Run with the game RUNNING (mod enabled) and NO companion client running:
    python pipe_probe.py
"""

import ctypes
import time
from ctypes import wintypes

PIPE_ACCESS_INBOUND = 1
PIPE_TYPE_BYTE = 0x00
PIPE_READMODE_BYTE = 0x00
INVALID_HANDLE_VALUE = ctypes.c_size_t(-1).value
ERROR_NO_DATA = 0x00000218

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.CreateNamedPipeW.restype = wintypes.HANDLE
k32.CreateNamedPipeW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
    wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
    wintypes.DWORD, ctypes.c_void_p,
]
k32.ReadFile.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p,
]
k32.CloseHandle.argtypes = [wintypes.HANDLE]
k32.GetNamedPipeInfo.restype = wintypes.BOOL
k32.GetNamedPipeInfo.argtypes = [
    wintypes.HANDLE, wintypes.LPDWORD, wintypes.LPDWORD,
    wintypes.LPDWORD, wintypes.LPDWORD, wintypes.LPDWORD,
]
k32.PeekNamedPipe.restype = wintypes.BOOL
k32.PeekNamedPipe.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
    wintypes.LPDWORD, wintypes.LPDWORD, wintypes.LPDWORD,
]

NAME = "\\\\.\\pipe\\fssimx"


def pipe_info(h):
    vals = [wintypes.DWORD(0) for _ in range(5)]
    if k32.GetNamedPipeInfo(h, *(ctypes.byref(v) for v in vals)):
        return (f"maxInst={vals[0].value} currInst={vals[1].value} "
                f"bufSize={vals[2].value} readAvail={vals[3].value} "
                f"written={vals[4].value}")
    return f"GetNamedPipeInfo error {ctypes.get_last_error()}"


def peek(h, size=256):
    buf = ctypes.create_string_buffer(size)
    n = wintypes.DWORD(0)
    total = wintypes.DWORD(0)
    left = wintypes.DWORD(0)
    if k32.PeekNamedPipe(h, buf, size, ctypes.byref(n),
                         ctypes.byref(total), ctypes.byref(left)):
        return (f"peeked {n.value} bytes (total {total.value}, "
                f"leftInMsg {left.value}): {buf.raw[:n.value][:120]!r}")
    return f"PeekNamedPipe error {ctypes.get_last_error()}"


def main():
    deadline = time.time() + 60
    reads = 0
    while time.time() < deadline:
        h = k32.CreateNamedPipeW(NAME, PIPE_ACCESS_INBOUND,
                                 PIPE_TYPE_BYTE | PIPE_READMODE_BYTE,
                                 1, 0, 65536, 0, None)
        if h is None or h == INVALID_HANDLE_VALUE:
            print(f"create failed: {ctypes.get_last_error()}")
            time.sleep(0.5)
            continue
        print("instance created, waiting for game...")
        while time.time() < deadline:
            buf = ctypes.create_string_buffer(65536)
            n = wintypes.DWORD(0)
            ok = k32.ReadFile(h, buf, 65536, ctypes.byref(n), None)
            if ok:
                reads += 1
                print(f"READ {n.value} bytes: {buf.raw[:n.value][:160]!r}")
                continue
            err = ctypes.get_last_error()
            if err == ERROR_NO_DATA:
                time.sleep(0.1)  # nobody connected yet; keep waiting quietly
                continue
            print(f"\nReadFile error {err}")
            print("  info:", pipe_info(h))
            print("  peek:", peek(h))
            for size in (4096, 256):
                buf2 = ctypes.create_string_buffer(size)
                n2 = wintypes.DWORD(0)
                ok2 = k32.ReadFile(h, buf2, size, ctypes.byref(n2), None)
                if ok2:
                    print(f"  retry@{size}: READ {n2.value} bytes: "
                          f"{buf2.raw[:n2.value][:160]!r}")
                    break
                print(f"  retry@{size}: error {ctypes.get_last_error()}")
            print("  -> tearing down instance\n")
            break
        k32.CloseHandle(h)
    print(f"done, {reads} reads total")


if __name__ == "__main__":
    main()
