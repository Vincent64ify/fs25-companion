# Fixtures

Recorded mod output, used by the tests and for replay
(`python client/companion_client.py --local --replay <file>`).

| file | protocol | what |
|---|---|---|
| `spike_solek_pose.ndjson` | spike (v0) | Phase 0 raw recording on Solek: positions at 5 Hz, on foot and in a tractor |
| `solek_v1.ndjson` | v1 | the spike recording converted to v1 by `convert_spike.py`. Positions and vehicle headings are real. The on-foot heading is derived from movement, and `env` is synthetic |

Replace `solek_v1.ndjson` with a real v1 session as soon as one is
recorded (`--record`). The backend tests validate every v1 fixture here.
