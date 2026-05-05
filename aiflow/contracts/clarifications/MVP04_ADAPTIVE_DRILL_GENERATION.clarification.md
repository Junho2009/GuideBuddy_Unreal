# MVP04_ADAPTIVE_DRILL_GENERATION Clarification

## One-Sentence Goal

MVP04 turns the MVP03 `drill_spec_candidate` into a validated, reproducible `drill_spec.json` and `drill_session.json` that a UE-side whitelist template can execute without accepting free-form scene instructions.

## Scope

- Read `coaching.json`.
- Validate `practice_objective` and `drill_spec_candidate`.
- Accept only the first supported template: `single_enemy_execution_response`.
- Normalize the candidate into `guidebuddy.drill_spec.v1`.
- Write `drill_spec.json` and `drill_session.json` with source links back to attempt, diagnosis, coaching, and practice objective.
- Reject non-whitelisted template ids, unknown candidate fields, unknown parameter names, unsafe field names, unsafe string values, and unsupported `insufficient_evidence` coaching.

## Out Of Scope

- No Blueprint graph generation or mutation.
- No arbitrary asset paths, class names, console commands, or scripts from LLM output.
- No multi-enemy encounter composition.
- No full training level editor.
- No online drill distribution or cloud personalization.
- No MVP05 evaluation result; MVP04 only prepares telemetry-evaluable session metadata.

## Verification Defaults

- Automatic verifier uses the accepted MVP03 evidence fixture.
- Automatic verifier checks the happy path and explicit rejection fixtures.
- Human smoke remains limited to reading the generated drill files and confirming they describe one small practice objective.

## Confirmation

The user explicitly asked to start implementation, so this clarification is treated as confirmed for the `MVP04_ADAPTIVE_DRILL_GENERATION@v0.1` implementation slice.
