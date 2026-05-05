# MVP02_DIAGNOSTIC_SIGNAL_LAYER Evidence Index

- Baseline: `MVP02_DIAGNOSTIC_SIGNAL_LAYER@v0.1`
- Run: `MVP02_DIAGNOSTIC_SIGNAL_LAYER.run-001`
- Source MVP01 Fixture: `aiflow/contracts/evidence/MVP01_COMBAT_TELEMETRY_FOUNDATION/v0.1/run-002/raw/`
- Archived Raw Root: `aiflow/contracts/evidence/MVP02_DIAGNOSTIC_SIGNAL_LAYER/v0.1/run-001/raw/`
- Generated At: `2026-05-05T10:23:45.401Z`

## Evidence

| Type | Path | Description |
|---|---|---|
| Raw events | `aiflow/contracts/evidence/MVP02_DIAGNOSTIC_SIGNAL_LAYER/v0.1/run-001/raw/combat_events.jsonl` | Archived MVP01 gameplay event stream used as MVP02 diagnosis input. |
| Attempt summary | `aiflow/contracts/evidence/MVP02_DIAGNOSTIC_SIGNAL_LAYER/v0.1/run-001/raw/attempt_summary.json` | Archived MVP01 attempt summary. |
| Diagnosis | `aiflow/contracts/evidence/MVP02_DIAGNOSTIC_SIGNAL_LAYER/v0.1/run-001/raw/diagnosis.json` | MVP02 deterministic diagnosis output. |
| Run record | `aiflow/contracts/runs/MVP02_DIAGNOSTIC_SIGNAL_LAYER.run-001.yaml` | Accepted verifier run record. |
| Verifier run | `npm run verify:mvp02` | Passed automatic MVP02 diagnosis checks. |

## Observed Diagnosis

- Primary failure: `posture_break_into_execution`
- Confidence: 0.88
- Practice focus: `avoid_posture_break_into_execution`
- 中文速读: 已找到可诊断的失败窗口。本次主要问题：架势崩溃后被处决。诊断置信度：高（88%）。
- Evidence seqs: `1257, 1258, 1259, 1260, 1262, 1263, 1264, 1265, 1266, 1268, 1269, 1270, 1271, 1272, 1286, 1294, 1295, 1298, 1299, 1300, 1301, 1302, 1304, 1305, 1306, 1307, 1308, 1311, 1312, 1313, 1314, 1315`
- Events read: 1399

## Notes

- The source input is copied from accepted MVP01 real gameplay evidence, not authored by hand.
- The verifier also checks an insufficient-evidence fixture to ensure MVP02 does not force unsupported attribution.
- MVP02 keeps `llm_review.enabled=false`; real LLM review is reserved for a later optional path.
