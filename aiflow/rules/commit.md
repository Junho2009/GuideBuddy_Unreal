# 提交规范

## 提交信息格式

采用 Conventional Commits：

```text
type(scope): 中文描述
```

常用类型：

- `docs`
- `feat`
- `fix`
- `refactor`
- `chore`
- `test`
- `vendor`

常用范围：

- `aiflow`
- `telemetry`
- `diagnostics`
- `coaching`
- `unreal`

## AI 准备提交信息时

- 默认中文正文。
- 首行使用英文 type / scope。
- 最后一行必须是 `Made-with: Codex`。
- Windows PowerShell 下，中文多行提交信息必须写入无 BOM UTF-8 文件，再用 `git commit -F <file>`。
- 不要用 stdin / pipe 直接传中文提交信息。

## 提交流程

1. 先列出拟提交文件。
2. 给出完整提交信息。
3. 等用户明确说“确认提交”或等价语句。
4. 再执行 stage 和 commit。
5. 提交后读回 `git log -1 --pretty=format:"%H%n%B"` 检查编码。

详细流程见 `aiflow/rules/commit-prompts.md`。
