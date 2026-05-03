# 自主验收规则

适用场景：

- 编写 Verifier。
- 执行自动检查。
- 生成 Run、Evidence、Ledger。

## 原则

- `automation_level: auto` 必须真实执行。
- 人工烟测不能替代自动检查。
- Run 记录过程，Ledger 记录 accepted 摘要。
- 没有 run 和 evidence，不宣称 verified。

## auto 检查必须写清

- `stimulus`：如何触发。
- `observe`：观察什么。
- `oracle`：什么算通过。
- `evidence`：证据路径。
- `on_fail`：失败后怎么处理。

## MVP01 最低自动验收

- `combat_events.jsonl` 存在且非空。
- `attempt_summary.json` 存在且非空。
- JSON / JSONL 可解析。
- 事件流包含 attempt start、玩家输入、敌人动作、伤害或死亡。
- 摘要包含 run id、map、结束原因、最后事件和伤害摘要。

## 失败处理

失败后默认：

1. 分类失败原因。
2. 做最小修复。
3. 重跑失败项。
4. 必要时重跑相关回归项。
5. 再写 run / evidence。
