# specs 同步规则

当阶段状态、目标、范围或验收变化时，至少同步：

- `aiflow/CONTEXT.md`
- `aiflow/specs/GAME_PHASES.md`
- 对应 `aiflow/specs/MVP*.md`
- 对应 contracts 文件

## SPEC_SYNC 检查

Verifier 的 `SPEC_SYNC` 至少确认：

- phase 状态一致。
- specs 与 Brief 的目标一致。
- specs 与 Verifier 的验收口径一致。
- Context 中的 Current 指针不指向 stale 合同。

## 不要求同步的内容

- 临时实现过程。
- 调试日志。
- 命令输出。
- 一次性排障记录。

这些内容进入 run / evidence / ledger。
