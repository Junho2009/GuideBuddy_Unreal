# MVP03_LLM_COACHING_LOOP 结果台账

- Baseline: `MVP03_LLM_COACHING_LOOP@v0.1`
- Accepted Run: `aiflow/contracts/runs/MVP03_LLM_COACHING_LOOP.run-001.yaml`
- Evidence Index: `aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/index.md`
- Status: accepted

## Accepted Summary

MVP03 已通过自动验收。生成器读取 MVP02 accepted evidence 中的 `attempt_summary.json` 与 `diagnosis.json`，通过可替换的 `local_rule_template` provider 生成 `coaching.json`，不调用真实 LLM API。

Accepted run 将 `posture_break_into_execution` 诊断转成单问题复盘卡：一句诊断、一条事件证据、下一局只练一个动作和可验证成功条件。输出同时包含 `practice_objective` 与受控的 `drill_spec_candidate`，后者仅引用白名单模板 `single_enemy_execution_response` 与白名单参数名。

运行时接入方面，战斗结束界面现在提供“重新挑战”和“复盘一下”两个按钮。“复盘一下”会触发 guide request 快照，并写出 `combat_events.jsonl`、`attempt_summary.json`、`diagnosis.json` 和 `coaching.json`；“重新挑战”会重载当前关卡回到刚进入场景的状态。runtime verifier 使用 fake `GuideBuddyBridge` 重放真实 gameplay 片段，并确认 `coaching.json` 的 primary failure 与 runtime diagnosis 对齐。

## Checks

- TypeScript build: pass
- Coaching output schema: pass
- Replaceable local provider: pass
- High-signal LLM input summary: pass
- Single-issue review card: pass
- Practice objective: pass
- Drill Spec candidate whitelist: pass
- Insufficient evidence coaching guard: pass
- Runtime guide request coaching snapshot: pass

## Remaining Risks

- 当前 provider 是本地规则模板，表达质量足够验收但不等同于真实 LLM 的语气和泛化能力。
- 玩家水平暂用 `player_level_assumption=novice`，尚未接长期玩家画像。
- `drill_spec_candidate` 尚未被 UE 侧模板实际消费；MVP04 需要实现模板映射、参数验证和训练场生成。
- 当前复盘内容已可在运行时 UI 复盘卡展示；视觉样式仍是 MVP 级 Slate 实现，后续可替换为正式 HUD / UMG。

## Next Step

进入 `MVP04_ADAPTIVE_DRILL_GENERATION`，读取 `drill_spec_candidate`，用 UE 侧白名单模板生成受控的针对性练习场。
