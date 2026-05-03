# 开发规范与铁律

> 本文件只保留每次任务都适用的全局硬约束。
> 任务专项流程按需查阅 `aiflow/context/` 与 `aiflow/rules/`，不在此处展开。

## 每次任务都必须遵守

- 先读 `aiflow/CONTEXT.md` 与本文件；涉及具体子系统、目录或任务类型时，再按需读取补充上下文与专项规则。
- 本项目新增可分析逻辑、遥测、诊断、数据导出与导玩闭环优先写 C++ 或结构化文本；Blueprint 主要保留既有资产承载、资产绑定、数值配置和视觉呈现，除非用户明确要求，不新增关键游戏逻辑到二进制 Blueprint 图中。
- `aiflow/specs/` 只放 prose 需求、规则、范围、验收、依赖与阶段状态；`aiflow/contracts/` 才是正式执行合同。
- 正式实现的合同来源按优先级判定：已进入 issue 时，以 issue 记录中的 `baseline_ref` / `brief_ref` / `taskpack_ref` / `manifest_ref` / `verifier_ref` 为准；未进入 issue 时，才以项目默认 **Current Execution Baseline** 指向的 Brief / Task Pack / Asset Manifest / Verifier 为准。
- 当没有可用的 issue 合同，且项目默认 `Current Execution Baseline` 为空时，只允许做澄清、Requirement Brief 草拟与合同编译准备；不得直接开始正式实现。
- 收到新的 prose 需求时，先做澄清并冻结 Requirement Brief，再进入正式实现。
- 澄清不只是在仓库里生成 Clarification 文件；AI 还必须把“一句话目标、关键默认冻结项、待确认点”显式发给人类确认。在用户明确回复“确认 / 按推荐默认项推进 / 使用默认冻结”等等价授权前，不得将 Brief 标记为 `confirmed / frozen`，不得切换 `Current Execution Baseline`，不得开始正式实现。
- 不得自行扩大 scope；发现关键歧义、边界变化或验收变化时，先走决策或需求变更流程。
- 任何 `automation_level: auto` 的验收项，都必须由 AI 实际执行并留证；不得用“请你手测”替代。
- 任一 hard gate（如 `BASELINE_SYNC`、`SPEC_SYNC`、`SCOPE_GUARD`、release-blocking checks）不通过，不得宣称完成。
- `aiflow/specs/` 只回写目标、规则、范围、验收、依赖与阶段状态，不写实现流水账。
- 对会修改实现代码或 UE 资产的协作开发任务，开始实现前必须创建或进入 issue；无明确 issue 时，AI 应先使用 `aiflow-issue` 执行 issue 发现，再根据结果进入已有 issue、阻止 hard 冲突或创建新 issue。issue 必须绑定明确合同来源，或显式复用项目默认 Current 合同；新建 issue 必须发布到 coordination provider 配置的远端账本才视为团队可见预约。在 issue 创建、远端预约或进入成功前，只允许分析、计划、dry-run 与文档评估，不得直接改实现。
- MCP 已覆盖的操作不得改写成人工步骤。

## 按任务读取补充文档

- 需要文档导航或快速定位入口：读 `aiflow/INDEX.md`
- 涉及 `AGENTS.md`、`CLAUDE.md`、`.cursor/rules/` 等 IDE 适配文件：读 `aiflow/IDE_COMPAT.md`
- 涉及具体游戏子系统定位或入口资产：读 `aiflow/context/systems/` 下对应文档
- 处理新的 prose 需求、phase 文档、合同编译：读 `aiflow/rules/prose-to-contract.md`
- 处理需求修改、换基线、重编译合同：读 `aiflow/rules/change-management.md`
- 处理 verifier、run、evidence、ledger、自主验收：读 `aiflow/rules/autonomous-verification.md`
- 涉及 UE 编辑器、Blueprint、Input、资产、动画或场景：读 `aiflow/rules/mcp-capabilities.md`
- 首次调用 MCP：读 `aiflow/rules/mcp-preflight.md`
- 执行 shell：读 `aiflow/rules/shell.md`
- 写或更新 `aiflow/specs/`：读 `aiflow/rules/spec-writing.md` 与 `aiflow/rules/spec-sync.md`
- 需要提交：读 `aiflow/rules/commit-prompts.md`
- 涉及旧项目 Puerts 资料迁移或 Puerts 蓝图属性持久化：读 `aiflow/rules/puerts-blueprint-properties.md`
- 涉及多人 issue、ownership、接管、交接或合入：读 `aiflow/coordination/README.md`，再按任务选择 `aiflow-issue`、`aiflow-issue-transfer` 或 `aiflow-issue-merge`。

## 维护约定

- 新增补充背景文档时，放入 `aiflow/context/` 的合适子目录，不把子系统细节回塞到 `aiflow/CONTEXT.md`。
- AI IDE 适配层只做入口适配与真源挂载，不在 IDE 专用文件里重复维护工作流细则；约定见 `aiflow/IDE_COMPAT.md`。
- 新增专项规则时，只在本文件补一条入口；细节写到对应专项文档，不回塞到本文件。
- 若专项规则与本文件冲突，以本文件的全局硬约束为先。
