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
CreateFileW-based creation proved unreliable across Windows setups).
Message mode mirrors the reference FS_Telemetry_Server app; the parser in
protocol.py works on the byte stream either way.

Windows only (FS25's named-pipe IPC is Windows-only; a UDP mode is on the
roadmap).
"""

import ctypes
import logging
import time
from ctypes import wintypes

log = logging.getLogger("companion.pipe")

PIPE_ACCESS_INBOUND = 1          # data flows game -> us
PIPE_TYPE_MESSAGE = 0x04
PIPE_READMODE_MESSAGE = 0x02
PIPE_WAIT = 0x00
MAX_INSTANCES = 1
IN_BUFFER = 65536

ERROR_BROKEN_PIPE = 0x0000000E
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
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            MAX_INSTANCES,
            0,            # out buffer (unused for INBOUND)
            IN_BUFFER,
            0,            # no default timeout
            None,
        )
        if handle is None or handle == ctypes.c_size_t(-1).value:
            raise OSError(ctypes.get_last_error(), "CreateNamedPipeW")
        return handle

    def _read(self, handle) -> bytes:
        """Read one chunk; returns b'' when the client disconnected."""
        buf = ctypes.create_string_buffer(65536)
        read = wintypes.DWORD(0)
        no_data_streak = 0
        while not self._stop:
            ok = kernel32.ReadFile(handle, buf, 65536, ctypes.byref(read), None)
            if ok:
                return buf.raw[:read.value]
            err = ctypes.get_last_error()
            if err in (ERROR_BROKEN_PIPE, ERROR_PIPE_NOT_CONNECTED):
                return b""
            if err == ERROR_NO_DATA:
                # message mode: can occur transiently (right after connect,
                # or when the writer closed); retry briefly, then treat as
                # a disconnect
                no_data_streak += 1
                if no_data_streak > 10:
                    return b""
                time.sleep(0.05)
                continue
            raise OSError(err, "ReadFile")
        return b""
