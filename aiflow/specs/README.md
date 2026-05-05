# GuideBuddy MVP specs

本目录是 GuideBuddy_Unreal 黑客松 MVP 的 prose 需求层。

它记录人类可读的目标、范围、验收方式、阶段状态和依赖关系，不记录具体实现流水账、工具调用步骤或排障过程。

## 当前真源文档

- `PROJECT_OVERVIEW.md`：项目总览与 MVP 口径
- `GAME_PHASES.md`：阶段路线图与当前状态
- `TELEMETRY_AND_COACHING_REQUIREMENTS.md`：贯穿各阶段的数据、诊断、导玩、练习目标与评估要求
- `MVP01_COMBAT_TELEMETRY_FOUNDATION.md`：语义化战斗遥测基础
- `MVP02_DIAGNOSTIC_SIGNAL_LAYER.md`：诊断信号层
- `MVP03_LLM_COACHING_LOOP.md`：LLM 导玩闭环
- `MVP04_ADAPTIVE_DRILL_GENERATION.md`：自适应针对性练习场生成
- `MVP05_EVALUATION_AND_ITERATION.md`：指导与练习效果评估迭代
- `_TEMPLATE_PHASE_PROSE.md`：后续 phase prose 模板

## 写作边界

- specs 写“要做什么”和“怎样算完成”。
- contracts 写“本轮执行具体改哪些文件、如何验证、证据放哪里”。
- run / evidence / ledger 写“实际怎么验收、证据在哪里、结果是否 accepted”。

在正式实现前，应从对应 MVP phase prose 编译 Requirement Brief、Task Pack、Asset Manifest 与 Verifier。
