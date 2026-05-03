# GuideBuddy AI 执行入口

## 固定启动顺序

每次处理 GuideBuddy 任务时：

1. 读 `aiflow/CONTEXT.md`。
2. 读 `aiflow/RULES.md`。
3. 按任务类型读取本文件列出的专项入口。
4. 先确认当前任务属于澄清、计划、文档、实现、验证还是提交。

## 常见任务路由

- 了解项目目标：读 `aiflow/specs/PROJECT_OVERVIEW.md` 与 `aiflow/specs/GAME_PHASES.md`。
- 了解 MVP01：读 `aiflow/specs/MVP01_COMBAT_TELEMETRY_FOUNDATION.md` 和对应 contracts。
- 处理新的需求想法：读 `aiflow/rules/prose-to-contract.md`。
- 修改 specs：读 `aiflow/rules/spec-writing.md` 与 `aiflow/rules/spec-sync.md`。
- 修改 contracts：读 `aiflow/contracts/README.md` 与 `_shared/` 约定。
- 准备实现：确认 Brief 已 confirmed / frozen；若仍是 draft，先让用户确认或先更新合同状态。
- 做验收：读 `aiflow/rules/autonomous-verification.md`。
- 做 GuideBuddy 运行时逻辑、遥测、诊断或导玩编排：优先读 `aiflow/rules/puerts-typescript.md` 与 `aiflow/rules/code.md`。
- 做 C++ 桥接或 native fallback：读 `aiflow/rules/code.md` 与 `aiflow/rules/cpp-source-location.md`。
- 涉及 UE 编辑器、Blueprint 或资产：读 `aiflow/rules/mcp-capabilities.md` 与 `aiflow/rules/mcp-preflight.md`。
- 执行 shell：读 `aiflow/rules/shell.md`。
- 提交：读 `aiflow/rules/commit.md` 与 `aiflow/rules/commit-prompts.md`。

## 实现前门禁

默认不能把 `draft` 合同当作正式实现授权。

允许进入实现的情况：

- Brief / Task Pack / Manifest / Verifier 已 confirmed / frozen。
- 或用户明确要求实现，并且本轮先同步合同状态为 confirmed / frozen。

## 完成定义

完成时至少说明：

- 改了什么。
- 验证了什么。
- 哪些检查没有跑及原因。
- 是否还有未跟踪或未提交内容。
