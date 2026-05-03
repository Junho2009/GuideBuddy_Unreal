# Prose 到合同规则

适用场景：

- 用户提出新的 MVP 需求。
- 需要新增或修改 phase prose。
- 需要把 specs 编译为 contracts。

## 原则

- specs 是人类可读需求，不直接等于实现授权。
- Brief 冻结目标、范围和验收。
- Brief 未 confirmed / frozen 前，默认不进入正式实现。
- 若用户明确要求实现，可先把现有 draft 合同升级为 confirmed / frozen，再实施。

## 推荐流程

1. 读取 `CONTEXT.md`、`RULES.md` 和相关 specs。
2. 写或更新 Clarification，列出默认项和待确认点。
3. 写或更新 Brief。
4. 用户确认后，将 Brief 标记为 confirmed / frozen。
5. 同步 Task Pack、Manifest、Verifier。
6. 必要时同步 `CONTEXT.md` 的基线状态。

## Clarification 必须覆盖

- 一句话目标。
- 本次范围。
- 本次不做。
- 默认验收方式。
- 是否需要自动验收。
- 是否需要人工烟测。
- 仍需用户确认的问题。

## 输出要求

最少形成：

- `contracts/clarifications/<id>.clarification.md`
- `contracts/briefs/<id>.brief.yaml`
- 需要时补齐 taskpack / manifest / verifier
