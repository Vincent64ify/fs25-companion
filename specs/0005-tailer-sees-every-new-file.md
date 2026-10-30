# 0005: The client notices every new stream file

Status: live-checked
Mod: no change · Started: 2026-10-30 · From: [code review F2](../docs/REVIEW-2026-10-30.md#f2--file-replacement-is-missed-when-the-stream-regrows-past-its-old-offset)

## Goal

The client always starts reading a new stream file from its top, so it
always gets the new `hello`. Today `FileTail.poll` only notices a new file
when it is smaller than where it had read to. If the new file has already
grown past that point by the next poll, the client reads on from the old
offset in the middle of the new file and never sees its `hello`.

When that happens after a game reload, the client keeps the old game
session. It goes on writing commands with the old session id, and the mod
deletes them as left over from an earlier session: **every dashboard
button shows "no answer"** until the next rotation, minutes later. The map
also keeps the old session's state.

When it can happen: the new file has to outgrow the old offset while the
client isn't looking. A game reload alone isn't enough: the mod empties
the file when the map starts loading, seconds before its first write, and
a client that keeps polling sees it empty (live check, 2026-10-30). A
client that doesn't poll for a while is: a laptop asleep, a stalled
process. The mod's first frame writes `hello`, the farmland grid, crop
types and field outlines at once (133 KB on Solek), so the new file soon
passes a short old one.

## Behaviour

Nothing new on screen. After a game reload or a rotation, the dashboard
always switches to the new session, and its buttons keep working.

## Data contract

No change to the stream or the protocol. The mod already starts every new
file with `hello`, whose line is unique to that file (`seq` keeps
counting across rotations; a new game session has a new `sessionId`).

- **Client** (`client/transport/file_tail.py`): `FileTail` keeps the first
  line of the file it is reading (up to 64 KB; `hello` is about 1 KB).
  Each poll reads that many bytes from the top again, in the same open as
  the new data. If they differ, or the file is smaller than the offset as
  today, it is a new file: start from 0 and drop the old partial line.
  Until the file has a complete first line, it reads as today.
- **Backend, web, mod:** nothing.

Game API names used: none.

| Name | Where from | State |
|---|---|---|
| (none) | | |

## Commands

None.

## Plan

1. `client/transport/file_tail.py`: keep the first line; compare it on
   every poll; count a new file in `rotations` as today. Module comment
   updated.
2. `scripts/livewatch.py`: its own `Tail` has the same blind spot; it
   uses `FileTail` instead, and still prints "started over". As built:
   `FileTail.skip_to_end()` starts after what the file holds and learns
   its first line, for livewatch's default (from now on).
3. Docs: DONE.md's client side line ("If the file is smaller than the
   offset, reset to 0"); NEXT.md and the review note: F2 fixed.

Risks: one extra read of about 1 KB per poll (20 a second), from the OS
cache; negligible. A file whose first line changes without a new file
can't happen: the mod only appends.

## Acceptance

Automated:
- [x] `client/tests/test_file_tail.py`: read `{"old":1}\n`, overwrite with
  `{"new":2}\n` (same size): the next poll returns `{"new":2}` and counts
  a rotation (the review's case).
- [x] the same with a replacement larger than the offset, starting with a
  new session's `hello`: the hello comes first, nothing of the old file.
- [x] an old partial line is dropped across a larger replacement.
- [x] a file still being written (its first line incomplete) and a file
  that only grows: read as today, no rotation counted.
- [x] the existing tests (smaller file, deleted and recreated) pass.
- [x] `client/tests`: the client's `tail()` passes the new `hello` on after
  a same-size replacement (the command writer gets the new session).
- [x] `skip_to_end` (livewatch starting mid-file) still knows a new file.

Live check (any map; the client and `scripts/livewatch.py` running):
- [x] Load a savegame, quit to the menu within a few seconds, load it
  again: the client logs the new file, the dashboard shows the new
  session, and a button (lights) works at once.
- [x] The same with the client paused (`NtSuspendProcess`) from before
  the quit until the new file has passed what it had read: Lights works
  at once after it resumes.
  2026-10-30 (Solek, confirmed by Vincent): both reloads, Lights toggled
  in game at once and the dashboard showed the new session.
- [x] A normal rotation still reads as before (livewatch "started over",
  the dashboard keeps updating).
  2026-10-30 (Solek, confirmed by Vincent): the rotation at 16:58:06,
  livewatch "started over"; the dashboard kept updating and Lights,
  answered as command 2 after it, toggled in game.

## Decisions

- Compare the first line rather than add a generation number to the
  stream: no mod change, and the `hello` that heads every file already
  is one.

## Out of scope / open questions

- F3 and F4 (the hosted relay): their own change.

## Log

- 2026-10-30: drafted from the code review's F2. Waiting for approval.
- 2026-10-30: approved by Vincent.
- 2026-10-30: built (client only). `FileTail` keeps the first line once
  read whole and compares it in the same open on every poll;
  `skip_to_end` for livewatch, whose `Tail` now wraps `FileTail`. Tests: 6
  new in `test_file_tail.py`, one of them running the client's `tail()`
  into the command writer; 117 Python/Lua tests pass. livewatch started
  against the live game's files without errors.
- 2026-10-30: live check, what the files showed (Solek, client restarted
  on the new code). A quick reload (sessions `…164718` then `…164838`):
  each new file started at 133 KB; Lights answered ok as command 1 to 12
  in the new session, its command files carrying it. That reload didn't
  need the new check: the mod empties the file when loading starts, and
  the polling client saw it shrink (Goal corrected). Then the client was
  paused at 361,188 bytes into session `…164838`, Vincent reloaded
  (`…165136`), and it was resumed with the new file at 364,859 bytes,
  past its offset, the review's case: Lights answered ok as command 1 of
  the new session, so the client read the new `hello`. Vincent: Lights
  toggled in game and the dashboard was on the new session, both times.
  Left: a normal rotation with the new client (its box). No game API
  names.
- 2026-10-30: the rotation, with the client restarted at 16:55:26 and
  the new livewatch: at 16:58:06 livewatch printed "stream.ndjson started
  over" and the new file's `hello` (the same session, `…165628`); Lights
  then answered ok as command 2, after the engine as 1 before the
  rotation, so the client read on in the new file. Vincent: the dashboard
  kept updating, the lights toggled. Live-checked.
