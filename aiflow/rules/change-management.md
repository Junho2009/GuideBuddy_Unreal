# 需求变更规则

适用场景：

- 已确认合同后，目标、范围或验收发生变化。
- Verifier 发现合同与现实不匹配。
- 用户改变 MVP 优先级。

## draft 阶段

MVP 合同仍是 `draft` 时，可以直接修改草案，但要保持 specs 与 contracts 同步。

## confirmed / frozen 后

以下变化需要 Change Request：

- in-scope / out-of-scope 变化。
- 输出文件结构变化。
- 验收口径变化。
- 自动验收能力变化。
- 当前 phase 的完成定义变化。

## 处理顺序

1. 写 Change Request。
2. 更新 specs。
3. 重编译 Brief / Task Pack / Manifest / Verifier。
4. 同步 `CONTEXT.md`。
5. 重新执行必要验收。
