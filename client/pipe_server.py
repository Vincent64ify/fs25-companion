"""Windows named pipe server for the FS25 telemetry pipe.

The in-game mod is the pipe *client*: it connects to our pipe instance,
writes telemetry, and re-opens the connection roughly every 1.6 s (the mod
closes and re-opens the pipe every 100 updates). We therefore run a loop:

    create instance (CreateNamedPipeW)
    -> read until the game disconnects
    -> create a new instance
    -> repeat

The pipe is created with CreateNamedPipeW (the dedicated pipe-creation API;
CreateFileW-based creation proved unreliable across Windows setups) in
byte mode (message mode broke when the game sent a message larger than
the read buffer).

Empirically (see the long debugging saga of 2026-10-18):
- The mod's io.open() only connects to pipe objects that come into
  existence WHILE the game process is running. A pipe object that already
  exists before the game starts is refused forever.
- Once the game's engine creates its own fssimx object (which happens when
  the mod finds no pipe), the engine's pipe subsystem gets stuck for that
  name until the game is restarted. So: never let the game run with no
  pipe present, and if it happens, restart the game.
- If we join the game's own pipe object (max > 1 instances), the mod
  connects to our waiting instance — that works too.

To cope with the game's pipe object appearing/disappearing between the
mod's refresh cycles, the instance is recreated every NO_DATA_TIMEOUT
seconds of silence.

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
PIPE_NOWAIT = 0x01
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

    # Recreate the instance after this much silence, so we re-join
    # whichever pipe object the game is currently using (the game's pipe
    # object can be created/destroyed between the mod's refresh cycles).
    NO_DATA_TIMEOUT = 15.0

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

            if self._owns_pipe_object(handle):
                log.info("created pipe object — waiting for game")
            else:
                log.info("joined the game's pipe object — waiting for mod")

            try:
                deadline = time.monotonic() + self.NO_DATA_TIMEOUT
                while not self._stop:
                    chunk = self._read(handle, deadline)
                    if chunk is None:      # no-data timeout -> re-join
                        log.info(
                            "no data for %.0fs — recreating pipe instance",
                            self.NO_DATA_TIMEOUT,
                        )
                        break
                    if chunk == b"":       # instance dead / game gone
                        break
                    deadline = time.monotonic() + self.NO_DATA_TIMEOUT
                    self.on_data(chunk)
            finally:
                kernel32.CloseHandle(handle)
            log.debug("pipe instance closed, recreating")
            time.sleep(0.2)

    def _create_instance(self):
        """Create a new pipe instance (non-blocking; ReadFile waits for
        the game to connect)."""
        # PIPE_NOWAIT: ReadFile returns whatever is available (or NO_DATA
        # immediately), so the no-data deadline in run() is actually
        # reachable while waiting for the game to connect.
        handle = kernel32.CreateNamedPipeW(
            self.pipe_name,
            PIPE_ACCESS_INBOUND,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_NOWAIT,
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

    def _read(self, handle, deadline) -> bytes | None:
        """Read one chunk.

        Returns bytes on data, b"" when the instance is dead or the game
        disconnected, and None when no data arrived before ``deadline``
        (the caller recreates the instance to re-join the game's current
        pipe object).

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
            if time.monotonic() > deadline:
                return None
            ok = kernel32.ReadFile(handle, buf, 65536, ctypes.byref(read), None)
            if ok:
                return buf.raw[:read.value]
            err = ctypes.get_last_error()
            if err in (ERROR_BROKEN_PIPE, ERROR_PIPE_NOT_CONNECTED):
                return b""
            if err == ERROR_NO_DATA:
                time.sleep(0.05)
                continue
            # Other errors (e.g. the intermittent 109): the instance may
            # have been destroyed out from under us. Verify before deciding
            # whether to keep waiting.
            vals = [wintypes.DWORD(0) for _ in range(5)]
            if not kernel32.GetNamedPipeInfo(
                    handle, *(ctypes.byref(v) for v in vals)):
                log.debug("pipe instance dead (error %d) — recreating", err)
                return b""
            time.sleep(0.05)
        return b""
