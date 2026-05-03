# GuideBuddy MVP specs

本目录是 GuideBuddy_Unreal 黑客松 MVP 的 prose 需求层。

它记录人类可读的目标、范围、验收方式、阶段状态和依赖关系，不记录具体实现流水账、工具调用步骤或排障过程。

## 当前真源文档

- `PROJECT_OVERVIEW.md`：项目总览与 MVP 口径
- `GAME_PHASES.md`：阶段路线图与当前状态
- `TELEMETRY_AND_COACHING_REQUIREMENTS.md`：贯穿四个阶段的数据、诊断、导玩与评估要求
- `MVP01_COMBAT_TELEMETRY_FOUNDATION.md`：语义化战斗遥测基础
- `MVP02_DIAGNOSTIC_SIGNAL_LAYER.md`：诊断信号层
- `MVP03_LLM_COACHING_LOOP.md`：LLM 导玩闭环
- `MVP04_EVALUATION_AND_ITERATION.md`：指导效果评估与迭代
- `_TEMPLATE_PHASE_PROSE.md`：后续 phase prose 模板

## 当前不再保留的旧项目内容

本目录已移除迁移来源项目中的 RTT / 连续 ATB 自动战斗、Alba UI、Login、Puerts、兵种锦囊与局内经济等 specs。

这些旧内容不属于 GuideBuddy MVP 的产品目标，也不作为本项目的阶段路线或验收依据。

## 写作边界

- specs 写“要做什么”和“怎样算完成”。
- contracts 写“本轮执行具体改哪些文件、如何验证、证据放哪里”。
- lessons / devlogs 写“做完后学到了什么、踩了什么坑”。

在正式实现前，应从对应 MVP phase prose 编译 Requirement Brief、Task Pack、Asset Manifest 与 Verifier。
