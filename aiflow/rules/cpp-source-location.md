# C++ 源码位置规则

查阅或修改 C++ 时，只使用 Unreal 规范源码目录：

- `Source/`
- `Plugins/*/Source/`

不要把临时工具目录、备份目录或生成产物当作实际源码。

MVP01 优先查阅：

- `Plugins/TempestCombatFramework/Source/`
- 项目 `Source/` 目录，若存在或需要新增

新增 GuideBuddy 遥测代码时，优先放在项目源码或独立轻量模块中；只有确有必要时才修改战斗框架插件源码。
