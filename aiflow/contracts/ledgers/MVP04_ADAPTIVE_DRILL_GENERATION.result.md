# MVP04_ADAPTIVE_DRILL_GENERATION 结果台账

- Baseline: `MVP04_ADAPTIVE_DRILL_GENERATION@v0.1`
- Accepted Run: `aiflow/contracts/runs/MVP04_ADAPTIVE_DRILL_GENERATION.run-001.yaml`
- Evidence Index: `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/index.md`
- Status: accepted

## Accepted Summary

MVP04 已通过自动验收。生成器读取 MVP03 accepted evidence 中的 `coaching.json`，验证 `practice_objective` 与 `drill_spec_candidate`，并生成正式 `drill_spec.json` 与 `drill_session.json`。

Accepted run 将 `posture_break_into_execution` 的 `practice.posture_break_into_execution.avoid_execution_setup` 练习目标规范化为白名单模板 `single_enemy_execution_response`。输出保留 source attempt、diagnosis、coaching、practice objective 与 telemetry metric 链路，不包含 Blueprint、资产路径、控制台命令或自由形式场景创建指令。

## Checks

- TypeScript build: pass
- Drill input parse: pass
- Drill Spec schema: pass
- Drill Session schema: pass
- Source traceability: pass
- Template whitelist: pass
- Parameter whitelist and safe ranges: pass
- Unsupported template rejection: pass
- Unknown parameter rejection: pass
- Unsafe field/string rejection: pass
- Insufficient evidence rejection: pass
- Runtime guide request drill artifacts: pass

## Remaining Risks

- 当前只支持 `single_enemy_execution_response` 一个模板。
- 当前输出是 UE 白名单模板请求和 session 元数据；真实进入练习场的关卡/出生点/敌人控制入口仍需后续 UE 侧接入深化。
- 成功指标已写入 Drill Spec，但是否改善仍由 MVP05 telemetry evaluation 判断。

## Next Step

进入 `MVP05_EVALUATION_AND_ITERATION`，基于 drill session 和后续 telemetry 判断练习目标是否改善。
