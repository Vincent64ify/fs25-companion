"""Parser for the fssimx telemetry wire format.

The stream is plain text with fields separated by ``<``:

    HEADER<key1<key2<...<keyN<BODY<val1<val2<...<valN<HEADER<...

* The HEADER frame lists the telemetry keys (sorted by the mod) in the
  exact order their values appear in the following BODY frame.
* The mod re-sends the HEADER frame periodically, so the parser can
  resynchronise at any point in the stream (tokens seen before the first
  HEADER are dropped).
* Table values are joined with ``>`` and carry a trailing ``>``.
* Booleans are ``"1"``/``"0"`` (keys starting with ``Is`` are decoded as
  bools), numbers are ``"123"`` or ``"123.45"``, everything else is a
  string.
"""

from typing import Any, Dict, Iterator, List, Optional


class FrameParser:
    """Incremental parser: feed raw bytes, get parsed telemetry dicts."""

    def __init__(self) -> None:
        self._buf = b""
        self._keys: List[str] = []
        self._vals: List[str] = []
        self._mode: Optional[str] = None  # "header" | "body" | None

    def feed(self, data: bytes) -> Iterator[Dict[str, Any]]:
        self._buf += data
        parts = self._buf.split(b"<")
        self._buf = parts[-1]  # keep the (possibly incomplete) tail
        for part in parts[:-1]:
            # NOTE: empty tokens are REAL values — the mod sends ""
            # (e.g. no vehicle) as a zero-length field between '<'s:
            # "BODY<<<<<6<1087<...". Discarding them desynchronises the
            # value count from the key count and NO frame would ever
            # complete. Empty tokens are consumed by _on_token (dropped in
            # "none" mode, appended as "" in "body" mode).
            token = part.decode("latin-1", "replace").strip()
            frame = self._on_token(token)
            if frame is not None:
                yield frame

    def _on_token(self, token: str) -> Optional[Dict[str, Any]]:
        if token == "HEADER":
            self._keys, self._vals, self._mode = [], [], "header"
            return None
        if token == "BODY":
            self._mode, self._vals = "body", []
            return None
        if self._mode == "header":
            self._keys.append(token)
            return None
        if self._mode == "body":
            self._vals.append(token)
            if len(self._vals) == len(self._keys):
                frame = {
                    key: _decode_value(key, val)
                    for key, val in zip(self._keys, self._vals)
                }
                self._mode = None  # wait for the next HEADER/BODY
                return frame
        return None


def _decode_value(key: str, raw: str) -> Any:
    if ">" in raw:  # table
        return [_decode_value(key, v) for v in raw.split(">") if v != ""]
    if key.startswith("Is") and raw in ("0", "1"):
        return raw == "1"
    try:
        value = float(raw)
    except ValueError:
        return raw
    if value.is_integer() and "." not in raw and "e" not in raw.lower():
        return int(value)
    return value


def endpoint_url(backend: str, pairing: str) -> str:
    """Build the relay endpoint URL: <backend>/ws?pair=<code>.

    If the user already supplied a full /ws path, only make sure the
    pairing query param is present.
    """
    base = backend.rstrip("/")
    if "/ws" in base:
        if "pair=" in base:
            return base
        return base + ("&" if "?" in base else "?") + f"pair={pairing}"
    return f"{base}/ws?pair={pairing}"
