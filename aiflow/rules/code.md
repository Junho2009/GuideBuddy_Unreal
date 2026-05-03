# 代码规范

- 本项目新增运行时逻辑优先放在 Unreal 规范源码目录：`Source/` 或 `Plugins/*/Source/`。
- GuideBuddy 的遥测、诊断、数据导出与 AI 导玩闭环优先使用 Puerts + TypeScript 与结构化文本格式，便于审查、diff、自动化分析和后续工具处理。
- TypeScript 能完成的业务逻辑、事件 schema、字段映射、诊断规则和导玩策略，不要下沉到 C++。
- C++ 主要用于 Puerts 启动、delegate 桥接、暴露 TypeScript 无法直接访问的引擎接口，以及性能敏感或必须 native 的边界。
- Blueprint 主要用于既有资产承载、资产绑定、数值配置和视觉呈现；除非用户明确要求，不新增关键游戏逻辑到二进制 Blueprint 图中。
- C++ 文件与类型命名遵守 Unreal C++ 约定；TypeScript 文件与模块命名应贴近 GuideBuddy 功能域。
- **控制流**：`if` / `else`、循环体等代码块一律使用花括号，即使只有一行；语句与 `return` 单独成行，便于断点调试。
