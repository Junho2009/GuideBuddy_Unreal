# MVP02_DIAGNOSTIC_SIGNAL_LAYER 澄清确认包

状态：`active`

## 一句话目标

基于 MVP01 输出的 `combat_events.jsonl` 与 `attempt_summary.json`，生成可解释、可验证、可供 MVP03 LLM 导玩读取的 `diagnosis.json`。

## 推荐默认项

- 默认输入：`Saved/GuideBuddy/Telemetry/<run-id>/` 或已归档的 MVP01 raw evidence。
- 默认输出：同一 run 目录下的 `diagnosis.json`。
- 默认实现位置：`TypeScript/GuideBuddy/diagnosis.ts`，编译到 `Content/JavaScript/GuideBuddy/diagnosis.js`。
- 默认先做确定性规则诊断，不接真实 LLM API。
- 默认保留 `llm_review` 占位字段，但 `enabled: false`。
- 默认支持死亡或明显失败归因；证据不足时输出 `insufficient_evidence`。

## 已确认的需求理解

- 本阶段目标是“把事实变成诊断信号”，不是输出最终导玩话术。
- 诊断必须保留事件证据，不能只输出标签。
- LLM 可在后续阶段润色、排序或复核，但不能绕过确定性证据成为唯一诊断来源。
- 第一版可使用 MVP01 已归档真实 gameplay 事件作为自动验收 fixture。
- 第一版不修改战斗数值、不修改 Blueprint 二进制资产、不做 UI。

## 待确认点

1. 是否需要在后续补充更多真实死亡样本，让 `overcommit_into_enemy_attack` 与 `missed_or_late_dodge` 有独立 gameplay fixture？
2. 是否需要把内部 tag 映射为玩家可读招式名称？
3. MVP03 的 LLM prompt 是否直接消费 `diagnosis.json`，还是先压缩成更短的 coaching input？

## 推荐回答

建议先接受当前默认项：MVP02 以确定性诊断器和自动 verifier 为 release blocking；更多样本、显示名映射和 LLM review 放到后续增量。
