#!/usr/bin/env python3
"""Keep the last data of some topics from a recorded v1 stream.

    python fixtures/extract_stream.py <modSettings>/FS25_Companion/stream.ndjson \
        fixtures/solek_farmlands.json farmlands farmland_grid

Writes {topic: data} with the last envelope of each topic named. Used to
take the real farmland grid of a live session into the replay fixture
without the rest of the session (paths, player name).
"""

import json
import sys


def main() -> None:
    src, out, topics = sys.argv[1], sys.argv[2], sys.argv[3:]
    last = {}
    with open(src, encoding="utf-8") as f:
        for line in f:
            try:
                envelope = json.loads(line)
            except ValueError:
                continue
            if envelope.get("topic") in topics:
                last[envelope["topic"]] = envelope["data"]
    missing = [t for t in topics if t not in last]
    if missing:
        sys.exit(f"not in {src}: {', '.join(missing)}")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump({t: last[t] for t in topics}, f, separators=(",", ":"))
        f.write("\n")
    print(f"wrote {', '.join(topics)} to {out}")


if __name__ == "__main__":
    main()
