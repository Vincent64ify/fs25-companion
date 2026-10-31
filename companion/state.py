"""Latest envelope per topic, so a new viewer gets the full picture at once.

Every topic is "latest wins". A ``hello`` with a new sessionId means the
game loaded another savegame (or restarted): everything from the previous
session is dropped. A hello with the same sessionId (re-sent after a file
rotation) keeps the state.
"""

from typing import Any, Dict, Optional

Envelope = Dict[str, Any]


class StateStore:
    def __init__(self) -> None:
        self._topics: Dict[str, Envelope] = {}
        self.session_id: Optional[str] = None

    def apply(self, envelope: Envelope) -> bool:
        """Store a validated envelope. Returns True when it started a new
        session (the previous state was dropped)."""
        reset = False
        if envelope["topic"] == "hello":
            session_id = envelope["data"].get("sessionId")
            if session_id != self.session_id:
                reset = self.session_id is not None or bool(self._topics)
                self._topics.clear()
                self.session_id = session_id
        self._topics[envelope["topic"]] = envelope
        return reset

    def get(self, topic: str) -> Optional[Envelope]:
        return self._topics.get(topic)

    def snapshot(self) -> Dict[str, Envelope]:
        return dict(self._topics)

    def __len__(self) -> int:
        return len(self._topics)
