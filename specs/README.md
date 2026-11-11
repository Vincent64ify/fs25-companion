# Specs

One file per feature, written before the code and kept up to date until the
feature is confirmed in game. A spec says what the feature does and how
we'll know it works; the code is built and checked against it.

## How a feature goes

1. **Draft:** copy [_template.md](_template.md) to `NNNN-short-name.md` (the
   next free number) and fill in Goal, Behaviour, Data contract and
   Acceptance. `/spec new <name>` does this in Claude Code.
2. **Approved:** Vincent reads it and changes what's wrong. No code before
   this.
3. **Built:** the automated acceptance tests are written first, then the
   code until they pass. The Plan section is the checklist.
4. **Live-checked:** the live check boxes are ticked in game. Verified API
   names move to [GAME-API.md](../docs/GAME-API.md), the spec's status
   changes in the table below, and the Log says when.

Where the other docs fit:
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md): how the parts work together,
  and the ground rules.
- [GAME-API.md](../docs/GAME-API.md): the verified game API facts.
- [THEMES.md](../docs/THEMES.md): the design (look, layout, research). A
  spec links to its design section instead of copying it.
- [NEXT.md](../docs/NEXT.md): small fixes that don't need a spec, and
  features waiting for one.
- [PLAN.md](../docs/PLAN.md): later ideas.

**Feature detail lives here, and only here.** A feature's behaviour, data
contract, commands, checks and log go in its spec; its status goes in the
table below. THEMES.md keeps only its look and layout, with a link to the
spec; GAME-API.md gets the API facts once they're verified.

A fix found during a live check goes in the spec's Log and, if it changes
behaviour, in Behaviour too: the spec always says what the code does now.

## Specs

| # | Feature | Status | Mod |
|---|---|---|---|
| [0001](0001-harvester-screen.md) | Harvester screen | live-checked (revision 3: the field panel) | 0.8.4 |
| [0002](0002-vehicle-screen.md) | Vehicle and Loader screens | live-checked (revision 2) | 0.8.6 |
| [0003](0003-implement-screen.md) | Vehicle page with a card per tool (Implement merges in) | live-checked (closed 2026-10-31: mowers and trailers; the other rigs move to their own specs) | 0.8.17 |
| [0004](0004-acks-survive-rotation.md) | Command answers survive a stream rotation (review F1) | live-checked | 0.8.13 |
| [0005](0005-tailer-sees-every-new-file.md) | The client notices every new stream file (review F2) | live-checked | no change |
| [0006](0006-one-local-process.md) | One local process (SIMPLIFY S1) | live-checked | no change |
| [0007](0007-protocol-in-one-place.md) | The protocol in one place (SIMPLIFY S2) | live-checked | 0.9.0 |
| [0008](0008-commands-say-the-state.md) | Commands say the state they want (SIMPLIFY S3) | live-checked (AI worker left out: PLAN.md) | 0.10.0 |
| [0009](0009-one-way-to-run-each-action.md) | One way to run each action (SIMPLIFY S4) | live-checked (the All row's keys fixed on the way) | 0.11.2 |
| [0010](0010-tidy-states-and-motion.md) | Tidy states, surfaces and motion | live-checked (revision 2: selecting) | no change |
| [0011](0011-sprayer.md) | Sprayer: Fold, Turn on, the working width | live-checked (closed with 0012's check; Precision Farming off checked 2026-11-10: the width keys' sign fixed) | 0.17.3 |
| [0012](0012-card-buttons.md) | Card buttons: what a tool has, what it can do now | live-checked (every rig on the farm; Tip's fade on a side that can't tip: spec 0015) | 0.13.3 |
| [0013](0013-vehicle-screen-calm.md) | Vehicle page, calm: rig strip, tool cards, field panel, no yellow at night | live-checked with revisions 2 to 4 (Precision Farming off checked 2026-11-10); revision 5 live-checked (cards front to back); revision 6 live-checked (failures on the button only); revision 7 live-checked (Also attached over the field panel, the strip fits) | 0.15.0 |
| [0014](0014-checked-pipe-tipside-cover.md) | Pipe, Tip side and Cover answer once they moved | live-checked | 0.16.0 |
| [0015](0015-trailer-tip-fades.md) | Trailer: Tip fades when the game won't tip | live-checked (the engine off; the side fades removed: NEXT.md) | 0.17.1 |
| [0016](0016-attach.md) | Attach: Drive's sixth button, lit while the game has something in reach | live-checked (Engine one column wide) | no change |

## Before the specs

Built before 2026-10-25, with no spec of their own:

- **Phases 0 to 4** (2026-10-20): the file stream, the companion, and the
  Leaflet map with the PDA's places, every vehicle, farmlands and fields.
  They run live on Windows (Solek, and Kinlaig, a paid DLC map).
- **Themes T0 to T6** (2026-10-23 and 24): the New Holland style with its
  chrome, Map and Vehicle screens, tablet sizes and full screen. T6's game
  data is built, its names not confirmed in game
  ([GAME-API.md](../docs/GAME-API.md#not-verified-yet)).
  The design is in [THEMES.md](../docs/THEMES.md).
- **Controls C0 to C3** (2026-10-24, mod 0.7.1): the command channel, then
  lights, cruise, engine, AI worker and the tools from the dashboard, down
  to picking one tool. They work live on Windows.
- **The Implement screen** (mod 0.8.0), merged into the Vehicle page by
  spec 0003.

Two plans from that time are done and became specs: the code review of
2026-10-30 (F1 and F2 are specs 0004 and 0005, F5 to F7 were fixed in mod
0.8.12, F4 was fixed on 2026-11-10 with a queue per viewer, F3 waits for a hosted relay)
and the Simplify plan (S1 to S4 are specs 0006 to 0009).

Older specs still name `DONE.md`, `SIMPLIFY.md` and
`REVIEW-2026-10-30.md`. They were removed on 2026-11-09, with the history
that was in PLAN.md and THEMES.md (how T0 to T6 and the Implement screen
were built): the game API facts are now in
[GAME-API.md](../docs/GAME-API.md), and the rest is in git
(`git show b92423b:docs/DONE.md`).
