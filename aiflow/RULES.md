# GuideBuddy aiflow 规则

本文件只保留每次任务都适用的全局约束。专项细节按需阅读 `aiflow/rules/`。

## 全局约束

- 每次任务先读 `aiflow/CONTEXT.md` 与本文件。
- `aiflow/specs/` 是 prose 需求层，只写目标、范围、验收、依赖和阶段状态。
- `aiflow/contracts/` 是执行合同层，正式实现以 confirmed / frozen 的 Brief、Task Pack、Manifest、Verifier 为准。
- 当前不要求任务预约流程。
- 如果没有 confirmed / frozen 合同，默认只做澄清、计划、草案调整和只读调查。
- 如果用户明确要求实现，且现有 draft 合同已经足够清楚，应先把对应合同升级为 confirmed / frozen，再实施。
- 新增可分析逻辑、遥测、诊断、数据导出与导玩闭环优先写 Puerts + TypeScript。
- C++ 只作为必要桥接层使用，例如 Puerts 启动、delegate 暴露、性能敏感或 TypeScript 无法触达的引擎边界。
- Blueprint 主要保留既有资产承载、资产绑定、数值配置和视觉呈现；除非用户明确要求，不新增关键游戏逻辑到二进制 Blueprint 图中。
- 不得自行扩大 scope；发现目标、范围或验收变化时，先同步 specs / contracts。
- 任何 `automation_level: auto` 的验收项都必须真实执行并留证，不能用口头说明代替。
- 任一 hard gate 未通过，不得宣称完成。

## 按任务读取补充文档

- 文档导航：`aiflow/INDEX.md`
- AI 执行入口：`aiflow/AGENT.md`
- 战斗运行时背景：`aiflow/context/combat-runtime.md`
- prose 到合同：`aiflow/rules/prose-to-contract.md`
- specs 写作与同步：`aiflow/rules/spec-writing.md`、`aiflow/rules/spec-sync.md`
- 验收、run、evidence、ledger：`aiflow/rules/autonomous-verification.md`
- 需求变更：`aiflow/rules/change-management.md`
- TypeScript / Puerts 代码：`aiflow/rules/puerts-typescript.md`、`aiflow/rules/code.md`
- C++ 桥接与源码位置：`aiflow/rules/cpp-source-location.md`、`aiflow/rules/code.md`
- UE 编辑器、资产、Blueprint、MCP：`aiflow/rules/mcp-capabilities.md`、`aiflow/rules/mcp-preflight.md`
- Shell：`aiflow/rules/shell.md`
- 提交：`aiflow/rules/commit.md`、`aiflow/rules/commit-prompts.md`

## 维护约定

- 新增长期背景放入 `aiflow/context/`。
- 新增需求先写 specs，再编译 contracts。
- 执行过程、失败记录和证据放入 contracts 的 run / evidence / ledger，不写回 specs。
- 本文件与专项规则冲突时，以本文件为准。
