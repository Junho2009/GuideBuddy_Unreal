# GuideBuddy MVP 阶段路线

## 当前路线

| Phase | 名称 | 目标 | 当前状态 |
|---|---|---|---|
| `MVP00_CONTEXT_ALIGNMENT` | 上下文收口 | 将迁移来的 aiflow 项目上下文切换为 GuideBuddy 黑客松 MVP | 已完成 |
| `MVP01_COMBAT_TELEMETRY_FOUNDATION` | 战斗遥测基础 | 在 `SampleDemoShowcaseMap` 中采集一次尝试所需的语义化战斗事件 | 未开始 |
| `MVP02_DIAGNOSTIC_SIGNAL_LAYER` | 诊断信号层 | 把事件流转成可解释、可指导、可供 LLM 消费的诊断信号 | 未开始 |
| `MVP03_LLM_COACHING_LOOP` | LLM 导玩闭环 | 基于诊断摘要生成适合玩家水平的低打扰指导 | 未开始 |
| `MVP04_EVALUATION_AND_ITERATION` | 效果评估与迭代 | 记录指导后的下一次表现，判断目标错误是否减少 | 未开始 |

## 推荐执行顺序

当前建议严格按顺序推进：

1. 先做 `MVP01_COMBAT_TELEMETRY_FOUNDATION`，让系统能记录事实。
2. 再做 `MVP02_DIAGNOSTIC_SIGNAL_LAYER`，让系统能做确定性归因。
3. 再做 `MVP03_LLM_COACHING_LOOP`，让 LLM 基于诊断结果表达建议。
4. 最后做 `MVP04_EVALUATION_AND_ITERATION`，让 demo 证明建议真的有效。

不要跳过 MVP01 直接做 LLM 提示词。没有可靠遥测和诊断，LLM 只能泛泛讲攻略，无法形成强针对性的导玩体验。

## 当前建议编译合同入口

下一份建议编译的执行合同入口是：

- `MVP01_COMBAT_TELEMETRY_FOUNDATION.md`

在该 phase 的 Brief / Task Pack / Asset Manifest / Verifier 未建立并确认前，项目默认主线仍处于“未冻结执行基线”状态。

## 阶段间依赖

- MVP02 依赖 MVP01 输出的事件流和尝试摘要。
- MVP03 依赖 MVP02 输出的诊断摘要。
- MVP04 依赖 MVP01 到 MVP03 共同输出的尝试记录、诊断结果和指导内容。

## 阶段状态同步要求

当任一 MVP phase 状态变化时，至少同步：

- `aiflow/CONTEXT.md`
- `aiflow/specs/GAME_PHASES.md`
- 对应的 `aiflow/specs/MVP*.md`

仅有 prose 文档不代表 phase 已进入正式实现。正式实现仍以 contracts 层的 Brief / Task Pack / Asset Manifest / Verifier 为准。
