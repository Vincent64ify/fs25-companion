# Fixtures

Recorded mod output, used by the tests and for replay
(`python -m companion --replay <file>`).

| file | protocol | what |
|---|---|---|
| `spike_solek_pose.ndjson` | spike (v0) | Phase 0 raw recording on Solek: positions at 5 Hz, on foot and in a tractor |
| `spike_solek_pda.json` | – | the PDA parts of the Phase 0 report (`extract_spike_report.py`): every hotspot, the farm's four vehicles and the 162 fields (id, farmland, position; the first one's state), as the game reported them |
| `solek_farmlands.json` | v1 data | the last `farmlands` and `farmland_grid` of the first live Phase 3 session on Solek (`extract_stream.py`) |
| `solek_v1.ndjson` | v1 | the spike recording plus the two files above, converted to v1 by `convert_spike.py`. Positions, vehicle headings while driving, hotspots, vehicles, farmlands and the farmland grid are real. The on-foot heading is derived from movement; parked headings, `env` and `crop_types` are synthetic. Field positions are real but the outlines are rectangles grown inside the real farmlands, and every field state but the first is made up |
| `golden_viewer.ndjson` | viewer messages | not envelopes: every message the dashboard's viewers got when `tests/test_golden.py` replayed `solek_v1.ndjson` and sent its commands (docs/SIMPLIFY.md, S0). Rewrite with `GOLDEN_UPDATE=1 python -m pytest tests/test_golden.py`, only when a change to what viewers get is on purpose |

Regenerate with:

```bash
python fixtures/convert_spike.py fixtures/spike_solek_pose.ndjson fixtures/spike_solek_pda.json \
    fixtures/solek_farmlands.json fixtures/solek_v1.ndjson
```

Replace `solek_v1.ndjson` with a real v1 session as soon as one is
recorded (`--record`). The backend tests validate every v1 fixture here (not `spike_*` or `golden_*`).
