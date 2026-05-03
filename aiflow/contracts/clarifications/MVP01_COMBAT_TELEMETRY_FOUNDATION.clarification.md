# MVP01_COMBAT_TELEMETRY_FOUNDATION 澄清确认包

状态：`draft`

## 一句话目标

在 `SampleDemoShowcaseMap` 中建立最小 C++ 战斗遥测能力，让一次玩家尝试能输出可解析的语义事件流和尝试摘要。

## 推荐默认项

- 默认场景：`/Game/TCF_SampleDemo/SampleDemoShowcaseMap.SampleDemoShowcaseMap`
- 默认输出目录：`Saved/GuideBuddy/Telemetry/<run-id>/`
- 最低输出文件：
  - `combat_events.jsonl`
  - `attempt_summary.json`
- 默认先不生成 `diagnosis.json`，诊断留到 MVP02。
- 默认不改动战斗平衡。
- 默认不迁移完整 Blueprint 逻辑。
- 默认从 TempestCombatFramework 的稳定 delegate / component 边界采集事件。
- 默认事件命名保持机器可读，必要时再追加人类可读 display name。

## 已确认的需求理解

- 本阶段目标是“记录事实”，不是“给出建议”。
- 采集目标是语义事件，不是每帧原始数据。
- 本阶段应为后续 MVP02 / MVP03 提供稳定输入。
- 现有 Blueprint 战斗资产可以继续作为战斗行为来源。
- 新增遥测和数据导出应尽量落在 C++ 或结构化文本层。

## 待确认点

1. MVP01 是否允许在项目或插件中新增一个 GuideBuddy 命名的 C++ 模块 / 组件？
2. 第一版是否只要求人工打一局产生遥测，还是必须支持命令行或自动化触发一次尝试？
3. 玩家死亡是否作为 MVP01 必须验收条件，还是允许以受击但未死亡的尝试作为临时验收？
4. 输出的 actor / ability / state 名称是否需要第一版就做显示名映射？
5. 是否需要在 MVP01 同时做一个极简屏幕提示，还是完全只落文件？

## 推荐回答

建议按以下默认项推进：

- 允许新增 GuideBuddy C++ 遥测组件或子系统。
- MVP01 先允许人工进入场景打一局，但 Verifier 仍检查输出文件和格式。
- 优先以玩家死亡作为验收样例；如果调试时死亡不稳定，允许受击尝试作为降级样例，但必须记录原因。
- 第一版只保留对象名 / 资产路径，不做完整显示名映射。
- MVP01 不做 UI，只落文件。

## 人类确认要求

在将 Brief 标记为 `confirmed` / `frozen` 前，需要人类明确确认：

- 是否接受上述推荐默认项。
- 是否允许 MVP01 进入实现。
- 是否接受“死亡复盘闭环先从文件输出开始，不先做 UI”的范围边界。
