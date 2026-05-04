# MVP01_COMBAT_TELEMETRY_FOUNDATION 结果台账

- Baseline: `MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1`
- Accepted Run: `aiflow/contracts/runs/MVP01_COMBAT_TELEMETRY_FOUNDATION.run-001.yaml`
- Evidence Index: `aiflow/contracts/evidence/MVP01_COMBAT_TELEMETRY_FOUNDATION/v0.1/run-001/index.md`
- Status: accepted

## Accepted Summary

MVP01 战斗遥测基础已通过真实 PIE gameplay 验收。GuideBuddyRuntime 能在 `SampleDemoShowcaseMap` PIE world 中启动 Puerts TypeScript 流水线，并输出 `combat_events.jsonl` 与 `attempt_summary.json`。

Accepted run 为 `Saved/GuideBuddy/Telemetry/20260504022450_UEDPIE_0_SampleDemoShowcaseMap_861420/`，包含 1912 条事件，覆盖玩家输入、敌人动作、combat status 变化、属性变化和 damage。该 run 不是 synthetic telemetry injection。

## Checks

- TypeScript build: pass
- UnrealEditor target build: pass
- Telemetry output exists: pass
- JSON / JSONL parse: pass
- Minimum event coverage: pass
- Attempt summary content: pass
- `git diff --check`: pass

## Remaining Risks

- 本轮 run 验证了受击尝试；尚未要求玩家死亡作为 MVP01 阻塞条件。
- MVP02 若需要更精细归因，可能还要补充招式显示名、攻击窗口或命中原因映射。

## Next Step

进入 `MVP02_DIAGNOSTIC_SIGNAL_LAYER`，基于真实 gameplay 的 `combat_events.jsonl` 和 `attempt_summary.json` 生成确定性诊断信号。
