# 提交提示（commit-prompts）

执行提交时的流程与各类型日志书写格式。提交信息格式遵循 [commit.md](commit.md) 的 **Conventional Commits**：`类型(范围): 描述`，类型与范围英文小写，范围可选。

---

## 执行流程

当用户提及提交（如「提交」「帮我提交」「@commit.md」「提交工作流 / 单独提交某文件」等）时：**默认先完成下列「第一步」**，不得在尚未满足「第二步」条件时执行 `git add` 或 `git commit`。

### 第一步：列出待确认内容（禁止执行提交）

- 拟提交的**文件路径列表**
- **完整的提交信息**（首行符合 `类型(范围): 描述`，可带正文；若由 AI 准备日志内容，默认以中文为主，最后一行必须带上 `Made-with: xxx`）
- 若工作区还有其它改动，简要说明是否**刻意排除**在本提交之外

**不视为已授权提交**：仅「帮我提交」「提交一下」、引用规范文档但未附带第二步确认用语等——这些只触发本步骤；助手输出清单后**必须停下**，等待用户下一条消息。

### 第二步：用户明确确认后再执行

用户需在新消息中使用确认用语，以下**任选其一**即可：**「确认提交」**、**「按此提交」**（或语义再等价的明确同意，如「照这个提交」）。

收到确认后，再执行 `git add` + `git commit`（范围以上一步清单为准）。

- 在 Windows PowerShell 下，若提交信息含中文或多行正文，优先先写 **无 BOM 的 UTF-8** 临时文件，再用 `git commit -F <file>`；修复最新提交信息时，用 `git commit --amend -F <file>`。
- **禁止**把中文提交信息通过 `... | git commit -F -` 这类 stdin / pipe 方式直接喂给 Git。
- 在 **Windows PowerShell 5.1** 下，**禁止**用 `Set-Content -Encoding UTF8` 或 `Out-File -Encoding utf8` 生成提交信息文件；这两种写法会带 BOM。
- 若仓库提供 `./.codex/scripts/safe_git_commit.ps1`，Codex 提交时优先使用该脚本而不是直接拼接 `git add` / `git commit` 命令。
- Codex 默认优先走 **inline base64 参数** 模式，避免在脚本启动前额外写入 `./.codex/.git-commit-paths.txt` 或 `./.codex/.git-commit-message.txt`，从而减少沙箱写入失败与额外权限弹窗。推荐做法是：将“待提交路径列表（逐行文本）”和“完整提交信息”分别按 UTF-8 编码成 base64，然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File '.\.codex\scripts\safe_git_commit.ps1' `
  -PathsBase64 '<utf8-base64-path-lines>' `
  -MessageBase64 '<utf8-base64-commit-message>'
```

- 如需人工调试或仓库外工具复用，该脚本仍兼容文件输入模式：将待提交路径逐行写入 `./.codex/.git-commit-paths.txt`、将完整提交信息写入 `./.codex/.git-commit-message.txt`（无 BOM UTF-8），再执行：

```powershell
powershell -ExecutionPolicy Bypass -File '.\.codex\scripts\safe_git_commit.ps1' `
  -PathsFile '.\.codex\.git-commit-paths.txt' `
  -MessageFile '.\.codex\.git-commit-message.txt'
```

- 若需要持久授权以避免 Codex 每次提交都弹权限确认，**只**批准上述 repo-local 脚本前缀；**不要**批准宽泛的 `git`、`powershell` 或其它可执行任意命令的前缀。
- 推荐直接使用以下模板写入提交信息文件，再执行 `git commit -F <file>` / `git commit --amend -F <file>`：

```powershell
$commitMessagePath = Join-Path $PWD '.git-commit-message.txt'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($commitMessagePath, $commitMessage, $utf8NoBom)
```

- 提交完成后，必须立即运行 `git log -1 --pretty=format:"%H%n%B"` 自检最新 commit message。
- 若发现标题或正文出现 `?`、乱码或缺字，立即停止后续 git 操作，并改用 UTF-8 文件重做 `git commit --amend -F <file>`。

### 与「一条消息说完」的例外

若用户**单条消息里已经同时**写明：（1）提交范围或委托助手根据上下文选定文件，**且**（2）含 **「确认提交」** 或 **「按此提交」**：助手仍须先输出「拟提交文件 + 完整提交信息」供留痕，**随后可在同一条助手回复内**执行 `git add` + `git commit`。若缺确认用语，一律只做到第一步。

### 与其它规则的冲突

涉及 **Git 提交** 时，以本文件与 **aiflow/RULES.md** 的提交门禁为准：**先清单、再确认、再提交**；不因「自行执行终端命令」类泛化规则而跳过确认。

---

## 各类型：类型/范围与日志格式

| 类型 | 建议类型(范围) | 描述/正文格式 |
|------|----------------|----------------|
| **功能特性** | `feat(范围)` | 综述（作用/接入方式/触发方式）+ 逐一详述（主要改动及各自解决的问题） |
| **修复** | `fix(范围)` | 综述（解决了哪些问题）+ 逐一详述（具体问题/根因/解决方案） |
| **实现优化** | `refactor(范围)` 或 `chore(范围)` | 综述（优化了什么）+ 逐一详述（主要优化思路与实现要点） |
| **AI工作流** | `docs(aiflow)` 或 `chore(aiflow)` | 综述（主要改动点/目标问题/使用方式）+ 逐一详述（主要改动及各自解决的问题） |
| **第三方库/插件源码修改** | `vendor(第三方名)` | 第三方版本信息 + 综述（主要修改与简要动机）+ 逐一详述（具体改动 / 为什么必须改其源码 / 解决方案） |
| **开发日志** | `devlog`（范围可省略） | 综述（功能域/关键词/类型标签）+ 逐一详述（预期 vs 实际，关键决策 / 意外经过，处理结果） |
| **通用改动** | `docs` / `chore` 等 | 综述 + 逐一详述（主要改动及各自解决的问题） |

- **范围**由项目自定，如 `aiflow`、`character`、`specs`、`sprint` 等；开发日志常用 `devlog:` 不写范围。
- 正文可多行，首行后空一行再写；与 Conventional Commits 兼容。
- 若提交日志内容由 AI 准备，标题描述与正文默认以中文归纳；仅在涉及 Conventional Commits 的类型/范围、专有名词、代码标识符、命令、路径、固定英文标记等场景时保留英文。
- 若提交日志内容由 AI 准备，必须在**整个日志最后一行**追加 `Made-with: xxx`；`xxx` 填当前实际使用的 AI IDE / 助手名称，如 `Cursor`、`Codex`、`Claude Code`、`OpenCode` 等。
- 若首行后还有正文或说明，`Made-with: xxx` 与前文之间保留一个空行，保持其作为结尾标记清晰可见。

### 第三方库/插件源码修改（`vendor`）的额外要求

- `vendor` 仅用于**直接修改仓库内 vendored 的第三方库/插件源码**；若只是改项目侧调用方式、配置、适配层或临时绕过逻辑，仍按 `fix` / `refactor` / `chore` 等常规类型处理。
- `vendor` 的**范围**默认填写第三方库/插件名，例如 `vendor(puerts)`、`vendor(unrealmcp)`，避免写成项目模块名。
- 正文必须显式包含以下三部分，且缺一不可：
  - **第三方版本信息**：写明第三方库/插件名称与**可唯一定位**的版本号；若仅写语义化版本仍不足以唯一确定具体源码，继续补充 tag、commit hash、发行包标识、来源仓库/发布页等定位信息。
  - **综述**：简要说明主要做了哪些修改，以及为什么需要做这些修改。
  - **详述**：逐项说明具体改了哪些位置、要解决的原始问题是什么、为什么**必须修改第三方源码**而不能通过项目代码 / 配置 / 调用顺序 / 包装层等方式实现，以及最终采用的源码级解决方案是什么。
- `详述` 的目标读者应默认为**不了解该第三方源码的人**；描述应让读者能快速理解修改缘由、必要性和主要入口位置，而不需要先读完整个第三方库。
- 若本次改动的直接动因是上游加载时序、接口缺口、封装边界不足、版本 bug 或项目侧无法安全绕开的行为差异，应在 `详述` 中明确写出这些约束，而不是只写“为了解决问题所以改了源码”。
- 推荐正文模板如下：

```text
vendor(第三方名): 用一句话概括本次第三方源码修改

第三方版本信息
- 第三方库/插件名：版本号（必要时补充 tag / commit hash / 发行包来源）

综述
- 主要修改 1，以及对应的简要动机
- 主要修改 2，以及对应的简要动机

详述
- 具体问题 / 触发条件：
- 为什么不能通过项目代码、配置或外部适配解决：
- 本次直接修改第三方源码的切入点：
- 解决方案与最终效果：

Made-with: xxx
```
