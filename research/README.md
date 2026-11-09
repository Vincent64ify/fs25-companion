# Research

The probes that found out how the game works, and the data they
recorded. Nothing here is part of the product: the mod, the companion and
the dashboard don't load it, and the tests touch only
`mod/tests/test_spike_keys.py` (the spike mod's key tracer). What they
proved is in [GAME-API.md](../docs/GAME-API.md):
read that, not the code, for what's true.

| What | Proved | Notes |
|---|---|---|
| [spike/FS25_CompanionSpike](spike/README.md) (0.0.8) | Phase 0's API facts; spike 0.0.2 for the Vehicle screen (spec 0002); 0.0.4 to 0.0.8 for the Vehicle page's cards, the All row, the fold and tip keys (spec 0003) | how to run it and what to send back: [spike/README.md](spike/README.md) |
| [spike/FS25_CommandSpike](spike/README.md#command-spike-c0) (0.1.2) and `spike/command_spike.py` | C0: the mod reads a file the companion writes, every frame, and runs an input action by name | the command path in `mod/src/Commands.lua` grew from it |
| `spike_solek_pose.ndjson`, `spike_solek_pda.json` | Phase 0's recording on Solek and the PDA parts of its report (`extract_spike_report.py`) | `convert_spike.py` turns them, with `fixtures/solek_farmlands.json`, into `fixtures/solek_v1.ndjson`, the replay and the golden test's input |

To rebuild the replay fixture (only when the converter changes; the
golden test then needs `GOLDEN_UPDATE=1` on purpose):

```bash
python research/convert_spike.py research/spike_solek_pose.ndjson research/spike_solek_pda.json \
    fixtures/solek_farmlands.json fixtures/solek_v1.ndjson
```

What stays outside: `scripts/rig_check.py`, `scripts/allrow_check.py` and
`scripts/livewatch.py` (live checks), and the rig dumps in
`mod/tests/fixtures/spike0003/` with `mod/tests/spike_rigs.lua`
(`run.lua`'s capability tests read them).
