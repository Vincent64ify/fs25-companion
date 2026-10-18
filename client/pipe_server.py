"""Windows named pipe server for the FS25 telemetry pipe.

The in-game mod is the pipe *client*: it connects to our pipe instance,
writes telemetry, and re-opens the connection roughly every 1.6 s (the mod
closes and re-opens the pipe every 100 updates). We therefore run a loop:

    create instance (CreateNamedPipeW)
    -> read until the game disconnects
    -> create a new instance
    -> repeat

Either start order works: if the game starts first, its io.open() simply
fails until our instance exists.

The pipe is created with CreateNamedPipeW (the dedicated pipe-creation API;
CreateFileW-based creation proved unreliable across Windows setups) in
byte mode (message mode broke when the game sent a message larger than
the read buffer).

Windows only (FS25's named-pipe IPC is Windows-only; a UDP mode is on the
roadmap).
"""

import ctypes
import logging
import time
from ctypes import wintypes

log = logging.getLogger("companion.pipe")

PIPE_ACCESS_INBOUND = 1          # data flows game -> us
# byte mode: no message boundaries, so ReadFile can never fail with
# ERROR_INVALID_DATA over a large message. The parser in protocol.py is
# stream-based and re-syncs on HEADER tokens, so it doesn't need them.
PIPE_TYPE_BYTE = 0x00
PIPE_READMODE_BYTE = 0x00
PIPE_WAIT = 0x00
MAX_INSTANCES = 1
IN_BUFFER = 65536

ERROR_BROKEN_PIPE = 0x0000000E
ERROR_INVALID_DATA = 0x0000006D
ERROR_NO_DATA = 0x00000218
ERROR_PIPE_NOT_CONNECTED = 0x00000274

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
kernel32.CreateNamedPipeW.restype = wintypes.HANDLE
kernel32.CreateNamedPipeW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
    wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
    wintypes.DWORD, ctypes.c_void_p,
]
kernel32.ReadFile.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p,
]
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.GetNamedPipeInfo.restype = wintypes.BOOL
kernel32.GetNamedPipeInfo.argtypes = [
    wintypes.HANDLE, wintypes.LPDWORD, wintypes.LPDWORD,
    wintypes.LPDWORD, wintypes.LPDWORD, wintypes.LPDWORD,
]


class NamedPipeServer:
    def __init__(self, pipe_name: str, on_data):
        """
        :param pipe_name: full pipe path, e.g. ``\\\\.\\pipe\\fssimx``
        :param on_data: callable(bytes) invoked for every chunk read
        """
        self.pipe_name = pipe_name
        self.on_data = on_data
        self._stop = False

    def stop(self) -> None:
        self._stop = True

    def run(self) -> None:
        """Blocking loop; run in a daemon thread."""
        log.info("waiting for game on %s", self.pipe_name)
        while not self._stop:
            try:
                handle = self._create_instance()
            except OSError as e:
                log.error("CreateNamedPipeW failed: %s", e)
                time.sleep(1.0)
                continue

            if not self._owns_pipe_object(handle):
                log.warning(
                    "pipe object already exists with more than 1 instance "
                    "(created by the game) — this instance may not receive "
                    "data. Fix: stop the client, wait 2 s, restart it "
                    "(with the game closed for a guaranteed clean state).")

            try:
                while not self._stop:
                    chunk = self._read(handle)
                    if chunk == b"":
                        break  # game disconnected (expected, it re-opens)
                    self.on_data(chunk)
            finally:
                kernel32.CloseHandle(handle)
            log.debug("game disconnected, waiting for reconnect")

    def _create_instance(self):
        """Create a new pipe instance (non-blocking; ReadFile waits for
        the game to connect)."""
        handle = kernel32.CreateNamedPipeW(
            self.pipe_name,
            PIPE_ACCESS_INBOUND,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            MAX_INSTANCES,
            0,            # out buffer (unused for INBOUND)
            IN_BUFFER,
            0,            # no default timeout
            None,
        )
        if handle is None or handle == ctypes.c_size_t(-1).value:
            raise OSError(ctypes.get_last_error(), "CreateNamedPipeW")
        return handle

    def _owns_pipe_object(self, handle) -> bool:
        """True if this instance is the sole instance of the pipe object
        (i.e. we created the object with max 1)."""
        vals = [wintypes.DWORD(0) for _ in range(5)]
        if not kernel32.GetNamedPipeInfo(
                handle, *(ctypes.byref(v) for v in vals)):
            return False
        return vals[0].value == 1  # maxCollectionCount

    def _read(self, handle) -> bytes:
        """Read one chunk; returns b'' when the instance is dead or the
        connected client disconnected.

        "No data yet" (NO_DATA 536) and the intermittent INVALID_DATA (109)
        are NOT errors — keep waiting on the SAME instance. This matters:
        tearing the instance down destroys the pipe object (max 1 instance),
        which lets the game's io.open create its own pipe instances that we
        cannot read. A stable, always-present instance forces the game to
        connect to it as a client (proven by pipe_probe.py).
        """
        buf = ctypes.create_string_buffer(65536)
        read = wintypes.DWORD(0)
        while not self._stop:
            ok = kernel32.ReadFile(handle, buf, 65536, ctypes.byref(read), None)
            if ok:
                return buf.raw[:read.value]
            err = ctypes.get_last_error()
            if err in (ERROR_BROKEN_PIPE, ERROR_PIPE_NOT_CONNECTED):
                return b""
            # Other errors: the instance may have been destroyed out from
            # under us (e.g. the game exited and took the pipe object with
            # it). Verify before deciding whether to keep waiting.
            vals = [wintypes.DWORD(0) for _ in range(5)]
            if not kernel32.GetNamedPipeInfo(
                    handle, *(ctypes.byref(v) for v in vals)):
                log.debug("pipe instance dead (error %d) — recreating", err)
                return b""
            time.sleep(0.05)
        return b""
