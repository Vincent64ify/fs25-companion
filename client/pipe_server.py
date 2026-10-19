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

To cope with any pipe object changes between the mod's refresh cycles the
instance is recreated on every disconnect (the mod re-opens the pipe
every RefreshRate updates, so recreate cycles are frequent and fresh).

Empirically (probe session of 2026-10-19): a blocking ReadFile on the
loop thread streamed the game's telemetry continuously (1286 frames in
~90 s), and after each teardown the game's next open succeeded
instantly. NO no-data deadline is used: the earlier threaded-read +
timer-recreate design closed the handle while a pending helper read
pinned the (single) instance, the game's subsequent opens failed with a
busy pipe until the zombie read resolved, and no bytes ever arrived.

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

    def stop(self) -> None:
        self._stop = True

    def run(self) -> None:
        """Blocking loop; run in a daemon thread.

        Replicates pipe_probe.py 1:1 — the empirically proven
        configuration: blocking ReadFile on the loop thread itself, and
        the instance is recreated only on a disconnect (the mod closes
        and re-opens its handle every RefreshRate updates) or a dead
        pipe. The game reconnects immediately after each recreate.
        """
        log.info("waiting for game on %s", self.pipe_name)
        first_create = True
        while not self._stop:
            try:
                handle = self._create_instance()
            except OSError as e:
                log.error("CreateNamedPipeW failed: %s", e)
                time.sleep(1.0)
                continue

            if first_create:
                log.info("created pipe object — waiting for game")
                first_create = False
            else:
                log.debug(
                    "recreated pipe instance — waiting for game (owned: %s)",
                    self._owns_pipe_object(handle))

            try:
                while not self._stop:
                    chunk = self._read(handle)
                    if chunk is None:      # unexpected error, same handle
                        time.sleep(0.05)
                        continue
                    if chunk == b"":       # disconnect / instance dead
                        break
                    self.on_data(chunk)
            finally:
                kernel32.CloseHandle(handle)

    def _create_instance(self):
        """Create a new pipe instance (non-blocking; ReadFile waits for
        the game to connect)."""
        # Byte mode + PIPE_WAIT, exactly like pipe_probe.py (the
        # configuration the game is proven to connect to). NOTE: do NOT add
        # PIPE_NOWAIT here — bit 0x01 is PIPE_TYPE_MESSAGE, so
        # BYTE|NOWAIT silently becomes a message-type pipe.
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

    def _read(self, handle) -> bytes | None:
        """Blocking read; called on the pipe thread.

        Returns bytes on data, b"" when the game disconnected or the
        instance died (caller recreates), and None for an unexpected
        (non-fatal) error — caller retries on the same handle after a
        short pause.

        Empirics from the probe dissociate the two outcomes: when the mod
        closes/re-opens its handle, the pending read fails with the
        intermittent ERROR_INVALID_DATA (109) or pipe-gone errors —
        recreating and re-waiting reconnects the game instantly.
        ERROR_NO_DATA (536) never appears on this byte+WAIT instance but
        is tolerated anyway. UNKNOWN errors are dead-checked via
        GetNamedPipeInfo before giving up the instance (see d09f05c).
        """
        buf = ctypes.create_string_buffer(IN_BUFFER)
        read = wintypes.DWORD(0)
        ok = kernel32.ReadFile(handle, buf, IN_BUFFER, ctypes.byref(read), None)
        if ok:
            return buf.raw[:read.value]

        err = ctypes.get_last_error()
        if err in (ERROR_INVALID_DATA, ERROR_BROKEN_PIPE,
                   ERROR_PIPE_NOT_CONNECTED):
            if err == ERROR_INVALID_DATA:
                log.debug("read gap (INVALID_DATA 109) — recreating instance")
            return b""

        if err == ERROR_NO_DATA:
            return None  # tolerate: "no data yet"

        # Other errors: verify whether the instance is still alive before
        # deciding to keep waiting.
        vals = [wintypes.DWORD(0) for _ in range(5)]
        if not kernel32.GetNamedPipeInfo(
                handle, *(ctypes.byref(v) for v in vals)):
            log.debug("pipe instance dead (error %d) — recreating", err)
            return b""
        log.debug("recoverable ReadFile error %d — staying on instance", err)
        return None
