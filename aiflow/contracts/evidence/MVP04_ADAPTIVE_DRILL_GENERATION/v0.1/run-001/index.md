# MVP04_ADAPTIVE_DRILL_GENERATION Evidence Index

- Baseline: `MVP04_ADAPTIVE_DRILL_GENERATION@v0.1`
- Run: `MVP04_ADAPTIVE_DRILL_GENERATION.run-001`
- Source MVP03 Fixture: `aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/raw/`
- Archived Raw Root: `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/`
- Generated At: `2026-05-05T14:30:00.000Z`

## Evidence

| Type | Path | Description |
|---|---|---|
| Attempt summary | `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/attempt_summary.json` | Archived MVP03 attempt summary. |
| Diagnosis | `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/diagnosis.json` | Archived MVP03 diagnosis input. |
| Coaching | `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/coaching.json` | MVP03 coaching output consumed by MVP04. |
| Drill Spec | `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/drill_spec.json` | MVP04 validated formal Drill Spec. |
| Drill Session | `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/drill_session.json` | MVP04 template request and source trace. |
| Runtime request verifier | `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/runtime_request_verifier.json` | Runtime guide request wrote drill artifacts beside coaching output. |
| Run record | `aiflow/contracts/runs/MVP04_ADAPTIVE_DRILL_GENERATION.run-001.yaml` | Accepted verifier run record. |
| Verifier run | `npm run verify:mvp04` | Passed automatic MVP04 drill generation checks. |

## Observed Drill

- Primary failure: `posture_break_into_execution`
- Practice objective: `practice.posture_break_into_execution.avoid_execution_setup`
- Drill template: `single_enemy_execution_response`
- Drill id: `drill.20260505071706_uedpie_0_sampledemoshowcasemap_706178.practice_posture_break_into_execution_avoid_execution_setup`
- Session id: `session.20260505071706_uedpie_0_sampledemoshowcasemap_706178.avoid_execution_setup`
- Metric ids: `terminal_execution_count, enemy_execution_after_player_death, defensive_input_before_execution_window`

## Rejection Guards

- `reject-unsupported-template`: rejected (Unsupported drill template_id for MVP04: freeform_boss_arena)
- `reject-unknown-parameter`: rejected (drill_spec_candidate.parameters contains non-whitelisted fields: spawn_budget)
- `reject-unsafe-fields`: rejected (Unsafe string rejected at drill_spec_candidate.parameters.focus)
- `reject-insufficient-evidence`: rejected (MVP04 only generates drills from coaching_ready output. status=insufficient_evidence)

## Runtime Guide Request

- Trigger: `battle_end_review_button`
- Drill template: `single_enemy_execution_response`
- Drill session suffix: `guide_requests/request-001/drill_session.json`

## Notes

- MVP04 consumes `coaching.json` and does not read raw combat event logs.
- The accepted template is limited to `single_enemy_execution_response`.
- Drill artifacts contain a whitelist template request and traceability metadata, not free-form Unreal scene instructions.
