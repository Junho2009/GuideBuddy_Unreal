# MVP01_COMBAT_TELEMETRY_FOUNDATION Evidence Index

- Baseline: `MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1`
- Run: `MVP01_COMBAT_TELEMETRY_FOUNDATION.run-001`
- Raw Evidence Root: `Saved/GuideBuddy/Telemetry/20260504022450_UEDPIE_0_SampleDemoShowcaseMap_861420/`
- Generated At: `2026-05-04T10:24:50+08:00`

## Evidence

| Type | Path | Description |
|---|---|---|
| Raw events | `Saved/GuideBuddy/Telemetry/20260504022450_UEDPIE_0_SampleDemoShowcaseMap_861420/combat_events.jsonl` | Real PIE gameplay JSONL event stream with 1912 events. |
| Attempt summary | `Saved/GuideBuddy/Telemetry/20260504022450_UEDPIE_0_SampleDemoShowcaseMap_861420/attempt_summary.json` | Summary containing `run_id`, `map`, `start_time`, `end_reason`, `last_events`, and `damage_summary`. |
| Verifier run | `npm run verify:mvp01` | Passed against the latest telemetry run. |
| TypeScript build | `npm run build:guidebuddy` | Passed. |
| Unreal build | `UnrealBuildTool UnrealEditor Win64 Development` | Passed. |
| Diff hygiene | `git diff --check` | Passed; only CRLF conversion warnings were reported for changed text files. |

## Observed Event Coverage

- `attempt_start`: 1
- `state_activated`: 74
- `player_input`: 1755
- `ability_activated`: 48
- `combat_status_changed`: 14
- `attribute_changed`: 15
- `damage`: 4
- `attempt_end`: 1

## Observed Combat Summary

- Player events: 1812
- Enemy events: 94
- Hits taken: 1
- Total damage taken: 50
- Hits dealt: 3
- Total damage dealt: 30
- Duration: 34.944321896880865 seconds
- End reason: `world_cleanup`

## Notes

- This evidence was produced by a real PIE gameplay smoke in `UEDPIE_0_SampleDemoShowcaseMap`.
- The accepted run includes natural player input, enemy role events, combat status changes, health attribute changes, and damage.
