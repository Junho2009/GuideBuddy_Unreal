# 战斗运行时背景

## 默认场景

- Map：`/Game/TCF_SampleDemo/SampleDemoShowcaseMap.SampleDemoShowcaseMap`
- Unreal 项目：`TCF_Sample.uproject`
- 战斗框架：`TempestCombatFramework`

## 已知资产入口

- `/Game/Integration/BP_GS_Enemy_Katana`
- `/Game/Integration/BP_TCF_GS_GameMode`
- `/Game/Integration/BP_GhostSamuraiCharacter`
- `/Game/Integration/BP_TCF_GS_PlayerController`
- `/Game/Integration/BP_Player_GS_Weapon`
- `/Game/Integration/Player_GS_PDA`
- `/Game/Integration/BP_GS_AI_Katana_Weapon`
- `/Game/Integration/DA_GS_Katana_Enemy`

## 主要内容分布

- `Content/Integration/Abilities/BP_GS_*`
- `Content/Integration/States/BP_GS_*`
- `Content/Integration/Properties/*`
- `Plugins/TempestCombatFramework/Content/Abilities`
- `Plugins/TempestCombatFramework/Content/States`
- `Plugins/TempestCombatFramework/Content/BehaviorProperties`
- `Plugins/TempestCombatFramework/Content/AttackProperties`
- `Plugins/TempestCombatFramework/Content/DefenseProperties`
- `Plugins/TempestCombatFramework/Content/Trace`

## 推荐遥测挂点

- `UTempestBaseAbilityManagerComponent::OnAbilityActivation`
- `UTempestBaseStateManagerComponent::OnStateActivation`
- `UTempestBaseInputComponent` 的输入触发、缓冲与 watch list 相关 delegate
- `UTempestCombatComponent` 的 attack / received attack / combat status 相关 delegate
- `UTempestBaseAttributeObject::OnValueUpdated`
- `UTempestBaseTraceObject::OnTraceHitDelegate`

## MVP01 观测目标

MVP01 只要求能记录一次玩家尝试的关键事实：

- attempt start / end
- 玩家关键输入
- 敌人动作或状态
- 伤害或死亡
- 尝试摘要

输出路径以 `Saved/GuideBuddy/Telemetry/<run-id>/` 为默认约定。
