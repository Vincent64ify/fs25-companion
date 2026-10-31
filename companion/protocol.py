"""Protocol v1: the envelope the mod writes, and a command's shape.

Every line of the mod's stream file is one envelope:

    {"v": 1, "seq": 1234, "t": 5123456, "topic": "player", "data": {...}}

Only the envelope is checked here: what a topic's ``data`` holds is
described once, in web/src/types.js, and the dashboard ignores what it
doesn't know. Breaking changes bump ``v``. A command is checked for its
shape only: its actions and values are the mod's list (Commands.lua,
specs/0007).
"""

import math
import re
from typing import Any, Dict, Optional

PROTOCOL_VERSION = 1

TOPIC_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
ACTION_RE = re.compile(r"^[a-zA-Z.]{1,40}$")
ENVELOPE_KEYS = {"v", "seq", "t", "topic", "data"}

# topics that are events: relayed, never kept in the state store
EVENT_TOPICS = {"command_ack"}


class ProtocolVersionError(ValueError):
    def __init__(self, got: Any):
        super().__init__(
            f"mod speaks protocol v{got}, the companion speaks v{PROTOCOL_VERSION}: "
            "update the mod and the companion so they match")
        self.got = got


class InvalidEnvelope(ValueError):
    pass


def _int(x: Any) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def parse_envelope(raw: Any) -> Dict[str, Any]:
    """Check one envelope and return it, unchanged. Raises
    ProtocolVersionError on a version mismatch and InvalidEnvelope on
    anything malformed."""
    if not isinstance(raw, dict) or set(raw) != ENVELOPE_KEYS:
        raise InvalidEnvelope(f"not an envelope: keys {sorted(raw) if isinstance(raw, dict) else type(raw).__name__}")
    if not _int(raw["v"]):
        raise InvalidEnvelope("v is not an integer")
    if raw["v"] != PROTOCOL_VERSION:
        raise ProtocolVersionError(raw["v"])
    if not _int(raw["seq"]) or raw["seq"] < 0:
        raise InvalidEnvelope("seq is not a count")
    if not _number(raw["t"]):
        raise InvalidEnvelope("t is not a number")
    if not isinstance(raw["topic"], str) or not TOPIC_RE.match(raw["topic"]):
        raise InvalidEnvelope(f"bad topic {raw['topic']!r}")
    if not isinstance(raw["data"], dict):
        raise InvalidEnvelope("data is not an object")
    return raw


def command_refusal(action: Any, value: Any) -> Optional[str]:
    """Why a viewer's command is refused before it reaches the mod, or None:
    the action must be a short dotted name, the value a number or absent."""
    if not isinstance(action, str) or not ACTION_RE.match(action):
        return "action not allowed"
    if value is not None and not _number(value):
        return "value not allowed"
    return None
