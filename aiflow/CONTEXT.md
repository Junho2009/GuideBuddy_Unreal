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
  -> LLM 导玩建议与最小练习目标
  -> 下一次尝试或针对性练习场
  -> 指导 / 练习效果评估
```

## 当前原则

- 游戏侧记录事实。
- 诊断层做确定性归因。
- LLM 负责教学表达，不直接替代诊断层。
- LLM 可以生成结构化练习目标和 Drill Spec，但不直接自由创建 Unreal 场景；UE 侧只执行白名单模板和受控参数。
- MVP 先做遥测、诊断、导玩和评估闭环，不先做完整 Blueprint-to-code。
- 新增可分析逻辑、遥测、诊断、数据导出和导玩编排优先使用 Puerts + TypeScript，以便 AI 后续阅读、修改、diff 和快速迭代。
- C++ 主要作为必要桥接层：用于启动 Puerts 环境、暴露 TypeScript 无法直接访问的引擎 / TempestCombatFramework delegate、处理性能敏感或必须 native 的边界。
- 现有 Blueprint 可以继续承载既有战斗资产与配置；新增关键逻辑不放进二进制 Blueprint 图。

## 当前阶段

| Phase | 状态 | 目标 |
|---|---|---|
| `MVP00_CONTEXT_ALIGNMENT` | 已完成 | 建立 GuideBuddy MVP 的轻量 aiflow 真源 |
| `MVP01_COMBAT_TELEMETRY_FOUNDATION` | 已验收 | 在场景中采集语义化战斗事件 |
| `MVP02_DIAGNOSTIC_SIGNAL_LAYER` | 已验收 | 把事件流转成死亡原因与操作诊断，并预留可选 LLM 复核 |
| `MVP03_LLM_COACHING_LOOP` | 未开始 | 基于诊断生成导玩建议、最小练习目标和 Drill Spec 草案 |
| `MVP04_ADAPTIVE_DRILL_GENERATION` | 未开始 | 基于 Drill Spec 生成受控的针对性练习场 |
| `MVP05_EVALUATION_AND_ITERATION` | 未开始 | 判断指导或练习是否改善玩家表现 |

## 默认执行基线

- Latest Accepted Baseline：`MVP02_DIAGNOSTIC_SIGNAL_LAYER@v0.1`
- Current Execution Baseline：待编译 `MVP03_LLM_COACHING_LOOP`
- 候选草案：无。
- Current Brief：`aiflow/contracts/briefs/MVP02_DIAGNOSTIC_SIGNAL_LAYER.brief.yaml`，状态为 `active`。
- Current Task Pack：`aiflow/contracts/taskpacks/MVP02_DIAGNOSTIC_SIGNAL_LAYER.taskpack.yaml`，状态为 `active`。
- Current Asset Manifest：`aiflow/contracts/manifests/MVP02_DIAGNOSTIC_SIGNAL_LAYER.manifest.yaml`，状态为 `active`。
- Current Verifier：`aiflow/contracts/verifiers/MVP02_DIAGNOSTIC_SIGNAL_LAYER.verifier.yaml`，状态为 `active`。
- Latest Ledger：`aiflow/contracts/ledgers/MVP02_DIAGNOSTIC_SIGNAL_LAYER.result.md`

MVP01 已通过真实 PIE gameplay 验收；MVP02 已基于 MVP01 归档 gameplay fixture 通过自动诊断验收。当前实现默认不修改战斗数值、不改二进制 Blueprint 战斗逻辑，不实现 UI / LLM API。

## 当前战斗入口

已知入口和调查结果记录在：

- `aiflow/context/combat-runtime.md`
- `aiflow/context/mvp01-implementation-handoff.md`
- `aiflow/specs/MVP01_COMBAT_TELEMETRY_FOUNDATION.md`
- `aiflow/contracts/manifests/MVP01_COMBAT_TELEMETRY_FOUNDATION.manifest.yaml`
- `aiflow/contracts/manifests/MVP02_DIAGNOSTIC_SIGNAL_LAYER.manifest.yaml`

## 当前交接状态

- 2026-05-03：MVP01 已完成一版本地实现，但用户尚未验收，不能视为 accepted baseline。
- 2026-05-04：补齐 Puerts `nodejs_16` 后，UE `UnrealEditor` 目标编译通过。
- 2026-05-04：真实 PIE gameplay run `20260504022450_UEDPIE_0_SampleDemoShowcaseMap_861420` 通过 `npm.cmd run verify:mvp01`。
- 验收证据见 `aiflow/contracts/runs/MVP01_COMBAT_TELEMETRY_FOUNDATION.run-001.yaml`。
- 2026-05-05：MVP02 诊断信号层通过 `npm.cmd run verify:mvp02`，基于 MVP01 归档 gameplay fixture 生成 `diagnosis.json`，accepted run 为 `aiflow/contracts/runs/MVP02_DIAGNOSTIC_SIGNAL_LAYER.run-001.yaml`。

## 同步要求

当 MVP 阶段状态、范围或验收发生变化时，至少同步：

- `aiflow/CONTEXT.md`
- `aiflow/specs/GAME_PHASES.md`
- 对应 MVP phase prose
- 对应 contracts 草案或正式合同
