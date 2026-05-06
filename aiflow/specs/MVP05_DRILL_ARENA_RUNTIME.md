# MVP05：练习场运行时接入

## 本阶段目标

基于 MVP04 生成的 `drill_spec.json` 与 `drill_session.json`，在 UE 侧生成或进入对应的受控练习场，让玩家能够切换到该练习场做针对性的单点训练。

本阶段完成后，项目应能回答：

**玩家能不能真的进入一个由本次诊断驱动、只练一个问题的训练场。**

## 本次一定要有

- 能读取 MVP04 生成的 `drill_spec.json` 与 `drill_session.json`。
- 能从战斗结束复盘卡或等价入口触发“进入练习场”。
- 至少支持 `single_enemy_execution_response` 一个白名单练习模板。
- 能把练习场 run 关联回 source attempt、diagnosis、coaching、practice objective、drill spec 和 drill session。
- 能在练习场中保留或生成常规 telemetry，使 MVP06 可以评估目标指标。
- 能稳定退出练习场或重新挑战，不破坏原主场景流程。
- 练习场参数只来自白名单模板和受控参数，不允许自由资产路径、Blueprint 类名、控制台命令或脚本。

## 推荐实现方式

- 优先复用现有 `SampleDemoShowcaseMap`、敌人资产和战斗挂点，先做最小可进入练习场，不先做完整训练关卡编辑器。
- 可以先用固定出生点、固定敌人组合和受控行为参数表达 `single_enemy_execution_response`。
- 练习场入口可以先是 Slate 复盘卡按钮或调试入口，后续再替换成正式 UMG。
- 如果真实动态场景生成风险过高，可以先实现稳定的练习模式切换：读取 drill spec，进入同一地图中的练习区域或重置到练习配置。

## 本次先不做

- 不支持多个练习模板。
- 不做自由形式 UE 场景生成。
- 不让 LLM 直接指定资产路径、类名、控制台命令或 Blueprint 逻辑。
- 不做长期课程系统。
- 不在本阶段评估练习是否改善玩家表现；评估进入 MVP06。
- 不在本阶段接真实 LLM provider；真实 provider 进入 MVP07。

## 验收方式

最低验收场景：

1. 使用 MVP04 accepted evidence 中的 `drill_spec.json` 与 `drill_session.json`。
2. 玩家或 verifier 触发进入练习场。
3. 系统进入 `single_enemy_execution_response` 对应的受控练习状态。
4. 练习场 run 写出 telemetry，并带有 `practice_objective_id`、`drill_id`、`session_id` 和 source refs。
5. 玩家可以退出或重新挑战，原主场景流程保持可用。

人工验收关注：

- 玩家是否能明确进入了“只练当前问题”的场景。
- 练习内容是否和 `drill_spec.json` 的目标一致。
- 切换、退出、重试是否稳定。
- 练习场是否没有绕过 MVP04 的安全白名单。

自动验收关注：

- `drill_spec.json` 与 `drill_session.json` 可被运行时读取。
- 入口触发后能生成练习 run telemetry。
- 练习 run 能追溯到 source attempt、diagnosis、coaching 和 drill session。
- 非白名单 template 或参数不会被运行时执行。

## 依赖与衔接

- 依赖 MVP04 的正式 Drill Spec 与 Drill Session。
- 依赖 UE 侧可复用的地图、出生点、敌人资产和稳定的进入 / 退出入口。
- 输出的练习 telemetry 将供 MVP06 判断练习是否改善目标问题。
- 后续可以根据 MVP06 评估结果扩展难度升降、多模板和练习结果回写。

## 当前状态

待编译 contracts。

## 备注

本阶段的价值是把“AI 说你该练什么”推进到“你现在就能去练这个点”。先让一个模板闭环跑通，比同时扩很多练习类型更重要。
