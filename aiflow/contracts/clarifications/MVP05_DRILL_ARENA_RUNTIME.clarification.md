# MVP05_DRILL_ARENA_RUNTIME clarification

## Confirmed Change

2026-05-06：人类明确要求先调整 MVP05 开发计划，不再先接 MVP04 drill artifacts，而是先硬编码实现一个翻滚躲避训练场，用来确认训练场体验是否符合预期。

## Confirmed Defaults

- 正式入口仍是 `/Game/TCF_SampleDemo/SampleDemoShowcaseMap.SampleDemoShowcaseMap`。
- 正式场景右上角提供进入训练场按钮。
- 训练场可基于 `SampleDemoShowcaseMap.umap` 复制或等价复用。
- 训练要点固定为：`通过翻滚来避开敌人攻击`。
- 连续成功目标默认 5 次，并通过配置项保留调整能力。
- 达成目标后弹出完成提示，并提供返回正式场景按钮。
- 训练场内玩家和敌人不扣血、不死亡，保留受击硬直等反馈。

## Deferred

- MVP04 `drill_spec.json` / `drill_session.json` 驱动入口。
- 多模板训练场。
- 训练效果改善评估。
- 真实 LLM provider。
