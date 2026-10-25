---
description: Draft, build or close a feature spec in specs/
argument-hint: new <name> | build <NNNN> | check <NNNN> | status
---

Work with the feature specs in `specs/` (workflow in `specs/README.md`).
Arguments: $ARGUMENTS

- **new <name>:** take the next free number, copy `specs/_template.md` to
  `specs/NNNN-<name>.md`, and fill in Goal, Behaviour, Data contract,
  Commands and Acceptance from what the user describes, the design in
  `docs/THEMES.md` and the code. Mark every game API name verified (with
  its place in `docs/DONE.md`) or unverified. Add a row to the table in
  `specs/README.md`. Status: draft. Ask the user the open questions, then
  stop: no code until they approve.
- **build <NNNN>:** the spec must be approved (ask if it isn't). Fill in
  Plan if it's empty, write the automated acceptance tests first, then the
  code until they pass. Run the pytest suites and `web/test.html` through
  the `replay-solek` launch config. Tick the automated boxes, set Status to
  built, add a Log line, and update the spec wherever the code ended up
  different from it.
- **check <NNNN>:** the user has run the live check. Go through the Live
  check boxes with them: tick what they confirmed, turn what failed into
  fixes (in the spec's Log, and in Behaviour if it changes). When all are
  ticked: move verified API names into `docs/DONE.md`, set Status to
  live-checked, and update `specs/README.md` and "Where things stand" in
  `docs/PLAN.md`.
- **status (or no arguments):** list the specs with their status and the
  live checks still open, from `specs/README.md` and each spec.
