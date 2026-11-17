# 0019: Contracts: accept, cancel, hand in

Status: approved
Mod: 0.20.0 · Started: 2026-11-16 · Design: the Contracts page of [spec 0018](0018-contracts.md) and its canvas [FS25 Companion: Contracts](https://claude.ai/artifact/T8NwTQTEp6jvCdRq82xHzP) (private, on claude.ai), which gets the action row at 1158 × 676 and 1180 × 820 before the build; [THEMES.md](../docs/THEMES.md#layout)

## Goal

Take a contract, drop it, and hand it in from the Contracts page, without
opening the game's menu. Spec 0018 shows which contract pays best and how
the ones you hold are going; the three things you then do with a contract
still need the game's own screen. With them the whole round (choose, take,
work, get paid) happens on the tablet.

Settled with Vincent on 2026-11-16: "complete" is the game's own hand-in
of a finished contract, not forcing a running one to finish; Accept
follows the page's With lease / Own machines switch; only Cancel asks
twice; single player and hosting only.

## Behaviour

### One action row in the detail

The detail tile of spec 0018 gets one row at its foot, always there, the
tile's full width, with **one button that depends on what the contract
is**. The list's rows, the field panel's contract row and the map's popup
get no buttons: they open the detail.

| The contract is | The button | A tap |
|---|---|---|
| on offer | **Accept with lease · £2,100** or **Accept, own machines** | takes it |
| yours, preparing or running | **Cancel contract** | asks once more, then cancels |
| yours, finished | **Hand in · +£3,900** | pays out and clears it |

The button never comes and goes with live state: what can't be pressed
now is faded and says why in the line beside it.

- **The row** (canvas version 11, approved by Vincent 2026-11-16): a
  hairline over it, then on the left **a line that says what the tap
  does**, on the right the button, 272 wide and 48 tall, always the same
  size. The line is always there, so the button never moves:
  - an offer with lease: "The leased machines will stand at the shop.";
    own machines: "You bring your own machines.";
  - yours: "Ends it as cancelled. Asks once more."; while preparing:
    "The game is putting the machines at the shop.";
  - finished: "Books the game's sum and frees a slot.";
  - a faded button's reason, and Cancel's warning, take its place.
- **Accept and Hand in are filled** (the selected tab's surface: blue by
  day, slate at night); **Cancel contract is a plain button**, and only
  "Really cancel?" is in `warn`.
- **Pending:** the `on-border` ring, breathing. **Failed:** the word on
  the button, `alarm` ring and text (spec 0013 revision 6).

### Accept

- **Lease or not is the page's switch.** With lease: "Accept with lease ·
  £2,100" (the lease's price, so you see what you pay). Own machines:
  "Accept, own machines". A contract without lease vehicles reads
  "Accept, own machines" under either switch.
- **Own machines with no fitting tool of yours** is still allowed: the
  detail already says "No tool of yours fits", and you may know better.
- **Faded, with the reason beside it:**
  - "3 of 3 taken: hand one in first." when your farm holds the game's
    limit (finished ones count until handed in);
  - "Another contract is still getting ready" while one of yours is
    preparing (the game starts one at a time).
- **A tap:** the button is pending from touch-down. When the game took
  it, the contract moves to Yours, the detail stays on it, and the row
  now shows Cancel contract. With lease it's "preparing" until the game
  has put the machines at the shop, then running: under a second in the
  spike (0.7 s for two machines; 0.2 s without lease), so "getting
  ready" is rarely seen. The lease isn't paid on Accept: the game
  takes it off the total at hand-in.
- **Refused by the game** (taken by someone else meanwhile, no room at
  the shop for the leased machines, anything else): "Failed" on the
  button (spec 0013 revision 6), no toast. The list corrects itself with
  the next message.

### Cancel

- **Two taps.** The first turns the button into "Really cancel?" in
  `warn` for 4 seconds, with a line beside it: "The leased machines are
  taken back at once." (leased) or "The contract ends as cancelled."
  (own machines). A second tap in that time cancels; otherwise the
  button goes back.
- **After it:** the contract is finished with the outcome "cancelled",
  still in Yours and still counting toward the limit, and the row shows
  Hand in with the game's sum (below).
- No sum is promised before cancelling: the game works out what a
  cancelled contract costs only when it ends. In the spike a cancelled,
  leased contract cost its lease and nothing more (−£400), shown on
  Hand in right after.

### Hand in

- **For every finished contract**, whatever the outcome (success, failed,
  timed out, cancelled). The button carries the game's own total, the
  same sums spec 0018 already lists (reward, lease, reimbursement,
  penalty): "Hand in · +£3,900", "Hand in · −£450", or "Hand in" alone
  when the total is 0 or unknown.
- **The sum is the game's figure now.** For a contract that failed, timed
  out or was cancelled it is final. For a successful one the game works
  out the reimbursement only as it hands in (`dismiss()` →
  `removeAccess()` → `calculateReimbursement()`), so what's booked can be
  more than the button said. The live check notes both.
- **A tap, no second one:** the game books the money, takes back the
  leased machines of a successful contract, and removes the contract.
  The detail moves to the first row of the list, and the limit line
  counts one less.

### Everywhere

- **Pending and Failed** as on every other button: pending from
  touch-down until the mod answers; "Failed" on the button when it says
  no, or doesn't answer in time. Another tap while pending does nothing.
- **An older mod** (before 0.20.0): no action row, the page is as in
  spec 0018.
- **Multiplayer:** on a game you joined, every one of the three says
  "Failed" (the mod answers "host only"). Hosting works like single
  player.
- **Day and Night, every size of spec 0018:** the row is part of the
  detail's fixed height on the mini (1158 × 676): the detail still
  doesn't scroll. The button is 44 high or more. `warn` only on "Really
  cancel?"; nothing yellow at night.

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change.

- **Mod → companion** (`contracts`, as spec 0018):
  - `total` (number, €, finished contracts): the game's
    `getTotalReward()`, what Hand in will book (before a successful
    contract's reimbursement, Behaviour). A plain read: it adds up four
    getters and changes nothing. Absent when the call fails; then the
    button has no sum.
  - Nothing else is new: the limit (`limit`), who holds what (`mine`,
    `status`), and whether there's a lease (`vehicles`, `vehicleCosts`)
    are already there.
  - The mod sends `contracts` in the same frame as a contract command's
    answer, so the page changes with the ack.
- **Mod → companion** (`hello`): `commands.actions` 4 (was 3): the mod
  takes contract commands. The dashboard shows the action row from 4 up.
  The companion today takes the mod to read action names only when
  `actions` is exactly 3 (`companion/commands.py`): that becomes 3 or
  more, or every command would stop with this mod.
- **Web → companion → mod:** a command may carry `contract`, the
  contract's `id` (a string). The companion checks its shape only (1 to
  64 characters of letters, digits, `-` and `_`; anything else is
  refused "value not allowed") and writes it as the file's `contract`
  attribute. A real id is "mission" and 32 hex digits
  (`mission00340f3982b386de3c3c23fb16536e09`, the stream of
  2026-11-16); the fixture's made-up ids ("c-harvest-4") fit too.
- **Web** (`web/src/types.js`): `total` on a contract; `contract` on a
  command.
- **Web** (`web/src/data/contracts.js`): `action(contract, contracts,
  prefs)` → which button, its label, and why it's faded, as a pure
  function. `web/src/widgets/contractsScreen.js` draws the row.

Game API names used. All from FS25's own `dataS/scripts/missions/` in the
SDK's `gameSource.zip` (read 2026-11-16) unless said; none is verified
live, so all go behind guards in `mod/src/Api.lua`.

| Name | Where from | State |
|---|---|---|
| `g_missionManager:getMissionByUniqueId(id)` | MissionManager.lua | a function in the game (spike 2026-11-16); not called yet |
| `g_missionManager:startMission(mission, farmId, spawnVehicles)` → a `MissionStartState` | MissionManager.lua (asserts it runs on the server) | verified (spike 2026-11-16: `OK` with lease and without) |
| `MissionStartState.OK`, `NO_ACCESS`, `LIMIT_REACHED`, `ALREADY_STARTED`, `PENDING_MISSION`, `NOT_AVAILABLE_ANYMORE`, `CANNOT_BE_STARTED_NOW`, and `NO_PERMISSION` | MissionManager.lua (the table itself isn't in the zip) | there (spike 2026-11-16: OK 1, LIMIT_REACHED 2, ALREADY_STARTED 3, NOT_AVAILABLE_ANYMORE 4, NO_ACCESS 5, CANNOT_BE_STARTED_NOW 6, PENDING_MISSION 7, NO_PERMISSION 8, which the script never returns); the mod compares by name |
| `g_missionManager:cancelMission(mission)` → true or false | MissionManager.lua (server only; calls `mission:finish(MissionFinishState.CANCELED)`) | verified (spike 2026-11-16: true, finished and `CANCELED` the same frame) |
| `g_missionManager:dismissMission(mission)` | MissionManager.lua (server only; `mission:dismiss()` books `getTotalReward()`, then `mission:delete()`) | verified (spike 2026-11-16: true; the money moved by the total and the contract left the list the same frame) |
| `g_missionManager:hasFarmReachedMissionLimit(farmId)` | MissionManager.lua | verified (spike 2026-11-16: true with three held, false after the hand-in) |
| `mission:getTotalReward()` | AbstractMission.lua | verified for a cancelled, leased contract (−400, the lease; booked exactly); a success not seen. Nothing for a harvest contract on offer |
| `mission:hasLeasableVehicles()`, `mission:isSpawnSpaceAvailable()` | AbstractMission.lua (the second marks shop places while it looks and unmarks them before it returns) | verified for `isSpawnSpaceAvailable()` true (spike 2026-11-16); false not seen. Called once, on an Accept with lease |
| What the game does with no room: `failedToLoadVehicles`, the loaded machines deleted, `spawnedVehicles` false, the contract still started | AbstractMission.lua (the vehicle loading callback) | read only to explain the check before Accept; unverified |
| `g_currentMission:getIsServer()` | used all through the game's scripts | verified (true in single player) |
| `g_localPlayer.farmId`, `mission.status`, `mission.farmId` | [GAME-API.md](../docs/GAME-API.md#contracts-mod-0191-live-checked-2026-11-15-and-16) | verified |
| `MissionStartEvent`, `MissionCancelEvent`, `MissionDismissEvent` (what the game's menu buttons send, as remembered from FS22) | not in the SDK's zip, not in BetterContracts | there (spike 2026-11-16: each has `new` and `newServerToClient`; their arguments unknown), not used (Decisions). The menu frame has `onButtonAccept`, `onButtonLease`, `startContract`, `onButtonCancel`, `onButtonDismiss` |
| What the game's menu checks before it accepts (room at the shop, a farm permission) | the menu's script isn't in the zip | unknown: the spike looks |

## Commands

Three commands, none tied to a vehicle (`game`, like `timeScale.set`), each
naming its contract by `contract`. They are the first that aren't a key
press or a vehicle setter: the game has no key for them, only its menu's
buttons (Decisions). Each says the state it wants (specs/0008), so a
doubled command does nothing wrong.

- **`contract.accept`**, `contract`, value 1 (with lease) or 0 (own
  machines). Wants: this contract is your farm's.
  - Already your farm's and not finished → `already`.
  - Not the server → failed "host only". No such contract → failed "not
    there any more". With lease and `isSpawnSpaceAvailable()` false →
    failed "no room at the shop", nothing started (`startMission` itself
    doesn't look).
  - Else `startMission(mission, your farm, lease)`; anything but `OK` →
    failed with the state's name as the reason ("limit reached",
    "another one is preparing", "not available any more", "can't be
    started now").
  - Checked: ok only once the contract reads as your farm's and
    preparing or running (the same frame, or within 10 frames).
    `via`: "missionManager".
- **`contract.cancel`**, `contract`, no value. Wants: this contract is
  finished.
  - Already finished → `already`. Not your farm's, or still on offer →
    failed "not yours". Not the server → "host only".
  - Else `cancelMission(mission)`; false → failed. Checked: ok once its
    status reads finished.
- **`contract.handIn`**, `contract`, no value. Wants: this contract is
  gone.
  - No such contract → `already`. Not your farm's → failed "not yours".
    Not finished → failed "not finished". Not the server → "host only".
  - Else `dismissMission(mission)`. Checked: ok once the id is no
    longer in the game's list.
- **The dashboard, the same frame:** the button goes pending on
  touch-down; the ack and the `contracts` message arrive together, and
  the row redraws from the message. The second tap of Cancel is the
  dashboard's alone: the mod gets one command.

## Plan

0. **Canvas first:** the action row on the Contracts canvas at
   1158 × 676 and 1180 × 820, day and night, each state, for Vincent to look at before the build.
0. **Spike first** (FS25_CompanionSpike, on a copy of the save; nothing
   in the mod until it answers): whether `MissionStartState` and the three functions exist; then call
   accept (with and without lease), cancel and hand in once each from the
   console and note what the game does: the money booked, the leased
   machines, whether a dialog or the menu opens in the game, whether the
   game's own contracts screen agrees afterwards, and whether it works
   with the game's menu open. Also dump the globals named `Mission…Event`
   for the multiplayer follow-up.
1. **Mod:** `Api.lua` (the guarded calls), `Commands.lua` (the three
   actions, a `contract` attribute, their checked jobs; `contracts` sent
   with the ack from `Companion.lua`), `collectors/Contracts.lua`
   (`total`), `Hello.lua` (`actions` 4), `modDesc.xml` 0.20.0,
   `mod/README.md`.
2. **Companion:** `protocol.py` (`contract` in `command_refusal`),
   `commands.py` and `server.py` (carry it into the file; `actions` 3 or
   more).
3. **Web:** `types.js`, `connection.js` (`sendCommand` takes a
   contract), `data/contracts.js` (`action`), `widgets/contractsScreen.js`
   (the row, pending, Failed, the two-tap Cancel), the theme's CSS,
   `web/fixtures/contracts.json` (`total` on the finished one; for the
   pane check a preparing contract is patched in, the file keeps its
   nine).
4. **Docs:** [ARCHITECTURE.md](../docs/ARCHITECTURE.md#ground-rules)'s
   "The game's keys, not its setters" names this exception; spec 0018's
   Out of scope points here; THEMES.md's Contracts page gets the row.
5. **Risks:** the functions are read from the script, never run by us:
   the game may show a dialog, or its menu may not notice; a hand-in
   books money, so a wrong call costs a real save's cash (the spike runs
   on a copy); a mod contract type may override `start` or `dismiss`.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [ ] `mod/tests/run.lua`: `contract.accept` with value 1 calls
  `startMission` with the mission, your farm and true, and answers ok
  `checked` once the fake mission reads as yours; value 0 passes false.
- [ ] `mod/tests/run.lua`: accept answers `already` for one that's yours;
  fails with the state's reason for each `MissionStartState` but `OK`;
  fails "no room at the shop" without calling `startMission`; fails
  "host only" when not the server; fails "not there any more" for an
  unknown id; fails when the status never changes.
- [ ] `mod/tests/run.lua`: `contract.cancel` calls `cancelMission` once
  and is ok when the status is finished; `already` on a finished one;
  "not yours" on an offer and on another farm's.
- [ ] `mod/tests/run.lua`: `contract.handIn` calls `dismissMission` once
  and is ok when the id is gone; `already` for an unknown id; "not
  finished" on a running one; "not yours" on another farm's.
- [ ] `mod/tests/run.lua`: all three run on foot; a missing game function
  fails the command and breaks nothing; `contracts` is sent with the
  answer; a finished contract carries `total`; `hello` says `actions` 4.
- [ ] `companion/tests/`: a command with `contract` reaches the file with
  that attribute; a `contract` that isn't a short id, or isn't a string,
  is refused "value not allowed"; commands without it are as before;
  a `hello` with `actions` 4 still gets commands written by name.
- [ ] `tests/test_golden.py`: unchanged.
- [ ] `web/test.html`: `action()`: an offer gives Accept with the lease's
  price under With lease, "Accept, own machines" under Own machines and
  for a contract without lease vehicles; faded with "3 of 3 taken" at
  the limit and with the preparing line while one prepares; a running or
  preparing one of yours gives Cancel contract; a finished one Hand in
  with its signed total, and no sum without `total`.
- [ ] `web/test.html`: Accept sends `contract.accept` with the id and 1
  or 0 by the switch; pending until the answer; a second tap while
  pending sends nothing; a failed answer, or none in time, says "Failed".
- [ ] `web/test.html`: Cancel's first tap sends nothing and shows "Really
  cancel?" with its line; the second sends `contract.cancel`; after 4 s
  without one the button is back. Hand in sends `contract.handIn` on the
  first tap.
- [ ] `web/test.html`: with `hello.commands.actions` 3 the detail has no
  action row.
- [ ] Replay in the browser pane (`replay-solek` plus the fixture): the
  row on an offer (both switches), on a running, a preparing and a
  finished contract, faded at the limit, "Really cancel?", and "Failed"
  (the replay refuses commands); at 1158 × 676 and 1180 × 820, day and
  night, and 820 × 1180 (the detail over the list): the detail doesn't
  scroll on the mini, no button under 44.

Spike first (in game, Solek, **a copy of the save**, spike 0.0.10
enabled in it; the console is `~`; the commands are in
[research/spike](../research/spike/README.md); Claude reads the files in
`modSettings/FS25_CompanionSpike/`, Vincent says what the game showed):
- [x] `csMissions start`, and stop there (it only reads): the list in
  the console matches the game's contracts screen, and Claude reads
  `missions-start.json` (the game is the server, the three functions
  are there, the statuses read as names) before anything is changed.
- [x] `csAccept N lease` on a field-work offer: do the leased machines
  stand at the shop, does the game's contracts screen show it as
  active, and did anything open in the game (a dialog, the menu)?
- [x] `csMissions`, then `csAccept N own` on another offer once the
  first one runs: the same three things, without machines.
- [x] `csMissions`, then `csCancel N` on the leased one: are the leased
  machines gone, and what does the game's screen say it costs?
- [x] `csMissions`, then `csHandIn N` on the cancelled one: does your
  money change by what the game's screen said, and is the contract gone
  from it?
- [ ] A success, if one can be had (work the own-machines one to the
  end, or one already finished in the save): `csHandIn N`, your money
  against the game's sum. (Not run on 2026-11-16: left to the live
  check's "Hand in a success".)
- [x] Save, load: the game's contracts are as the commands left them.

Live check (in game, Solek, mod 0.20.0, single player, with
`scripts/livewatch.py`; for Vincent to run):
- [ ] **Accept with lease:** the contract moves to Yours, the leased
  machines stand at the shop, the game's own contracts screen shows it
  as active, and nothing opens in the game (no dialog, no menu).
- [ ] **Accept, own machines:** it moves to Yours, no machines appear.
- [ ] **The limit:** with three held, Accept is faded with "3 of 3
  taken"; the game's screen refuses too.
- [ ] **While one prepares:** Accept on another is faded until the first
  runs.
- [ ] **Cancel a leased one:** two taps; the leased machines are gone,
  the contract shows "cancelled" and Hand in with a sum; note the sum
  beside what the game's screen says.
- [ ] **Hand in a success:** your money rises by the button's sum (note
  both if they differ: the reimbursement), the
  contract leaves both the dashboard and the game's screen, the leased
  machines are gone, the limit line counts one less.
- [ ] **Hand in a cancelled or failed one:** the sum booked matches the
  button's.
- [ ] **In a vehicle and on foot,** and with the game's menu open: what
  each button does.
- [ ] After each of the above, save and load: the game's state is as the
  dashboard left it.

## Decisions

- **The game's own functions, not its menu's events.** The scripts for
  `startMission`, `cancelMission` and `dismissMission` are in the SDK
  and can be read line by line; `startMission` returns why it refused,
  which the button needs. What the menu's buttons send isn't in the SDK
  or in BetterContracts, so its names and arguments would be guesses,
  and an event gives the mod no answer. The price: it works only where
  the game is the server, which is the scope Vincent chose (open
  question 1).
- **An exception to "the game's keys, not its setters"**, written into
  ARCHITECTURE.md: there is no key. The mod runs the same checks the
  game's function runs, changes nothing itself, and checks the result.
- **One button, by what the contract is** (Vincent, 2026-11-16), not
  three fixed ones with two always faded: a contract is an offer, yours
  or finished, and each has one thing to do. The tool cards' rule
  (buttons never come and go) still holds inside each kind: Accept
  fades, it doesn't leave.
- **Checked answers:** ok means the game's list shows the change, not
  that the call returned.
- **The buttons' rules live on the web** (`action()`), from fields the
  topic already has; the mod refuses on its own anyway.

## Out of scope / open questions

Out of scope:
- **Forcing a stuck contract to finish** (spec 0018's "91 %"): still the
  project's first cheat, its own spec if ever.
- **A multiplayer client:** needs the menu's events (the spike dumps
  their names) and the farm's contracts permission.
- Buttons in the list's rows, the field panel's row and the map's popup.
- New contracts from the game ("refresh"), as BetterContracts has.

Settled by the spike, 2026-11-16: the game's functions, not the menu's
events. The game's own contracts screen, the leased machines, the money
and a save and load all followed them, and nothing opened in the game.

Settled 2026-11-16 (the canvas): one button by what the contract is; the
words as drawn ("Accept with lease · £2,900", "Accept, own machines",
"Cancel contract", "Really cancel?", "Hand in · +£6,700" for every
finished contract).

## Log

- 2026-11-16: drafted after spec 0018's live check. Vincent settled:
  hand-in only (no forced finish), Accept follows the page's switch,
  only Cancel asks twice, single player and hosting. Read for it:
  `MissionManager.lua` and `AbstractMission.lua` in the SDK's
  `gameSource.zip`, and BetterContracts' `gui.lua` (it leaves the three
  buttons to the game). The first answer to Vincent leaned toward the
  menu's events; the draft takes the game's functions instead, because
  their script can be read and `startMission` says why it refused
  (Decisions). A real id read from the day's stream.
- 2026-11-16: Vincent: one button, by what the contract is. The action
  row drawn on the Contracts canvas (version 11): eight boards under
  "Accept, cancel, hand in", four at 1158 × 676 and four at 1180 × 820,
  day and night; the first plays accept, the two-tap cancel and hand in.
  New there, not yet in Behaviour until Vincent has looked: a line left
  of the button that says what the tap does ("The leased machines will
  stand at the shop."), which is where the reason for a faded button
  goes; Accept and Hand in filled, Cancel contract plain. The boards
  were not looked at in a browser by Claude (the pane isn't signed in
  to claude.ai); the canvas's logic was run outside the page.
- 2026-11-16: canvas approved by Vincent ("Looks right"). The line
  beside the button, the filled and plain buttons and the words are now
  in Behaviour. Still a draft: open question 1, then the spike.
- 2026-11-16: approved by Vincent, with the game's functions. Spike
  0.0.10 written (`csMissions`, `csAccept`, `csCancel`, `csHandIn` in
  FS25_CompanionSpike, tested offline on a stub manager in
  `mod/tests/test_spike_contracts.py`; pytest 130) and its zip copied
  into the game's mods folder. Not run in the game yet: the Spike first
  boxes are open.
- 2026-11-16: spike, part one (Vincent, the copy in slot 3, read only):
  `missions-start.json`. The game is the server; `startMission`,
  `cancelMission`, `dismissMission`, `getMissionByUniqueId` and
  `hasFarmReachedMissionLimit` are functions; the limit is 3; 29
  contracts, one of them running for farm 1. `MissionStartState` has
  the script's seven names and `NO_PERMISSION`; `MissionFinishState`
  has `NONE` (1), which an unfinished contract carries. The three menu
  events exist. `getTotalReward()` gives nothing for a harvest contract
  on offer (0 for the other kinds): the mod reads `total` only on a
  finished one, as drafted. The spike's by-name lookup tried
  `loadstring` once and the game logged an Error ("Disabled for
  security reasons"): harmless, removed from the spike's source; the
  mod never uses it. Part two (the changes) is open.
- 2026-11-16: spike, part two (Vincent, the copy in slot 3), from the
  recordings in `modSettings/FS25_CompanionSpike/` and what he saw:
  - `csAccept b27eee lease` (cultivating, Farmland 146): `startMission`
    returned `OK`; preparing the same frame, your farm's, with
    `spawnedVehicles`; the two machines there after 0.5 and 0.7 s, then
    running. No money moved; the total read −400 (the lease) from then
    on. Vincent: both machines stood at the shop.
  - `csAccept b25d9d own` (cultivating, Farmland 57): `OK`, running
    after 0.2 s, no machines; the farm then held three and
    `hasFarmReachedMissionLimit` turned true.
  - `csCancel b27eee`: `cancelMission` returned true; finished and
    `CANCELED` the same frame, the leased machines gone the same frame
    (Vincent: gone at the shop too), `stealingCost` 0, total still −400.
  - `csHandIn b27eee`, typed with the game's menu open: `dismissMission`
    returned true; the same frame the money went from 8,133,976.5 to
    8,133,576.5 (−400, the total), the contract left the list and the
    limit was free again.
  - Vincent: the game's own contracts screen followed every step;
    nothing opened by itself (no dialog, menu or message); after a save
    and a load the contracts were as the commands left them. The game's
    log has no error from the calls.
  - Not run: a hand-in of a successful contract (the reimbursement),
    `isSpawnSpaceAvailable()` false, and a refusal from `startMission`.
    They stay in the live check.
  Open question 1 is settled: the build uses the game's functions.
