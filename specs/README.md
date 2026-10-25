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
   names move to [DONE.md](../docs/DONE.md), the spec's status changes, and
   the Log says when.

Where the other docs fit:
- [PLAN.md](../docs/PLAN.md): the roadmap, the ground rules, and which spec
  is next. Its Open checks point here for features that have a spec.
- [DONE.md](../docs/DONE.md): what's built and the verified game API facts.
- [THEMES.md](../docs/THEMES.md): the design (look, layout, research). A
  spec links to its design section instead of copying it.
- [NEXT.md](../docs/NEXT.md): small fixes that don't need a spec.

**From 2026-10-25 on, feature detail lives here.** A feature's behaviour,
data contract, commands, checks and log go in its spec and nowhere else.
THEMES.md keeps only its look and layout, with a link to the spec; DONE.md
gets a one-line entry and the API facts once they're verified. Features
built before this (T0 to T6, the Implement screen) stay as they are in
THEMES.md.

A fix found during a live check goes in the spec's Log and, if it changes
behaviour, in Behaviour too: the spec always says what the code does now.

## Specs

| # | Feature | Status | Mod |
|---|---|---|---|
| [0001](0001-harvester-screen.md) | Harvester screen | live-checked (revision 2) | 0.8.4 |
