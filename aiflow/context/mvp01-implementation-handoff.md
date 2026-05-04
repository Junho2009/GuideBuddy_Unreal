# MVP01 实现交接记录

最后更新：2026-05-04

本文档记录当前未验收实现状态，目的是方便在另一台电脑或新的 AI 会话中继续工作。它不是 accepted result ledger，也不能替代 verifier evidence。

## 当前状态

- 阶段：`MVP01_COMBAT_TELEMETRY_FOUNDATION`
- 基线：`MVP01_COMBAT_TELEMETRY_FOUNDATION@v0.1`
- 验收状态：真实 PIE gameplay 验收已通过，accepted run 为 `MVP01_COMBAT_TELEMETRY_FOUNDATION.run-001`。
- 运行输出状态：已生成 `Saved/GuideBuddy/Telemetry/20260504022450_UEDPIE_0_SampleDemoShowcaseMap_861420/`。
- 预期遥测根目录：`Saved/GuideBuddy/Telemetry/<run-id>/`

## 已实现内容

- 新增项目插件：`Plugins/GuideBuddy/`
- 新增 Runtime 模块：`GuideBuddyRuntime`
- `TCF_Sample.uproject` 已启用 `GuideBuddy` 插件。
- Runtime bridge 会在 `SampleDemoShowcaseMap` 运行时启动 Puerts JavaScript 环境。
- Runtime bridge 会把名为 `GuideBuddyBridge` 的 UObject 传给 TypeScript。
- Runtime bridge 会扫描运行时 actor，并发出以下语义遥测信号：
  - 玩家输入
  - 敌人 ability 激活
  - 敌人 state 激活
  - combat status 变化
  - attribute 数值变化
- TypeScript 流水线位于 `TypeScript/GuideBuddy/`。
- 生成的运行时代码位于 `Content/JavaScript/GuideBuddy/main.js`。
- MVP01 verifier 脚本位于 `aiflow/contracts/verifiers/verify_mvp01_telemetry.js`。

## 关键实现文件

- `Plugins/GuideBuddy/GuideBuddy.uplugin`
- `Plugins/GuideBuddy/Source/GuideBuddyRuntime/GuideBuddyRuntime.Build.cs`
- `Plugins/GuideBuddy/Source/GuideBuddyRuntime/Public/GuideBuddyTelemetryBridge.h`
- `Plugins/GuideBuddy/Source/GuideBuddyRuntime/Private/GuideBuddyTelemetryBridge.cpp`
- `Plugins/GuideBuddy/Source/GuideBuddyRuntime/Private/GuideBuddyRuntimeModule.cpp`
- `TypeScript/GuideBuddy/main.ts`
- `TypeScript/GuideBuddy/types.d.ts`
- `Content/JavaScript/GuideBuddy/main.js`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `aiflow/contracts/verifiers/verify_mvp01_telemetry.js`

## 输出契约

TypeScript runtime 应写出：

- `Saved/GuideBuddy/Telemetry/<run-id>/combat_events.jsonl`
- `Saved/GuideBuddy/Telemetry/<run-id>/attempt_summary.json`

第一版通过 `Attribute.Health` 下降推导 damage。伤害来源会从最近的敌人 ability、state 或 combat status 事件中推断，并标记为 inferred。

## 已验证项

原机器上已通过：

```powershell
npm.cmd run build:guidebuddy
```

```powershell
& 'D:\Program Files\Epic Games\UE_5.7\Engine\Binaries\DotNET\UnrealBuildTool\UnrealBuildTool.exe' UnrealEditor Win64 Development -Project='D:\Dev\Unreal\Projs\GuideBuddy_Unreal\TCF_Sample.uproject' -WaitMutex
```

`git diff --check` 也已通过。Git 只报告了正常的 CRLF 转换提示。

注意：`TCF_SampleEditor` 在当前项目中不是可解析的 target。除非后续新增 C++ project target，否则继续使用 `UnrealEditor` target。

## 验收结果

已通过：

```powershell
npm.cmd run build:guidebuddy
```

```powershell
& 'D:\Program Files\Epic Games\UE_5.7\Engine\Binaries\DotNET\UnrealBuildTool\UnrealBuildTool.exe' UnrealEditor Win64 Development -Project='<repo>\TCF_Sample.uproject' -WaitMutex
```

```powershell
npm.cmd run verify:mvp01
```

证据：

- `aiflow/contracts/runs/MVP01_COMBAT_TELEMETRY_FOUNDATION.run-001.yaml`
- `aiflow/contracts/evidence/MVP01_COMBAT_TELEMETRY_FOUNDATION/v0.1/run-001/index.md`
- `aiflow/contracts/ledgers/MVP01_COMBAT_TELEMETRY_FOUNDATION.result.md`
- `Saved/GuideBuddy/Telemetry/20260504022450_UEDPIE_0_SampleDemoShowcaseMap_861420/`

## 换机继续步骤

如果另一台电脑没有 `node_modules/`，先运行：

```powershell
npm.cmd install
```

修改 TypeScript 后重新生成运行时代码：

```powershell
npm.cmd run build:guidebuddy
```

用本机 UE 5.7 路径重新编译。原机器使用的命令是：

```powershell
& 'D:\Program Files\Epic Games\UE_5.7\Engine\Binaries\DotNET\UnrealBuildTool\UnrealBuildTool.exe' UnrealEditor Win64 Development -Project='<repo>\TCF_Sample.uproject' -WaitMutex
```

## 已知范围边界

- 未修改战斗数值。
- 未修改现有二进制 Blueprint 战斗图。
- 未实现 UI。
- 未调用 LLM。
- 未实现诊断建议层。
- MVP02 应在 MVP01 验收通过后，基于事件流和 summary 继续实现。
