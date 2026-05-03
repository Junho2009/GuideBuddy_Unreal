# GuideBuddy_Unreal 项目上下文

## 项目定位

- 当前项目：`GuideBuddy_Unreal` / `TCF_Sample.uproject`
- 引擎版本：Unreal Engine 5.7
- 核心依赖：`TempestCombatFramework`
- MVP 场景：`/Game/TCF_SampleDemo/SampleDemoShowcaseMap.SampleDemoShowcaseMap`
- 黑客松目标：做一个“魂 like AI 导玩”MVP，让不同水平的玩家都能更快看懂、学会并改善战斗。

本项目当前不是要从零重做一套战斗系统，而是在现有 TempestCombatFramework 示例战斗之上，建立一条可分析、可解释、可迭代的 AI 导玩闭环：

```text
玩家战斗过程
  -> 游戏侧语义事件采集
  -> 诊断信号计算
  -> LLM 生成恰当指导
  -> 玩家下一次尝试
  -> 评估指导是否有效
```

核心原则：

- 游戏侧负责记录事实。
- 诊断层负责做确定性的归因与指标计算。
- LLM 负责把诊断结果转成适合玩家水平的指导表达。
- MVP 不以“完整蓝图转代码”为第一步；先在 C++/文本可审查层做遥测、诊断与导玩闭环。
- 现有 Blueprint 可以继续承载已存在的战斗资产与配置；新增可分析逻辑、打点、诊断与数据导出优先落在 C++ 或结构化文本资产中。

## aiflow 迁移状态

`aiflow/` 是从另一个 Unreal 项目迁移来的工作流框架。该旧项目的具体游戏内容是 RTT / 连续 ATB 自动战斗构筑原型，并包含 Alba UI、Login、Puerts、TypeScript 等专项历史基线。

这些旧项目内容目前只作为工作流范例与历史参考，不是本项目的产品目标或技术路线真源。后续若要正式复用其中的 specs / contracts / skills，需要先改写为 GuideBuddy 黑客松 MVP 的语义。

特别说明：

- 旧的 `FEATURE_ALBA_UI_FRAMEWORK_FOUNDATION`、`FEATURE_LOGIN_UI_FRAMEWORK_UPGRADE` 不属于当前 MVP。
- 旧的 `PHASE01_BATTLE_KERNEL` 等 RTT/ATB phase 不属于当前 MVP。
- 旧的“游戏逻辑必须写 TypeScript/Puerts”不适用于本项目当前实施路线。
- 本项目当前的实现重心是 TempestCombatFramework 周边的 C++ 遥测、诊断、数据导出与 LLM 导玩闭环。

## 当前开发进度

**当前已完成到：`MVP00_CONTEXT_ALIGNMENT`（迁移上下文收口）**

| Phase | 状态 | 目标 |
|-------|------|------|
| `MVP00_CONTEXT_ALIGNMENT` | 已完成 | 把迁移来的 `aiflow` 项目上下文切换到 GuideBuddy 黑客松 MVP |
| `MVP01_COMBAT_TELEMETRY_FOUNDATION` | 未开始 | 在 `SampleDemoShowcaseMap` 中采集语义化战斗事件 |
| `MVP02_DIAGNOSTIC_SIGNAL_LAYER` | 未开始 | 把事件流转成死亡原因、响应质量与可指导的诊断信号 |
| `MVP03_LLM_COACHING_LOOP` | 未开始 | 让 LLM 基于诊断结果生成恰如其分的导玩建议 |
| `MVP04_EVALUATION_AND_ITERATION` | 未开始 | 记录指导是否改善玩家表现，并据此迭代指导策略 |

> 更新规则：当 MVP 阶段状态发生变化时，至少同步 `aiflow/CONTEXT.md`、`aiflow/specs/GAME_PHASES.md` 与对应 MVP phase 文档。当前 `aiflow/specs/` 已重建为 GuideBuddy MVP 的 prose 需求层；正式实施前仍需要从对应 phase prose 编译 Brief / Task Pack / Asset Manifest / Verifier。

## 项目默认执行基线状态

> 这里的 `Current*` 是项目默认主线指针，不是多人协作时所有 issue 的唯一执行合同。AI 已进入某条 issue 后，应优先使用该 issue 记录中的 `baseline_ref`、`brief_ref`、`taskpack_ref`、`manifest_ref` 与 `verifier_ref`；只有 issue 明确复用项目默认基线，或尚未进入 issue 做分析/合同准备时，才直接使用下面这些默认指针。

- 状态：当前已建立 `MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1-draft` 草案合同组，但尚未由人类确认或冻结。
- Latest Accepted Baseline：无。迁移来的旧项目 accepted baseline 不适用于本项目。
- Current Execution Baseline：未冻结。候选草案为 `MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1-draft`。
- Current Brief：草案 `aiflow/contracts/briefs/MVP01_COMBAT_TELEMETRY_FOUNDATION.brief.yaml`，未 confirmed / frozen。
- Current Task Pack：草案 `aiflow/contracts/taskpacks/MVP01_COMBAT_TELEMETRY_FOUNDATION.taskpack.yaml`，未 active。
- Current Asset Manifest：草案 `aiflow/contracts/manifests/MVP01_COMBAT_TELEMETRY_FOUNDATION.manifest.yaml`，未 active。
- Current Verifier：草案 `aiflow/contracts/verifiers/MVP01_COMBAT_TELEMETRY_FOUNDATION.verifier.yaml`，未 active。
- Latest Ledger：无。
- 多人协作机制：实现性修改前应通过 coordination provider 创建或进入对应 issue，并将新 issue 发布到 provider 配置的远端账本后才视为团队可见预约；issue 记录是 AI/脚本读写的机器账本，人类不需要日常阅读 YAML。开始、进入、检查、验证或关闭 issue 时使用 `aiflow-issue`；交接或接管 owner 时使用 `aiflow-issue-transfer`；合入主干时使用 `aiflow-issue-merge`。

## 引擎、技术栈与架构

- Unreal 项目：`TCF_Sample.uproject`
- 引擎：Unreal Engine 5.7
- 战斗框架：`Plugins/TempestCombatFramework`
- 默认地图：`/Game/TCF_SampleDemo/SampleDemoShowcaseMap.SampleDemoShowcaseMap`
- AI 执行面：AI IDE / AI 智能体（代码、资产调查、工作流执行）
- 新增实现优先级：C++ 遥测与诊断层优先；Blueprint 仅在必要时做资产引用、配置或可视化承载。

现阶段不要把“蓝图转代码”理解为一次性目标。更稳的 MVP 路线是：

1. 先在现有战斗系统周围补可审查的观测层。
2. 用语义事件和诊断指标支撑 LLM 导玩。
3. 根据数据需求和维护成本，再决定哪些 Blueprint 逻辑值得定向迁移到 C++。

## 当前战斗资产入口

`SampleDemoShowcaseMap` 相关的已知战斗入口包括：

- 地图直接引用：
  - `/Game/Integration/BP_GS_Enemy_Katana`
  - `/Game/Integration/BP_TCF_GS_GameMode`
  - `/TempestCombatFramework/Spawner/BP_Tempest_AI_Spawner`
  - `/TempestCombatFramework/Spawner/BP_TempestSpawnPoint`
  - `/TempestCombatFramework/Spawner/BP_StandardSpawnerProcessor`
  - `/TempestCombatFramework/Spawner/BP_StandardSpawnerCondition`
  - `/TempestCombatFramework/Spawner/BP_StandardSpawnerDestructionCondition`
- GameMode 关联：
  - `/Game/Integration/BP_GhostSamuraiCharacter`
  - `/Game/Integration/BP_TCF_GS_PlayerController`
- 武器与数据资产：
  - `/Game/Integration/BP_Player_GS_Weapon`
  - `/Game/Integration/Player_GS_PDA`
  - `/Game/Integration/BP_GS_AI_Katana_Weapon`
  - `/Game/Integration/DA_GS_Katana_Enemy`
- 主要 Blueprint 逻辑分布：
  - `Content/Integration/Abilities/BP_GS_*`
  - `Content/Integration/States/BP_GS_*`
  - `Content/Integration/Properties/*`
  - `Plugins/TempestCombatFramework/Content/Abilities`
  - `Plugins/TempestCombatFramework/Content/States`
  - `Plugins/TempestCombatFramework/Content/BehaviorProperties`
  - `Plugins/TempestCombatFramework/Content/AttackProperties`
  - `Plugins/TempestCombatFramework/Content/DefenseProperties`
  - `Plugins/TempestCombatFramework/Content/Trace`

临时调查报告：`Saved/CodexCombatBlueprintInventory.md`。该文件是工作区内生成的调查材料，不是正式合同或验收产物。

## 推荐的 C++ 观测挂点

优先从 TempestCombatFramework 的稳定边界采集事件，避免一开始深入每个 Blueprint 图：

- Ability 激活：`UTempestBaseAbilityManagerComponent::OnAbilityActivation`
- State 激活：`UTempestBaseStateManagerComponent::OnStateActivation`
- 输入与缓冲：`UTempestBaseInputComponent` 的输入触发、缓冲与 watch list 相关 delegate
- 攻击与受击：`UTempestCombatComponent` 的 attack / received attack / combat status 相关 delegate
- 属性变化：`UTempestBaseAttributeObject::OnValueUpdated`
- Trace 命中：`UTempestBaseTraceObject::OnTraceHitDelegate`

这些挂点用于 MVP 的遥测与诊断，不要求立即改变原有战斗逻辑。

## MVP 数据闭环

### 1. 采集到的数据

MVP 需要的不是原始每帧数据，而是能还原“玩家为什么死 / 为什么持续被同一招打中”的语义事件。

优先采集：

- `attempt_start` / `attempt_end` / `player_death`
- Boss 或敌人的 ability / attack / state 激活
- 攻击前摇、命中窗口、恢复窗口的可近似时间点
- 玩家输入：闪避、攻击、治疗、防御或锁定等关键动作
- 玩家响应：相对敌人攻击前摇的反应延迟、方向、时机
- 伤害事件：攻击来源、命中目标、伤害量、血量变化、致命一击
- 资源快照：死亡时或关键失败点的血量、耐力 / 体力类资源、可行动状态
- 阶段变化：Boss 进入新阶段或战斗状态明显切换

建议输出到 `Saved/GuideBuddy/Telemetry/<run-id>/`，至少包含：

- `combat_events.jsonl`
- `attempt_summary.json`
- `diagnosis.json`

### 2. 诊断信号

诊断层应把事件流转成 LLM 和 UI 都能直接消费的信号。

MVP 优先支持这些诊断：

- 闪避过早：玩家在攻击真正命中窗口前过早交出闪避。
- 闪避过晚：玩家在命中窗口开始后才闪避或没有完成位移。
- 贪刀 / 过度承诺：玩家在敌人高威胁前摇期间继续攻击、治疗或处于硬直。
- 资源耗尽：玩家在需要闪避或防御时耐力 / 体力类资源不足。
- 错误治疗时机：玩家在敌人可惩罚窗口内治疗并被打断或击杀。
- 重复死亡原因：连续多次死于同一招式、同一窗口或同一种响应错误。

### 3. LLM 分析

LLM 的输入应尽量是诊断后的高信号摘要，而不是原始日志海。

推荐输入结构：

- 玩家水平估计：新手 / 进阶 / 熟练
- 本次尝试摘要：存活时间、死亡原因、主要受击来源
- 关键证据片段：少量带时间戳的语义事件
- 诊断指标：成功率、平均反应延迟、最常被命中的攻击、资源问题
- 教学目标：本次只解决一个最关键问题

推荐输出结构：

- `diagnosis`：一句话说明主要问题
- `evidence`：引用具体事件或指标
- `one_tip`：下一局只需要记住的一条建议
- `practice_goal`：下一次尝试的可执行目标
- `confidence`：诊断信心
- `avoid_overhelping`：是否应减少提示强度

### 4. 给玩家的指导形式

MVP 默认采用低打扰指导：

- 死亡后卡片：指出致命原因和下一局的一条建议。
- 回合间复盘：如果玩家连续失败，给一个更具体的练习目标。
- 赛后趋势：展示“同一招的受击率是否下降”“反应是否更接近正确窗口”。

暂不优先做：

- 实时语音教练
- 战斗中频繁弹窗
- 大量理论讲解
- 全量招式百科

指导强度应按玩家水平调节：

- 新手：少术语，一次只讲一个动作，例如“看到刀举过肩再闪，不要一看到抬手就闪”。
- 进阶：给窗口与倾向，例如“你平均早了 0.28 秒，下一次等第二段蓄力音效后再翻滚”。
- 熟练：给风险收益与优化，例如“这招后摇只够轻攻击一次，第二刀会把你留在恢复硬直里”。

### 5. 评估与迭代

每条指导都应能被后续尝试验证是否有效。

优先指标：

- 同一攻击类型的受击率是否下降
- 面对同一前摇的平均反应延迟是否更接近目标窗口
- 玩家是否连续多次死于同一原因
- 存活时间是否提升
- 错误治疗次数是否下降
- 因资源耗尽导致的失败是否下降
- 玩家是否采纳了建议中的动作，例如减少多余攻击、延后闪避、改变治疗时机

MVP 的成功标准不是“AI 讲得很像教练”，而是玩家下一次或接下来几次尝试中，目标错误确实减少。

## 下一步实施建议

建议下一份正式合同从 `MVP01_COMBAT_TELEMETRY_FOUNDATION` 开始，目标是：

1. 建立最小 C++ 遥测组件 / 子系统。
2. 在 `SampleDemoShowcaseMap` 的战斗运行中输出语义事件。
3. 记录一次玩家死亡的可解释事件链。
4. 生成 `attempt_summary.json`，让后续诊断层和 LLM 能直接读取。
5. 保持对现有 Blueprint 战斗逻辑的最小侵入。

暂不把完整 Blueprint-to-code 作为 MVP01 的验收目标。Blueprint 迁移应作为后续定向重构任务，由遥测数据和维护需求决定优先级。
