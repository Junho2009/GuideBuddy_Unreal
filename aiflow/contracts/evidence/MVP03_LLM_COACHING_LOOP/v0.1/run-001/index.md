# MVP03_LLM_COACHING_LOOP Evidence Index

- Baseline: `MVP03_LLM_COACHING_LOOP@v0.1`
- Run: `MVP03_LLM_COACHING_LOOP.run-001`
- Source MVP02 Fixture: `aiflow/contracts/evidence/MVP02_DIAGNOSTIC_SIGNAL_LAYER/v0.1/run-001/raw/`
- Archived Raw Root: `aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/raw/`
- Generated At: `2026-05-05T12:00:00.000Z`

## Evidence

| Type | Path | Description |
|---|---|---|
| Attempt summary | `aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/raw/attempt_summary.json` | Archived MVP02 attempt summary used as MVP03 context. |
| Diagnosis | `aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/raw/diagnosis.json` | Archived MVP02 deterministic diagnosis input. |
| Coaching | `aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/raw/coaching.json` | MVP03 coaching output, practice objective, and Drill Spec candidate. |
| Run record | `aiflow/contracts/runs/MVP03_LLM_COACHING_LOOP.run-001.yaml` | Accepted verifier run record. |
| Verifier run | `npm run verify:mvp03` | Passed automatic MVP03 coaching checks. |

## Observed Coaching

- Primary failure: `posture_break_into_execution`
- Advice focus: `avoid_execution_setup`
- Practice objective: `practice.posture_break_into_execution.avoid_execution_setup`
- Drill template: `single_enemy_execution_response`
- Player action: 下一局只练一件事：看到敌人进入处决或特殊动作前兆时，先不要贪输出，立刻停手后撤或防御。
- Insufficient-evidence guard: `insufficient_evidence` -> `telemetry_capture_repeat`

## Notes

- The generator uses a replaceable local provider; no real LLM API is called in MVP03.
- `llm_input_summary` carries a small evidence slice from `diagnosis.json`, not the raw combat event stream.
- `drill_spec_candidate` only references the template and parameter whitelist for MVP04 validation.
