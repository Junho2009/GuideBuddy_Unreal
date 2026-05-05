# MVP02：诊断信号层

## 本阶段目标

在 MVP01 的事件流基础上，生成玩家失败原因和操作质量的诊断信号。

本阶段完成后，项目应能回答：

**玩家这次主要为什么失败。**

## 本次一定要有

- 能读取一次尝试的 `combat_events.jsonl` 与 `attempt_summary.json`。
- 能生成 `diagnosis.json`。
- 能归因一次玩家死亡或明显失败。
- 至少支持以下三类诊断：
  - 闪避过早或过晚。
  - 贪刀 / 过度承诺。
  - 致命攻击归因。
- 能在诊断中保留证据，而不是只输出标签。
- 能在证据不足时输出 `unknown` 或 `insufficient_evidence`。
- 能输出 `practice_objective_seed`，为后续 LLM 选择最小练习目标提供机器可读输入。
- 为可选 LLM review 预留输入摘要与输出字段，但本阶段最低实现不接入真实 LLM API。

## 推荐扩展诊断

若 MVP01 已能稳定采集相关数据，本阶段可以扩展：

- 资源耗尽导致无法闪避或防御。
- 错误治疗时机。
- 连续多次死于同一攻击。
- 面对同一攻击的平均响应延迟。
- 可选 LLM review：只对确定性候选诊断做排序、解释和练习优先级补充，不替代规则诊断。

## 本次先不做

- 不做复杂机器学习模型。
- 不做全量招式语义库。
- 不做长期玩家画像。
- 不做实时战斗内提示。
- 不要求诊断所有失败；允许明确承认证据不足。
- 不把 LLM API 调用作为 MVP02 的 release blocking 路径。
- 不允许 LLM 绕过确定性证据直接写入主失败标签。

## 验收方式

最低验收场景：

1. 使用 MVP01 生成的一次死亡尝试数据。
2. 运行诊断层。
3. 生成 `diagnosis.json`。
4. `diagnosis.json` 至少包含：
   - 主要诊断标签。
   - 致命攻击或最后伤害来源。
   - 死亡前关键事件片段。
   - 下一次练习目标的机器可读描述。
   - 诊断信心。
   - `practice_objective_seed`，至少包含候选练习焦点、目标错误、证据窗口和可评估指标。
   - `llm_review` 字段占位，默认 `enabled: false`，用于后续可选复核。

人工验收关注：

- 诊断是否能被人理解。
- 证据是否能支撑诊断。
- 不确定时是否没有强行胡乱归因。

自动验收关注：

- 输入文件可解析。
- 输出文件可解析。
- 输出包含必需字段。
- 至少一个预设样例能得到预期诊断标签。
- 未配置 LLM API 时，自动验收仍能完整通过。

## 依赖与衔接

- 依赖 MVP01 的事件与摘要质量。
- MVP03 将把本阶段输出作为 LLM 的主要输入，并基于 `practice_objective_seed` 生成玩家可读建议和 Drill Spec 草案。
- 如果后续启用 MVP02 LLM review，其输出只能作为 `llm_review` 附加信息进入 MVP03，不能成为唯一诊断来源。
- 如果 MVP01 无法采集攻击时间点，本阶段应先使用 ability / state 激活时间近似，不阻塞整个闭环。

## 当前状态

未开始。

## 备注

诊断层要尽量确定、保守、可解释。LLM 可以润色表达，但不应替代诊断层做核心归因。

`practice_objective_seed` 不是最终训练场配置。它只描述“最应该练什么”和“用哪些证据支撑”，不决定具体场景模板、敌人配置或难度参数。

推荐的 `diagnosis.json` 结构预留：

```json
{
  "deterministic": {
    "primary_failure": "posture_break_into_execution",
    "evidence_event_seqs": [882, 895, 1015, 1016],
    "confidence": 0.86
  },
  "llm_review": {
    "enabled": false,
    "status": "not_configured"
  },
  "final": {
    "primary_failure": "posture_break_into_execution",
    "practice_objective_seed": {
      "focus": "avoid_posture_break_into_execution"
    }
  }
}
```
