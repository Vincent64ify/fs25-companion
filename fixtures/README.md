# Fixtures

Recorded mod output, used by the tests and for replay
(`python client/companion_client.py --local --replay <file>`).

| file | protocol | what |
|---|---|---|
| `spike_solek_pose.ndjson` | spike (v0) | Phase 0 raw recording on Solek: positions at 5 Hz, on foot and in a tractor |
| `spike_solek_pda.json` | – | the PDA parts of the Phase 0 report (`extract_spike_report.py`): every hotspot and the farm's four vehicles, as the game reported them |
| `solek_v1.ndjson` | v1 | the spike recording plus `spike_solek_pda.json`, converted to v1 by `convert_spike.py`. Positions, vehicle headings while driving, hotspots, vehicles and farmland owners are real. The on-foot heading is derived from movement, parked headings and `env` are synthetic, and the farmland grid is a made-up Voronoi diagram around the real farmland centres |

Regenerate with:

```bash
python fixtures/convert_spike.py fixtures/spike_solek_pose.ndjson fixtures/spike_solek_pda.json fixtures/solek_v1.ndjson
```

Replace `solek_v1.ndjson` with a real v1 session as soon as one is
recorded (`--record`). The backend tests validate every v1 fixture here.
