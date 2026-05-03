# GuideBuddy_Unreal 项目上下文

## 项目定位

- 项目：`GuideBuddy_Unreal` / `TCF_Sample.uproject`
- 引擎：Unreal Engine 5.7
- 战斗框架：`TempestCombatFramework`
- 脚本方案：已引入 `Puerts`，后续 GuideBuddy MVP 新增逻辑优先使用 TypeScript 实现。
- MVP 场景：`/Game/TCF_SampleDemo/SampleDemoShowcaseMap.SampleDemoShowcaseMap`
- 目标：做一个魂 like AI 导玩 MVP，基于玩家真实战斗表现给出强针对性指导。

GuideBuddy 的核心闭环是：

```text
玩家战斗尝试
  -> 语义化战斗事件
  -> 诊断信号
  -> LLM 导玩建议
  -> 下一次尝试
  -> 指导效果评估
```

## 当前原则

- 游戏侧记录事实。
- 诊断层做确定性归因。
- LLM 负责教学表达，不直接替代诊断层。
- MVP 先做遥测、诊断、导玩和评估闭环，不先做完整 Blueprint-to-code。
- 新增可分析逻辑、遥测、诊断、数据导出和导玩编排优先使用 Puerts + TypeScript，以便 AI 后续阅读、修改、diff 和快速迭代。
- C++ 主要作为必要桥接层：用于启动 Puerts 环境、暴露 TypeScript 无法直接访问的引擎 / TempestCombatFramework delegate、处理性能敏感或必须 native 的边界。
- 现有 Blueprint 可以继续承载既有战斗资产与配置；新增关键逻辑不放进二进制 Blueprint 图。

## 当前阶段

| Phase | 状态 | 目标 |
|---|---|---|
| `MVP00_CONTEXT_ALIGNMENT` | 已完成 | 建立 GuideBuddy MVP 的轻量 aiflow 真源 |
| `MVP01_COMBAT_TELEMETRY_FOUNDATION` | 草案合同已建立，未冻结 | 在场景中采集语义化战斗事件 |
| `MVP02_DIAGNOSTIC_SIGNAL_LAYER` | 未开始 | 把事件流转成死亡原因与操作诊断 |
| `MVP03_LLM_COACHING_LOOP` | 未开始 | 基于诊断生成恰当导玩建议 |
| `MVP04_EVALUATION_AND_ITERATION` | 未开始 | 判断指导是否改善玩家表现 |

## 默认执行基线

- Latest Accepted Baseline：无。
- Current Execution Baseline：未冻结。
- 候选草案：`MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1-draft`
- Current Brief：`aiflow/contracts/briefs/MVP01_COMBAT_TELEMETRY_FOUNDATION.brief.yaml`，状态为 `draft`。
- Current Task Pack：`aiflow/contracts/taskpacks/MVP01_COMBAT_TELEMETRY_FOUNDATION.taskpack.yaml`，状态为 `draft`。
- Current Asset Manifest：`aiflow/contracts/manifests/MVP01_COMBAT_TELEMETRY_FOUNDATION.manifest.yaml`，状态为 `draft`。
- Current Verifier：`aiflow/contracts/verifiers/MVP01_COMBAT_TELEMETRY_FOUNDATION.verifier.yaml`，状态为 `draft`。
- Latest Ledger：无。

在 MVP01 Brief 被确认和冻结前，正式实现默认只允许做澄清、计划、草案调整和只读调查。若用户明确授权进入实现，可先将 MVP01 合同组升级为 confirmed / frozen，再开始代码或资产修改。

## 当前战斗入口

已知入口和调查结果记录在：

- `aiflow/context/combat-runtime.md`
- `aiflow/specs/MVP01_COMBAT_TELEMETRY_FOUNDATION.md`
- `aiflow/contracts/manifests/MVP01_COMBAT_TELEMETRY_FOUNDATION.manifest.yaml`

## 同步要求

当 MVP 阶段状态、范围或验收发生变化时，至少同步：

- `aiflow/CONTEXT.md`
- `aiflow/specs/GAME_PHASES.md`
- 对应 MVP phase prose
- 对应 contracts 草案或正式合同
