# MVP02_DIAGNOSTIC_SIGNAL_LAYER 结果台账

- Baseline: `MVP02_DIAGNOSTIC_SIGNAL_LAYER@v0.1`
- Accepted Run: `aiflow/contracts/runs/MVP02_DIAGNOSTIC_SIGNAL_LAYER.run-001.yaml`
- Evidence Index: `aiflow/contracts/evidence/MVP02_DIAGNOSTIC_SIGNAL_LAYER/v0.1/run-001/index.md`
- Status: accepted

## Accepted Summary

MVP02 诊断信号层已通过自动验收。诊断器读取 MVP01 归档 gameplay evidence 的 `combat_events.jsonl` 与 `attempt_summary.json`，生成 `diagnosis.json`。

Accepted run 将包含 `State.Death` 与敌人 `Execution` 信号的真实 gameplay fixture 诊断为 `posture_break_into_execution`，置信度 `0.88`，并保留证据窗口、`evidence_event_seqs`、`practice_objective_seed` 和 `llm_review.enabled=false` 占位。

Verifier 还运行了一个无死亡、无伤害的最小 fixture，确认输出保持为 `insufficient_evidence`，不会在证据不足时强行归因。

在运行时接入方面，MVP02 建立了 `guide_request` 快照路径。当前产品化入口已由 MVP03 接到战斗结束界面的“复盘一下”按钮；玩家点击后，GuideBuddy 会发出 `guide_request` 信号，并在当前 run 下生成 `guide_requests/request-001/` 快照，包含 `combat_events.jsonl`、`attempt_summary.json` 和 `diagnosis.json`。

运行时现在会在游戏画面显示采集启动、诊断保存成功或失败状态。编辑器 PIE 仍写入项目 `Saved/GuideBuddy/Telemetry/`；打包游戏写入游戏 exe 所在目录下的 `GuideBuddy/Telemetry/`，便于持久化到玩家本机。

## Checks

- TypeScript build: pass
- Diagnosis output schema: pass
- Deterministic fatal attribution: pass
- Practice objective seed: pass
- Insufficient evidence guard: pass
- Runtime guide request snapshot: pass
- UnrealEditor target build: pass
- Evidence archive: pass
- Chinese readable diagnosis record: pass

## Readable Diagnosis Note

`diagnosis.json` now includes a `readable_zh` section so a human can open the saved record directly and see a Chinese summary, Chinese evidence lines, the readable failure label, confidence level, and the next suggested practice focus. The original machine-readable `deterministic`, `final`, `practice_objective_seed`, and `llm_review` fields remain unchanged as the structured contract.

## Remaining Risks

- 当前 accepted fixture 主要覆盖处决死亡归因；闪避时机、过度承诺等诊断类型仍需要更多真实 gameplay 样本增强。
- 输出仍使用内部 tag 和资产名，玩家可读表达需要 MVP03 或显示名映射补充。
- MVP01 事件边界尚未提供完整攻击前摇、硬直和防御窗口语义。
- 当前运行时入口已产品化为战斗结束 Slate 界面按钮；后续可继续补手柄映射与更完整的 HUD/UMG 样式。
- 当前保存状态提示仍包含 UE on-screen debug message，后续可替换为正式 HUD / UMG 状态组件。

## Next Step

进入 `MVP03_LLM_COACHING_LOOP`，基于 `diagnosis.json` 和 `practice_objective_seed` 生成短导玩建议、最小练习目标和 Drill Spec 草案。
