# Puerts + TypeScript 规则

## 默认目标

GuideBuddy MVP 后续新增代码逻辑应尽可能写在 Puerts 驱动的 TypeScript 层，而不是新增二进制 Blueprint 图或把所有逻辑写进 C++。

这样做的原因：

- AI 更容易读取、修改和分析 TypeScript 文本。
- TypeScript 迭代速度快，避免频繁 Unreal C++ 编译和链接。
- 遥测、诊断、导玩策略和数据导出都更适合用可 diff 的结构化文本代码表达。

## 默认分层

- TypeScript：优先承载 GuideBuddy 的业务逻辑、遥测事件组装、诊断前处理、JSON / JSONL 输出、导玩编排和实验开关。
- C++：只在 TypeScript 无法稳定触达时使用，例如 Puerts 启动、delegate 桥接、暴露缺失的 UFUNCTION / USTRUCT、性能敏感路径或引擎线程边界。
- Blueprint：保留既有战斗资产、资产绑定、数值配置和视觉呈现；不把新增关键逻辑写入 Blueprint 图。

## 推荐位置

- 项目 TypeScript 优先放在 `Content/JavaScript/GuideBuddy/` 下，除非后续建立了更明确的项目约定。
- 不要修改 Puerts 自带运行时代码，除非任务明确是修 Puerts 本身。
- 避免把 GuideBuddy 业务逻辑放进 `Plugins/Puerts/Content/JavaScript/`、`Content/JavaScript/puerts/`、`Content/JavaScript/PuertsEditor/` 等 vendor / 生成目录。

## 实现要求

- 新增 TS 逻辑要保持模块边界清楚，输出结构稳定，便于 MVP02 / MVP03 直接读取。
- 能用 TS 表达的诊断规则、字段映射、事件 schema 和导玩策略，不要下沉到 C++。
- 若必须新增 C++，优先写薄桥接层，并在注释或文档中说明为什么 TypeScript 不够。
- 任何由 C++ 暴露给 TS 的接口，应尽量是语义接口，而不是把底层噪音原样转发。
- 文件输出优先使用 JSON / JSONL 等结构化格式。

## 验证

- 涉及 TS 的改动，至少验证脚本能被 Puerts 加载或被当前项目约定的 TS 工具链检查。
- 涉及 C++ 桥接的改动，才运行必要的 Unreal 编译或编辑器验证。
