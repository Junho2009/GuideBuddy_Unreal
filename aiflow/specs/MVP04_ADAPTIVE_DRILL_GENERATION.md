# MVP04：Drill Spec 规范化与练习场请求生成

## 本阶段目标

基于 MVP03 输出的 Drill Spec 草案，验证并规范化为 UE 侧受控模板可以执行的正式 Drill Spec 和练习场 session 请求。

本阶段完成后，项目应能回答：

**系统能不能把玩家这次失败转换成一个安全、可追溯、可执行的练习场请求。**

## 本次一定要有

- 能读取 `coaching.json` 中的 `practice_objective` 与 `drill_spec_candidate`。
- 能验证 Drill Spec 只包含白名单模板、敌人类型、行为权重、成功条件和安全约束。
- 能生成 `drill_spec.json` 或将候选草案规范化为正式 Drill Spec。
- 能生成 `drill_session.json`，记录本次练习场使用的模板、参数、来源诊断和关联尝试。
- 至少支持一个训练场模板：
  - 单敌人。
  - 固定小场地。
  - 固定或加权攻击模式。
  - 明确的时长与成功条件。
- 至少支持一个练习目标：
  - 避免在敌人特殊攻击前摇或危险窗口中过度攻击。
  - 或避免姿态被打空后进入处决窗口。
- 练习场请求必须可重复、可回收、可由后续运行时和遥测评估。

## 推荐扩展

- 根据 MVP06 评估结果自动升降难度。
- 支持多个白名单模板，例如闪避时机、格挡时机、姿态恢复、治疗时机。
- 支持固定随机种子，便于复现和验收。
- 支持 MVP05 练习场运行完成后的 `drill_result.json`。
- 支持把 MVP06 评估结果回写到下一轮 coaching 输入。

## 本次先不做

- 不让 LLM 直接生成或修改 Blueprint 图。
- 不让 LLM 传入任意资产路径、类名、控制台命令或脚本。
- 不做完整训练关卡编辑器。
- 不实现玩家切换进入练习场的完整运行时流程；该部分进入 MVP05。
- 不做多敌人复杂 encounter 编排。
- 不做长期训练课程系统。
- 不做在线关卡分发或云端个性化服务。

## Drill Spec 最低字段

```json
{
  "schema_version": "guidebuddy.drill_spec.v1",
  "practice_objective_id": "avoid_overcommit_vs_special_attack",
  "source_attempt_run_id": "example-run",
  "source_diagnosis_id": "example-diagnosis",
  "arena_template": "single_enemy_timing_drill",
  "enemy_archetype": "katana_enemy",
  "pattern_weights": {
    "special_attack": 0.7,
    "light_attack": 0.3
  },
  "success_metrics": {
    "duration_seconds": 30,
    "max_posture_breaks": 0,
    "max_overcommit_windows": 1
  },
  "constraints": {
    "max_enemies": 1,
    "disable_extra_hazards": true,
    "difficulty": 0.35
  }
}
```

字段名可以随实现细化，但必须保留以下原则：

- 练习目标只聚焦一个问题。
- 所有模板、敌人和参数必须可被白名单验证。
- 成功条件必须能由 telemetry 或 evaluation 复查。
- Drill Spec 必须能追溯到一次诊断和一次导玩输出。

## 验收方式

最低验收场景：

1. 使用 MVP03 生成的一份 `coaching.json`，其中包含 `practice_objective` 与 Drill Spec 草案。
2. 验证并规范化 Drill Spec。
3. 系统验证并规范化 Drill Spec。
4. 系统写出 `drill_spec.json` 与 `drill_session.json`。
5. 系统证明非白名单模板、参数和危险字段会被拒绝。
6. MVP05 能基于该 Drill Spec 和 session 请求接入真实可进入的练习场。

人工验收关注：

- 练习场请求是否真的只练一个问题。
- 练习目标是否和原始失败证据一致。
- 训练场配置是否可控、可重复，不像随机临时拼凑。
- 后续运行时是否能让玩家理解自己要进入什么练习。

自动验收关注：

- Drill Spec 可解析。
- 所有模板、敌人、参数都在白名单内。
- `drill_session.json` 可解析。
- session 请求能关联回 source attempt、diagnosis、coaching 和 practice objective。
- 非白名单字段或危险字段会被拒绝。

## 依赖与衔接

- 依赖 MVP01 的 telemetry 输出。
- 依赖 MVP02 的稳定诊断和 `practice_objective_seed`。
- 依赖 MVP03 的 `practice_objective` 与 Drill Spec 草案。
- 输出结果将供 MVP05 生成可进入的练习场，并供 MVP06 关联练习 telemetry 评估是否改善。
- 需要 UE 侧提供受控训练场模板、参数白名单；进入 / 退出练习场的稳定入口进入 MVP05。

## 当前状态

已验收。`MVP04_ADAPTIVE_DRILL_GENERATION@v0.1` 已通过 `npm.cmd run verify:mvp04`，accepted run 为 `aiflow/contracts/runs/MVP04_ADAPTIVE_DRILL_GENERATION.run-001.yaml`。本 accepted scope 是 Drill Spec 规范化、白名单验证和 session 请求生成，不包含玩家实际切换进入练习场的运行时流程。

## 备注

MVP04 的关键不是“让 LLM 创作一个关卡”，而是让 LLM 像教练一样选择最小练习目标，再让 UE 侧像工具系统一样稳定执行受控配置。任何无法验证、无法复现或无法追溯到诊断证据的训练场生成，都不应进入本阶段最低闭环。
