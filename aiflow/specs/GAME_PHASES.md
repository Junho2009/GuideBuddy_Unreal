# GuideBuddy MVP 阶段路线

## 当前路线

| Phase | 名称 | 目标 | 当前状态 |
|---|---|---|---|
| `MVP00_CONTEXT_ALIGNMENT` | 上下文收口 | 将迁移来的 aiflow 项目上下文切换为 GuideBuddy 黑客松 MVP | 已完成 |
| `MVP01_COMBAT_TELEMETRY_FOUNDATION` | 战斗遥测基础 | 在 `SampleDemoShowcaseMap` 中采集一次尝试所需的语义化战斗事件 | 已验收 |
| `MVP02_DIAGNOSTIC_SIGNAL_LAYER` | 诊断信号层 | 把事件流转成可解释、可指导、可验证的诊断信号，并预留可选 LLM 复核 | 未开始 |
| `MVP03_LLM_COACHING_LOOP` | LLM 导玩与练习目标 | 基于诊断摘要生成适合玩家水平的指导、最小练习目标和 Drill Spec 草案 | 未开始 |
| `MVP04_ADAPTIVE_DRILL_GENERATION` | 自适应针对性练习场 | 根据 Drill Spec 用受控模板生成专门练习当前问题的训练场 | 未开始 |
| `MVP05_EVALUATION_AND_ITERATION` | 效果评估与迭代 | 记录指导或练习后的表现，判断目标错误是否减少并迭代策略 | 未开始 |

## 推荐执行顺序

当前建议严格按顺序推进：

1. 先做 `MVP01_COMBAT_TELEMETRY_FOUNDATION`，让系统能记录事实。
2. 再做 `MVP02_DIAGNOSTIC_SIGNAL_LAYER`，让系统能做确定性归因，并为可选 LLM 诊断复核预留输入 / 输出结构。
3. 再做 `MVP03_LLM_COACHING_LOOP`，让 LLM 基于诊断结果表达建议，并输出机器可读的最小练习目标和 Drill Spec 草案。
4. 再做 `MVP04_ADAPTIVE_DRILL_GENERATION`，把 Drill Spec 交给 UE 侧白名单模板，稳定生成针对性练习场。
5. 最后做 `MVP05_EVALUATION_AND_ITERATION`，让 demo 证明建议或练习目标真的有效，并根据结果迭代下一轮策略。

不要跳过 MVP01 直接做 LLM 提示词。没有可靠遥测和诊断，LLM 只能泛泛讲攻略，无法形成强针对性的导玩体验。

## 当前建议编译合同入口

下一份建议编译的执行合同入口是：

- `MVP02_DIAGNOSTIC_SIGNAL_LAYER.md`

`MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1` 已通过真实 PIE gameplay 验收，证据见 `aiflow/contracts/runs/MVP01_COMBAT_TELEMETRY_FOUNDATION.run-001.yaml`。

## 阶段间依赖

- MVP02 依赖 MVP01 输出的事件流和尝试摘要。
- MVP03 依赖 MVP02 输出的诊断摘要和 `practice_objective_seed`。
- MVP04 依赖 MVP03 输出的 Drill Spec 草案，依赖 UE 侧可复用的训练场模板与安全参数白名单。
- MVP05 依赖 MVP01 到 MVP04 共同输出的尝试记录、诊断结果、指导内容、练习目标和 drill session。

## 阶段状态同步要求

当任一 MVP phase 状态变化时，至少同步：

- `aiflow/CONTEXT.md`
- `aiflow/specs/GAME_PHASES.md`
- 对应的 `aiflow/specs/MVP*.md`

仅有 prose 文档不代表 phase 已进入正式实现。正式实现仍以 contracts 层的 Brief / Task Pack / Asset Manifest / Verifier 为准。
