# evidence

本目录保存合同层 evidence 索引，以及 accepted / verifier-passed run 的关键原始证据归档。

本地运行时原始遥测仍先输出到：

```text
Saved/GuideBuddy/Telemetry/<run-id>/
```

该目录属于 Unreal 本地运行产物，不直接整体纳入版本管理。

通过 verifier 的关键原始证据应归档到对应 evidence run 下：

```text
aiflow/contracts/evidence/<PHASE_ID>/<baseline-version>/run-xxx/
  index.md
  raw/
    combat_events.jsonl
    attempt_summary.json
```

归档规则：

- 不覆盖已有 raw evidence。
- 同一 `run_id` 已归档时复用现有目录。
- 旧 evidence 目录存在但缺少 `raw/` 时，只有源 `run_id` 匹配才补齐。
- 新的通过 run 使用下一个 `run-xxx` 目录。
