# MVP07：真实 LLM Provider 接入

## 本阶段目标

在 MVP05 练习场可进入、MVP06 效果评估可运行之后，将 MVP03 或后续导玩节点中的本地规则模板替换为真实、可配置、可回退的 LLM provider。

本阶段完成后，项目应能回答：

**真实 LLM 能不能在不破坏诊断证据、白名单安全边界和自动验收的前提下，生成更自然的导玩建议与练习目标。**

## 本次一定要有

- 保持 MVP03 既有 provider 边界，允许在本地规则 provider 与真实 LLM provider 之间切换。
- LLM 输入仍必须是高信号摘要，不能直接消费完整原始事件流。
- LLM 输出必须通过 schema 校验和白名单校验后才能进入 coaching 或 Drill Spec candidate。
- 外部 API 不可用时必须能回退到本地规则 provider。
- 自动验收不能依赖真实外部 API 一定可用；需要 mock、fixture 或录制响应路径。
- 配置中不能硬编码密钥。

## 本次先不做

- 不让 LLM 直接覆盖确定性诊断主标签。
- 不让 LLM 直接自由创建 UE 场景、Blueprint、资产路径、控制台命令或脚本。
- 不做多轮聊天系统。
- 不做云端玩家画像。
- 不把 provider 替换作为 MVP05 / MVP06 的前置条件。

## 验收方式

最低验收场景：

1. 使用 MVP02 的诊断结果构造 LLM 输入摘要。
2. 通过真实 provider 或受控录制响应生成 `coaching.json`。
3. 输出通过 MVP03 schema、证据一致性和 Drill Spec candidate 白名单校验。
4. provider 不可用时，系统回退到本地规则 provider，并保持闭环可运行。

人工验收关注：

- 建议是否比本地规则 provider 更自然、更贴合玩家水平。
- 建议是否仍然短、具体、只聚焦一个问题。
- LLM 是否没有编造不存在的事件、攻击或资产。

自动验收关注：

- provider 配置可解析。
- API key 不进入仓库。
- mock / recorded provider 可稳定通过 CI 或本地 verifier。
- 输出 schema 与安全边界不因真实 provider 而放宽。

## 依赖与衔接

- 依赖 MVP03 的 provider 边界和 `coaching.json` schema。
- 依赖 MVP04 的 Drill Spec 白名单边界。
- 建议在 MVP05 / MVP06 跑通后再接入，避免把“真实 LLM 表达质量”误当成“练习闭环是否成立”。

## 当前状态

未开始。

## 备注

真实 LLM provider 是表达质量和泛化能力升级，不是早期闭环的地基。先证明系统能诊断、能让玩家练、能评估，再接真实 provider，风险会小很多。
