# Telemetry mod

Lua mod that exports live telemetry to the Windows named pipe
`\\.\pipe\fssimx` (same pipe name and wire format as the
[LS25_FSTelemetry](https://github.com/upsidedownLS13/LS25_FSTelemetry)
base mod, MIT licensed).

## Install

Zip the **contents** of this folder (so `modDesc.xml` is at the zip root),
and put the zip into your FS25 `mods/` folder. Enable it in the mod list.

## Notes

- The pipe is created by the companion client (see `../client`). The game
  connects to it. If no client is running, `io.open` fails and telemetry is
  silently skipped — no effect on the game.
- The mod re-opens the pipe every 100 updates (~1.6 s); consumers must
  handle repeated connect/disconnect.
- Telemetry is throttled to ~60 Hz; the client typically downsamples to a
  few Hz.
- `multiplayer supported="true"` — in MP the mod runs on every machine; the
  one whose player you're watching is the one whose pipe you read.

## Telemetry fields

Session: `SessionId`, `MapId` (matches careerSavegame.xml's `<mapId>` —
the dashboard uses it to pick the map image), `MapName`, `PlayerName`, `IsMultiplayer`

Game: `Money`, `TemperatureMin/Max/Trend`, `WeatherCurrent/Next`,
`DayTimeMinutes`, `Day`

Player: `PositionX/Y/Z`, `Heading` (0 = north, clockwise; calibrate with
`headingOffset` in the map config)

Vehicle: `IsDrivingVehicle`, `VehicleName`, `Speed` (km/h), `RPM` (+ min/max),
`Gear`, `Fuel`/`FuelMax`, `Wear` (0–1), `OperationTimeMinutes`,
`MotorTemperature`, `Mass`, `TotalMass`, `IsEngineStarted`, lights
(`IsLightOn`, `IsLightHighOn`, `IsLightTurnLeftOn`, `IsLightTurnRightOn`,
`IsLightHazardOn`, `IsLightBeaconOn`)

Implements (per attachment slot, front to back):
`AttachedImplementsPosition`, `AttachedImplementsLowered`,
`AttachedImplementsTurnedOn`, `AttachedImplementsWear` — recursive up to
6 levels deep. Other mods can inject extra per-implement data via
`object.FStelemetryAddonData` (same hook as the base mod).

## Open items

- Verify `missionInfo.name` / `player.nickname` field names on a real FS25
  install (they're guarded, worst case they come out empty).
- `Heading` convention: the mod sends `deg(-rotY) % 360`; drive north and
  set `headingOffset` in the map config if the marker points the wrong way.
