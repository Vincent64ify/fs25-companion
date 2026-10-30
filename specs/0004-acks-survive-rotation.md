# 0004: Command answers survive a stream rotation

Status: live-checked
Mod: 0.8.13 · Started: 2026-10-30 · From: [code review F1](../docs/REVIEW-2026-10-30.md#f1--rotation-discards-command-acknowledgements-and-can-strand-cruise-controls)

## Goal

Every tap on the dashboard gets the game's answer, even when it lands in
the frame the stream file starts over. Today the mod truncates the file
right after writing that frame (`Transport:flush`), so whatever the client
hadn't read yet is gone: a `command_ack` lost there shows "no answer"
although the game acted, and a lost `cruise.set` answer leaves Cruise −
and + stuck until the game session changes (the client waits for that
answer before it writes the next speed). The stream rotates about every
5 minutes (seen on Kinlaig, DONE.md), so it's rare, but it can't be
noticed or worked around from the dashboard.

## Behaviour

Nothing new on screen. What changes, as the player sees it:
- A tap whose answer fell in a rotation still gets it, one frame later:
  the button shows the game's answer, never "no answer" for that reason.
- Cruise − / + never get stuck: after a rotation, or if an answer is lost
  some other way, the next speed goes out at most 5 s later.
- No action runs twice: a replayed answer is ignored by whoever already
  had it.

## Data contract

Protocol v1; no topic or field changes.

- **Mod → backend:** after a rotation, the new file starts as today
  (`hello`, then the last data of every resend topic), then the
  `command_ack`s the mod sent in the last 5 s of game time, again, as they
  were (same `id`, `ref`, `ok`, `reason`, `via`), with new `seq`. At most
  16, oldest first.
- **Backend:** nothing new. An ack for a `ref` that was answered already
  goes nowhere (as today, `answer_command`).
- **Client** (`client/commands.py`):
  - an ack for an id it has seen already changes nothing (as today: the
    file is gone, and `_in_game` only drops ids at or below it);
  - a same-session `hello` whose `commands.next` is past the id of a
    coalesced command in the game frees its slot, and the waiting value
    goes out: the mod has read that command;
  - a coalesced command in the game for more than 5 s without an answer
    is given up (logged) when the next one comes, which goes out; a value
  that was waiting behind it is answered as superseded.
- **Web:** nothing.

Game API names used: none new (`g_time` for the 5 s, as `ctx.time` today).

| Name | Where from | State |
|---|---|---|
| (none) | | |

## Commands

No new actions. `cruise.set` keeps "one in the game at a time, the latest
waits"; only what frees the slot changes (above).

## Plan

1. **Mod** (`mod/src/Companion.lua`): `runCommands` keeps each ack it sends
   with its `ctx.time` in a short list (16 at most, older than 5 s
   dropped). After a rotation, `update` sends them again after
   `scheduler:resend`, before the second flush. Version 0.8.13.
2. **Client** (`client/commands.py`): `on_hello` frees coalesced slots below
   `commands.next`; `submit` gives up a slot older than 5 s
   (`IN_GAME_TIMEOUT_S`, the writer's `clock`). The module comment says
   so.
3. **Docs:** DONE.md's stream section (what follows `hello` after a
   rotation); NEXT.md and the review note: F1 fixed.

Risks: a replayed ack reaches a viewer whose command timed out on the
dashboard already: the commander has forgotten its id and drops it
(`web/src/commands.js` `settle`, checked in test.html). F2 (a refill past the reader's offset)
is a separate change.

## Acceptance

Automated:
- [x] `mod/tests/run.lua` ("acks survive a rotation"): with a small `maxBytes`, a command run in the
  frame that rotates: the new file has `hello` (`next` 2), the resend topics, then
  that command's ack (same id and ref); the action ran once.
- [x] `mod/tests/run.lua`: an ack older than 5 s isn't sent again; no
  more than 16 are.
- [x] `client/tests/test_commands.py`: `cruise.set` 1 in the game, 2
  waiting; a same-session hello with `next = 2` writes 2.
- [x] `client/tests/test_commands.py`: `cruise.set` 1 in the game with no
  answer for 6 s; the next value is written, and a late ack for 1 then
  changes nothing.
- [x] `client/tests/test_commands.py`: the same ack twice deletes once
  and writes nothing more.
- [x] `backend/tests/test_ws.py`: an ack answered already goes nowhere
  (exists: `test_command_goes_to_the_client_and_the_ack_to_its_viewer`).
- [x] `web/test.html`: an ack for an id that timed out or was answered is
  ignored.

Live check (any map, any tractor; `scripts/livewatch.py` running, it
notes each rotation):
- [x] Drive with the dashboard open past at least one rotation: the
  dashboard keeps updating, and livewatch shows `hello` then the
  replayed acks at the top of the new file.
- [x] Around a rotation, hold Cruise + then −: the set speed follows each
  time, nothing sticks.
  2026-10-30 (0.8.13, confirmed by Vincent): two rotations; one in the
  middle of a Cruise hold replayed 98 to 113, two of them taken by the
  rotation; the set speed followed on the dashboard and in game.

Hitting the exact frame by hand is luck; the automated tests are the
check for that.

## Decisions

- Replay the answers rather than change how the file rotates (rename,
  segments, a reader handshake): it fixes what is lost (only acks are
  events; every other topic comes again or is resent), needs no new game
  API, and leaves the reader as it is.
- 5 s and 16: the reader polls every 50 ms, so what it can miss is a few
  frames; 5 s also covers a client that stalls briefly. Change if the
  live check says so.

## Out of scope / open questions

- F2 (the tailer misses a truncate that refills past its offset): its own
  change, with a stream generation the reader checks.
- A command whose ack never comes for other reasons (the mod's job hangs)
  still shows "no answer" on its button; only the cruise slot recovers.

## Log

- 2026-10-30: drafted from the code review's F1. Waiting for approval.
- 2026-10-30: approved by Vincent.
- 2026-10-30: built (mod 0.8.13). Mod: `Companion.lua` keeps the last
  acks (`ACK_REPLAY_MS`, `ACK_REPLAY_MAX`) and replays them after
  `scheduler:resend`. Client: `CommandWriter._free` frees a coalesced slot
  on an ack or on a same-session hello past it; `IN_GAME_TIMEOUT_S` gives
  one up. Web: nothing to change. Tests: 1 Lua, 3 client, 1 in
  test.html; 111 Python/Lua tests and test.html all pass. Where the build
  differs from the draft: a value waiting behind a given-up command gets
  its "superseded" answer, so its button doesn't show "no answer".
- 2026-10-30: live check (0.8.13), what the files showed, Cruise − / +
  held from the dashboard: the stream rotated at 16:34:02 (seq 2130,
  about every 1.5 min at ~20 KB/s) in the middle of a hold. The new
  file: `hello` (`next` 114), farmland_grid, crop_types, field_outlines,
  cab, then the acks of 98 to 113 again (16: the cap, about 0.8 s at ~20
  cruise answers a second). 112 and 113 were written after the watcher's
  last read of the old file, so they're the ones the rotation took and
  the replay brought back. After it, 114 to 536 answered in order, all
  ok, with no gap; no mod errors in log.txt. An earlier rotation
  (~16:32:50) had no command in its last 5 s and replayed none. Vincent:
  the set speed followed every press on the dashboard and in game.
  Live-checked. No new game API names.
