# 提交规范

## 提交信息格式：Conventional Commits

采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范书写提交信息：**类型(范围): 描述**。类型与范围使用英文小写，范围可选。

- 常用类型：`feat`（新功能）、`fix`（修复）、`docs`（文档）、`refactor`（重构）、`chore`（杂项）等；本项目另用 `devlog` 表示开发日志类提交，并新增 `vendor` 表示**修改已 vendored 的第三方库/插件源码**。
- 范围由项目自定，如 `aiflow`、`character`、`specs`、`sprint` 等。
- 示例：`feat(character): 冲刺参数改为蓝图属性`、`docs(aiflow): 新增 Puerts 蓝图属性规范`、`vendor(puerts): 调整 TS Blueprint 自动同步启动时序`、`devlog: 策划案拆分与迭代方式决策记录`。
- 当 AI 帮用户**准备完整提交日志内容**时，除必须保留英文的固定格式、专有名词、代码标识符、命令、路径等内容外，**默认以中文为主**归纳标题与正文，不主动改写成英文。
- 当 AI 帮用户**准备完整提交日志内容**时，日志末尾必须补一行 `Made-with: xxx` 作为最后一行；`xxx` 填写当前实际使用的 AI IDE / 助手名称，如 `Cursor`、`Codex`、`Claude Code`、`OpenCode` 等，不得省略或虚构。
- 在 Windows PowerShell 下，若提交信息包含中文或多行正文，**不得**用 stdin / pipe 方式直接传给 `git commit -F -`；应先写入 **无 BOM 的 UTF-8** 文件，再用 `git commit -F <file>` 或 `git commit --amend -F <file>`。
- 在 **Windows PowerShell 5.1** 下，`Set-Content -Encoding UTF8` 与 `Out-File -Encoding utf8` 默认会写入 BOM；提交信息文件**不得**用这两种写法生成。
- Windows PowerShell 5.1 下的默认安全写法是：`$utf8NoBom = New-Object System.Text.UTF8Encoding($false)`，再用 `[System.IO.File]::WriteAllText(<file>, <content>, $utf8NoBom)` 写入提交信息。
- 即使当前 shell 已切到 UTF-8，含中文提交信息也仍以“无 BOM UTF-8 文件 + `-F <file>`”作为默认安全做法，不依赖管道编码。

## 执行流程与各类型日志格式

执行提交时的流程（先列出拟提交文件与完整日志、**经用户用「确认提交」/「按此提交」等明确确认后再执行**；例外与细节见下文）以及各类型提交日志的详细书写格式（功能特性 / AI 工作流 / 修复 / 第三方库/插件源码修改 / 通用改动），见 [commit-prompts.md](commit-prompts.md)（文中「执行流程」一节）。
