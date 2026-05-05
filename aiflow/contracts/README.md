# GuideBuddy contracts

`aiflow/contracts/` 是 GuideBuddy MVP 的执行合同层。

它位于 `aiflow/specs/` 与正式实现之间，负责把 prose 需求转成可确认、可执行、可验收、可追溯的合同产物。

## 当前状态

- 当前保留 GuideBuddy MVP 相关的合同结构、共享约定、模板、MVP01 合同和 MVP02 合同。
- `MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1` 已通过真实 PIE gameplay 验收，结果见 `ledgers/MVP01_COMBAT_TELEMETRY_FOUNDATION.result.md`。
- `MVP02_DIAGNOSTIC_SIGNAL_LAYER@v0.1` 已通过自动诊断验收，结果见 `ledgers/MVP02_DIAGNOSTIC_SIGNAL_LAYER.result.md`。

## 常用目录

| 目录 | 作用 |
|---|---|
| `clarifications/` | 澄清确认包 |
| `briefs/` | 需求简报，冻结范围与验收口径 |
| `taskpacks/` | 执行任务包，规定实施切片与边界 |
| `manifests/` | 文件、资产、输出与证据范围 |
| `verifiers/` | 验收门禁单 |
| `runs/` | Verifier 实际运行记录 |
| `evidence/` | 原始证据索引 |
| `ledgers/` | Accepted 结果台账 |
| `changes/` | 需求变更单 |
| `decisions/` | 小范围阻塞决策 |
| `_shared/` | 术语、状态、命名和验收字段约定 |

## 使用原则

1. 先读 `aiflow/specs/`，再编译 contracts。
2. Brief 未 `confirmed` / `frozen` 前，不进入正式实现。
3. Task Pack、Manifest、Verifier 必须引用同一个 baseline。
4. `automation_level: auto` 的检查必须真实执行并留证。
5. Run 记录过程，Ledger 记录 accepted 摘要，二者不能互相替代。
6. 需求变化后先写 Change Request，再重编译或迁移 baseline。

## 当前建议入口

已验收合同与证据：

- `clarifications/MVP01_COMBAT_TELEMETRY_FOUNDATION.clarification.md`
- `briefs/MVP01_COMBAT_TELEMETRY_FOUNDATION.brief.yaml`
- `taskpacks/MVP01_COMBAT_TELEMETRY_FOUNDATION.taskpack.yaml`
- `manifests/MVP01_COMBAT_TELEMETRY_FOUNDATION.manifest.yaml`
- `verifiers/MVP01_COMBAT_TELEMETRY_FOUNDATION.verifier.yaml`
- `runs/MVP01_COMBAT_TELEMETRY_FOUNDATION.run-001.yaml`
- `evidence/MVP01_COMBAT_TELEMETRY_FOUNDATION/v0.1/run-001/index.md`
- `ledgers/MVP01_COMBAT_TELEMETRY_FOUNDATION.result.md`
- `clarifications/MVP02_DIAGNOSTIC_SIGNAL_LAYER.clarification.md`
- `briefs/MVP02_DIAGNOSTIC_SIGNAL_LAYER.brief.yaml`
- `taskpacks/MVP02_DIAGNOSTIC_SIGNAL_LAYER.taskpack.yaml`
- `manifests/MVP02_DIAGNOSTIC_SIGNAL_LAYER.manifest.yaml`
- `verifiers/MVP02_DIAGNOSTIC_SIGNAL_LAYER.verifier.yaml`
- `runs/MVP02_DIAGNOSTIC_SIGNAL_LAYER.run-001.yaml`
- `evidence/MVP02_DIAGNOSTIC_SIGNAL_LAYER/v0.1/run-001/index.md`
- `ledgers/MVP02_DIAGNOSTIC_SIGNAL_LAYER.result.md`

下一步建议为 `MVP03_LLM_COACHING_LOOP` 编译执行合同。
