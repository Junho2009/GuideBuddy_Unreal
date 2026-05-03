# Shell 规则

## 基本原则

- 优先使用 PowerShell 原生命令。
- 搜索文件优先用 `rg`。
- 读取文件时指定 UTF-8。
- 不把实现步骤写成 specs。
- 运行会修改 repo 文件的命令前，确认它属于当前任务范围。

## 删除规则

执行递归删除前必须：

1. Resolve 目标绝对路径。
2. 确认目标位于预期 workspace 或明确目录内。
3. 只删除用户明确要求清理的内容。

## Git 提交

提交规则以：

- `aiflow/rules/commit.md`
- `aiflow/rules/commit-prompts.md`

为准。
