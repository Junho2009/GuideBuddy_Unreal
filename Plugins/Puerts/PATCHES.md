# PATCHES.md

本文件记录本仓库对 vendored `Puerts` 插件的本地偏离，目的是让人类与 AI 在排查问题、升级上游、准备 `vendor(puerts)` 提交日志时，可以先用一份文档快速回答下面几个问题：

- 当前项目里的 `Puerts` 不是上游原样的地方有哪些
- 这些改动分别是为了解决什么具体问题
- 哪些是行为 / 构建补丁，哪些只是文档或打包层面的本地定制
- 升级上游时应该优先回看哪些历史改动

## 编写规则

- 新增本地 patch 时，必须同时更新“当前携带的本地修改一览”和“详细记录”，不要把新增说明单独堆在文档最前面。
- 文档说明以中文为主；源码路径、类名、函数名、配置键、命令行参数等保持英文原样，方便和代码、日志逐项对照。
- 只有当前工作树里仍然保留、或历史上确实落地过的补丁才写入正式记录；纯试验且已回滚的改动不单独立项。

## 上游基线

- 上游项目：`Puerts`
- 本仓库导入来源：上游 tag `Unreal_v1.0.9`
- 本地导入提交：`1868e86c19d87c958168325120effa85aa88f71d`
- 版本识别注意：`Puerts.uplugin` 当前仍声明 `VersionName` / `FriendlyVersion` 为 `1.0.5`。核对当前 vendored 基线时，不能只看 `.uplugin`，应同时参考上游 tag `Unreal_v1.0.9` 和本地导入提交 `1868e86...`。
- 记录范围说明：这里只记录导入上游之后仍然影响当前仓库的本地偏离。单纯同步上游源码，不在这里逐项展开。

## 当前携带的本地修改一览

| ID | 状态 | 类别 | 本地参考 | 主要文件 | 当前应如何理解 |
| --- | --- | --- | --- | --- | --- |
| P-001 | carried | packaging | `30791d6bcc68da1170f454e3a3ddc6772a0e935a` | `ThirdParty/Library/ffi/...` | 把 Puerts 需要的 `ffi` 预编译库从“外部准备”改成“随仓库显式管理” |
| P-002 | carried | build / engine-compat | `04a2e9cb5eb7732d3f24997d08d44c6026f90d53` | `Source/CSharpParamDefaultValueMetas/...` `Source/JsEnv/...` | 修复 UE 5.7 下的 Puerts 构建阻塞点 |
| P-003 | carried | runtime selection | `a15665985ccccf3f0d3f75854b6eb82224a9343e` | `Source/JsEnv/JsEnv.Build.cs` | 把 vendored Puerts 的默认 JS 后端切到 Node.js |
| P-004 | carried | build / toolchain-compat | `0a2a8613ddadbe7944e910097e8376eeaff70ef6` | `Source/CSharpParamDefaultValueMetas/CSharpParamDefaultValueMetas.ubtplugin.csproj` | 修复“生成 Visual Studio 项目文件”阶段的 UBT `.csproj` 解析失败 |
| P-005 | carried | docs | `2bf63bbc2e90fbc65f8ba961c0ad5ff2432f730a` | `doc/...` | 把 Puerts 官方文档随插件入库，作为人类和 AI 的本地参考 |
| P-006 | carried | docs curation | `6a593667f12fb9c6e27695196d0b3f52230f35ba` | `doc/unreal/en/...` | 通过删除英文副本缩小检索范围、减少 AI 引用噪音 |
| P-007 | working tree | editor startup / validation-compat | `working tree (2026-04-15)` | `Source/PuertsEditor/Private/PuertsEditorModule.cpp` | 把启动期自动同步延后到 Asset Registry 加载完成后，避免 UE 5.7 启动 warning |
| P-008 | working tree | standalone startup / runtime-compat | `working tree (2026-04-19)` | `Source/Puerts/Private/PuertsModule.cpp` | 为 `UnrealEditor -game` 延后 AutoMode 启动，避免 editor-hosted standalone 在首个游戏世界起来前过早启用 Puerts |
| P-009 | working tree | standalone editor-watch suppression | `working tree (2026-04-19)` | `Source/PuertsEditor/Private/PuertsEditorModule.cpp` | 在 `UnrealEditor -game` 下禁用编辑器侧 watch / `CodeAnalyze`，避免运行时触发 TypeScript Blueprint reinstance 噪音 |
| P-010 | working tree | latent default-value sanitation | `working tree (2026-04-20)` | `Source/JsEnv/Private/FunctionTranslator.cpp` `Source/ParamDefaultValueMetas/Private/ParamDefaultValueMetasModule.cpp` | 过滤 `FLatentActionInfo` 的坏默认值元数据，消除 `ImportText (LatentInfo)` 噪音 |

## 详细记录

### P-001 将 `ffi` 预编译库纳入版本管理

- 提交原意：`静态/动态库纳入版本管理。`
- 本地参考：`30791d6bcc68da1170f454e3a3ddc6772a0e935a`
- 影响文件：
  - `ThirdParty/Library/ffi/Android/arm64-v8a/libffi.a`
  - `ThirdParty/Library/ffi/Android/armeabi-v7a/libffi.a`
  - `ThirdParty/Library/ffi/Win64/ffi.lib`
  - `ThirdParty/Library/ffi/iOS/libffi.a`
  - `ThirdParty/Library/ffi/macOS/libffi.a`
- 变更缘由：
  - 这次改动的重点不是修改 Puerts 行为，而是把原本需要额外准备的库文件转成仓库内显式管理的资产。
  - 只要这些文件缺失，工作区在进入项目业务代码之前就已经是不完整的插件构建环境。
- 当前补丁做了什么：
  - 把 Puerts 所需的 `ffi` 预编译产物直接放回插件目录，并随仓库一起维护。
- 为什么必须改在插件目录里：
  - 依赖搜索路径由 Puerts 的构建规则决定，不是项目业务代码可以重新指定的常规扩展点。
  - 如果继续把这些库当成“机器外部前置条件”，就会重新引入“新机器缺库”或“干净检出后不可复现”的问题。
- 当前应如何理解：
  - 这是 vendoring / packaging 层面的本地定制，不改变 Puerts 逻辑行为，但它决定了当前仓库是否能在干净环境中完整复现构建链。

### P-002 UE 5.7 构建兼容补丁

- 提交原意：`fix: 修复 UE 5.7 下的 UnrealAIPractice 项目构建`
- 本地参考：`04a2e9cb5eb7732d3f24997d08d44c6026f90d53`
- 影响文件：
  - `Source/CSharpParamDefaultValueMetas/CSharpParamDefaultValueMetas.ubtplugin.csproj`
  - `Source/JsEnv/Private/Gen/FLinearColor_Wrap.cpp`
  - `Source/JsEnv/Private/JSGeneratedClass.cpp`
- 变更缘由：
  - `CSharpParamDefaultValueMetas` 在 UE 5.7 / `.NET 8` 组合下会被 UBT 跳过，导致 `InitParamDefaultMetas.inl` 没有生成。
  - `FLinearColor::Quantize` 的 API 变化，以及 `UField::Next` 从裸指针转成 `TObjectPtr<UField>`，又带来了额外的编译错误。
- 当前补丁做了什么：
  - 为 `.ubtplugin.csproj` 补充 UE 5.6 / 5.7 与 `.NET 8` 的兼容条件。
  - 把 `FLinearColor_Wrap.cpp` 里的绑定适配到 UE 5.7 仍可用的 `QuantizeFloor` / `QuantizeRound`。
  - 在 `JSGeneratedClass.cpp` 中补上 `TObjectPtr<UField>` 的显式转换。
- 为什么必须改插件源码：
  - 这些失败点都发生在 Puerts 自己的构建单元和包装代码里，项目层的 Blueprint、TypeScript 或 `.ini` 配置还没来得及接管流程。
- 当前应如何理解：
  - 这是当前项目基于 `Unreal_v1.0.9` 的第一层 UE 5.7 构建兼容补丁，解决的是“Puerts 能不能顺利编过”的问题。

### P-003 默认启用 Node.js 后端

- 提交原意：`使用 nodejs。`
- 本地参考：`a15665985ccccf3f0d3f75854b6eb82224a9343e`
- 影响文件：
  - `Source/JsEnv/JsEnv.Build.cs`
- 变更缘由：
  - 当前项目不打算沿用上游默认运行时选择，而是明确把 vendored Puerts 的默认 JS 后端固定为 Node.js。
  - 这里被修改的 `UseNodejs` 是 `JsEnv.Build.cs` 内部的私有构建开关，不是项目层的常规配置项。
- 当前补丁做了什么：
  - 把 `UseNodejs` 从 `false` 改为 `true`，让 Node.js 成为当前仓库里 Puerts 的默认构建选择。
- 为什么必须改插件源码：
  - 这个开关没有暴露给项目 `.Target.cs`、常规 `.ini` 配置或业务层调用代码。
- 当前应如何理解：
  - 这不是临时调试修改，而是把“本项目使用 Node.js 后端”固化成 vendored 插件默认值的本地策略。

### P-004 UBT `.csproj` 解析兼容补丁

- 提交原意：`fix(Puerts): 修复 UE 5.7 下生成 sln 时 C# 项目解析失败`
- 本地参考：`0a2a8613ddadbe7944e910097e8376eeaff70ef6`
- 影响文件：
  - `Source/CSharpParamDefaultValueMetas/CSharpParamDefaultValueMetas.ubtplugin.csproj`
- 与前置补丁的关系：
  - 这是 `P-002` 的后续收口，而不是完全独立的问题。
- 变更缘由：
  - UE 5.7 下执行“生成 Visual Studio 项目文件”时，`EpicGames.Core.CsProjectInfo` 无法解析 `CSharpParamDefaultValueMetas.ubtplugin.csproj` 里的某些 MSBuild 函数表达式。
  - 问题在实际编译开始前就已经出现，直接卡在 `.sln` 生成阶段。
- 当前补丁做了什么：
  - 去掉 UBT 解析器不接受的字符串函数式条件。
  - 把 `.NET 8` 识别改写为 `Exists('$(EngineDir)\\Binaries\\ThirdParty\\DotNet\\8.0')` 这类更保守、但 UBT 能稳定解析的条件。
  - 把 `UE_5_5_OR_LATER` 的判断改成基于 `TargetFramework` 的等价逻辑。
- 为什么必须改插件源码：
  - 失败点就在 Puerts 自带的 `.ubtplugin.csproj` 文件里，项目层无法替换 UBT 对它的解析。
- 当前应如何理解：
  - `P-002` 解决“实际构建报错”，`P-004` 解决“连 `.sln` 都生不出来”。两者合起来才是 UE 5.7 下完整的 Puerts 工具链兼容层。

### P-005 在插件目录内补充 Puerts 官方文档

- 提交原意：`补充提交：Puerts 官方使用文档。这些用于提供给 AI 做引用参考。`
- 本地参考：`2bf63bbc2e90fbc65f8ba961c0ad5ff2432f730a`
- 影响文件：
  - `doc/faq.md`
  - `doc/pic/...`
  - `doc/unreal/zhcn/...`
  - 初始版本还包含 `doc/unreal/en/...`
- 变更缘由：
  - 重点不是顺手把文档拷进来，而是明确要把 Puerts 官方文档作为当前仓库里可直接引用的本地资料，尤其是供 AI 检索和引用。
- 当前补丁做了什么：
  - 把 Puerts 官方说明文档和配图一起纳入 `Plugins/Puerts/doc/`，使其随插件版本一并保存。
- 为什么放在插件根目录：
  - 这些文档描述的对象就是当前 vendored Puerts 版本，把它们与源码相邻保存，比散落到项目其他文档目录更容易做版本对照与引用。
- 当前应如何理解：
  - 这是文档层面的 vendoring 决策，不改变插件行为；它的价值在于为当前项目建立了一套与插件版本绑定的本地参考资料。

### P-006 只保留中文文档副本

- 提交原意：`为精简检索范围，只留下中文版本的说明文档。`
- 本地参考：`6a593667f12fb9c6e27695196d0b3f52230f35ba`
- 影响文件：
  - `doc/unreal/en/...`（删除）
- 变更缘由：
  - 核心目标不是节省磁盘空间，而是优化本仓库的人类与 AI 检索体验。
  - 中英文两套内容同时存在，会制造重复命中、增加全文搜索噪音，也会让 AI 更容易扫到重复来源。
- 当前补丁做了什么：
  - 删除英文版 Puerts 文档副本，仅保留中文版本。
- 为什么改在插件目录里：
  - 这是对 vendored 文档集合本身的裁剪；既然文档是和插件一起维护的，检索范围优化也应直接体现在插件自己的 `doc/` 目录里。
- 当前应如何理解：
  - 这是文档检索优化补丁，不影响构建和运行行为，但会直接影响仓库内搜索、AI 检索与引用时的噪音水平。

### P-007 延后 `CodeAnalyze` 启动时机，规避 UE 5.7 启动期 Blueprint validator warning

- 提交原意：暂无历史提交；这是 `working tree (2026-04-15)` 中的当前本地补丁
- 本地参考：`working tree (2026-04-15)`
- 影响文件：
  - `Source/PuertsEditor/Private/PuertsEditorModule.cpp`
- 变更缘由：
  - 这次问题不是旧提交遗留描述里已有的兼容项，而是本轮排查编辑器启动 warning 时新确认的时序冲突。
  - 在 UE 5.7 下，Puerts 编辑器模块会在 `FPuertsEditorModule::StartupModule()` 里过早启动 `CodeAnalyze`，从而在 Blueprint validators 尚未注册完成前就刷新、编译并保存 TypeScript Blueprint。
  - 直接表现为启动阶段出现 `UpdateValidators request made before RegisterBlueprintValidators`，并伴随 `TS_LoginBootstrap` 的校验 warning。
- 当前补丁做了什么：
  - 保留 `UTypeScriptBlueprint` 编译器注册时机，避免影响 TypeScript Blueprint 的正常编译入口。
  - 把 `JsEnv->Start("PuertsEditor/CodeAnalyze")` 和文件监听初始化延后到 Asset Registry `OnFilesLoaded` 之后执行。
  - 补充 delegate 清理与幂等保护，避免重复初始化或模块关闭时遗留回调。
- 为什么必须改插件源码：
  - 触发自动同步和提前刷新 Blueprint 的逻辑位于 Puerts 编辑器模块内部，项目侧无法安全地重排这段启动顺序。
- 当前应如何理解：
  - 这是当前项目对 UE 5.7 的编辑器启动时序兼容补丁，目标是在保留 Puerts 自动同步能力的前提下，消除启动期 Blueprint validator warning。

### P-008 为 standalone `-game` 延后 AutoMode 启动

- 提交原意：暂无历史提交；这是 `working tree (2026-04-19)` 中的当前本地补丁
- 本地参考：`working tree (2026-04-19)`
- 影响文件：
  - `Source/Puerts/Private/PuertsModule.cpp`
- 变更缘由：
  - `UnrealEditor -game` 这条 editor-hosted standalone 路径里，Puerts 的 AutoMode 原本会在首个游戏世界真正初始化前就执行 `Enable()`。
  - 在当前项目里，这会把 JS 运行时拉起得过早，表现为 standalone 进程在登录 UI 初始化前就崩溃，问题还没来得及落到业务层日志。
- 当前补丁做了什么：
  - 显式识别命令行中的 `-game`。
  - 在这条路径里不再立即 `Enable()`，而是延后到 `FWorldDelegates::OnPostWorldInitialization` 收到首个游戏世界初始化回调后再启用。
  - 同时在模块关闭时清理对应 delegate，避免重复注册或遗留回调。
- 为什么必须改插件源码：
  - AutoMode 的启动决策在 Puerts 模块内部完成，项目侧无法通过 Blueprint、TypeScript 或常规 `.ini` 配置安全地重排这段时序。
  - 如果只在业务层规避，Puerts 仍然会在更早的引擎阶段进入错误路径，无法从根上解决 standalone 提前崩溃。
- 当前应如何理解：
  - 这是针对 editor-hosted standalone 启动链路的运行时兼容补丁，不改变游戏逻辑，只修正 Puerts 的启用时机。
  - 后续如果升级 Puerts，或者项目改用新的 standalone 启动方案，这条补丁需要优先回看。

### P-009 在 standalone `-game` 下禁用编辑器侧 watch

- 提交原意：暂无历史提交；这是 `working tree (2026-04-19)` 中的当前本地补丁
- 本地参考：`working tree (2026-04-19)`
- 影响文件：
  - `Source/PuertsEditor/Private/PuertsEditorModule.cpp`
- 变更缘由：
  - `UnrealEditor -game` 虽然是在跑游戏，但进程里仍会带着编辑器模块。
  - 在当前 Puerts 路径下，`PuertsEditorModule` 会继续启动 `CodeAnalyze` 和源码监听，进而在运行时触发 TypeScript Blueprint reinstance，刷出大量 `REINST_*` 绑定 warning 和额外噪音。
- 当前补丁做了什么：
  - 把 `-game` 视为非编辑器自动同步路径。
  - 让 `PuertsEditorModule::StartupModule()` 在这条路径里不再启动 editor-only 的 `CodeAnalyze` / watch。
- 为什么必须改插件源码：
  - 这套 watch / code analysis 的初始化入口位于 Puerts 编辑器模块内部，项目侧没有等价且安全的外部开关可以只对 `UnrealEditor -game` 精准关停。
  - 如果不在插件里切断，业务层只能被动承受 reinstance 带来的 warning 与运行时干扰。
- 当前应如何理解：
  - 这是面向 standalone 运行稳定性和日志噪音控制的补丁，不改变游戏功能，只避免编辑器侧辅助逻辑误入运行时。
  - 只要上游还没有专门处理 editor-hosted standalone，这条补丁就值得保留。
### P-010 清理 `FLatentActionInfo` 坏默认值

- 提交原意：暂无历史提交；这是 `working tree (2026-04-20)` 中的当前本地补丁
- 本地参考：`working tree (2026-04-20)`
- 影响文件：
  - `Source/JsEnv/Private/FunctionTranslator.cpp`
  - `Source/ParamDefaultValueMetas/Private/ParamDefaultValueMetasModule.cpp`
- 变更缘由：
  - 当前 vendored Puerts 生成的 `InitParamDefaultMetas.inl` 会给多个 latent Blueprint 函数写入 `PF->Add(TEXT("LatentInfo"), TEXT("LatentInfo"));`
  - 运行时 `FunctionTranslator` 在导入默认参数时，会把这段字符串当作 `FLatentActionInfo` 结构体文本去执行 `ImportText`，于是编辑器启动、`UnrealEditor -game` 和自动验收日志里都会反复出现 `ImportText (LatentInfo): Missing opening parenthesis: LatentInfo`
- 当前补丁做了什么：
  - 在 `ParamDefaultValueMetasModule.cpp` 里停止为 `FLatentActionInfo` 生成默认值元数据
  - 在 `FunctionTranslator.cpp` 里增加兼容兜底：只要发现旧缓存里的 `LatentInfo` 默认值不是结构体字面量，就直接跳过导入，保留零初始化结果
- 为什么必须改插件源码：
  - 这个问题出在 Puerts 自己的参数默认值生成链路和运行时参数翻译链路里，项目侧无法通过 Blueprint、TypeScript 或 `.ini` 安全地修正
- 当前应如何理解：
  - 这是一个偏向 runtime / logging cleanliness 的兼容补丁，不改变业务逻辑，但会显著降低启动和验收日志里的误导性 warning

## 维护约定

- 新增本地 patch 时，优先补充本文档，再准备 `vendor(puerts)` 提交日志。
- 若未来上游版本已经吸收某条 patch，不要直接删除记录；优先把其状态改成 `merged upstream` 或 `dropped after upgrade`，并注明对应上游版本，保留历史可追溯性。
- 升级 Puerts 时，优先逐条核对 `P-001` 到 `P-010`：
  - 哪些仍然需要保留
  - 哪些已经被上游吸收
  - 哪些需要按新版本重新实现
