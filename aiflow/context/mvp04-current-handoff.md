# MVP04 当前换机交接记录

最后更新：2026-05-05 23:55:13 +08:00

本文档记录当前开发现场，目的是方便在另一台电脑或新的 AI 会话中无缝继续。它补充 `aiflow/CONTEXT.md`、contracts evidence 和 result ledger；不替代正式验收记录。

## 当前 Git 状态

- 当前分支：`main`
- 上游：`origin/main`
- 最近提交：`5d1b280 feat(coaching): 接入战斗结束复盘闭环`
- 当前 MVP04 工作尚未提交。
- 如果通过 Git 切换电脑，必须先提交或打包包含 untracked files；否则新增的 MVP04 文件不会出现在另一台电脑上。

`git status --short` 当前应包含：

```text
 M Content/JavaScript/GuideBuddy/main.js
 M TypeScript/GuideBuddy/main.ts
 M aiflow/CONTEXT.md
 M aiflow/INDEX.md
 M aiflow/context/README.md
 M aiflow/contracts/README.md
 M aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/index.md
 M aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/raw/coaching.json
 M aiflow/contracts/evidence/MVP03_LLM_COACHING_LOOP/v0.1/run-001/runtime_request_verifier.json
 M aiflow/contracts/runs/MVP03_LLM_COACHING_LOOP.run-001.yaml
 M aiflow/specs/GAME_PHASES.md
 M aiflow/specs/MVP04_ADAPTIVE_DRILL_GENERATION.md
 M package.json
?? Content/JavaScript/GuideBuddy/drill.js
?? TypeScript/GuideBuddy/drill.ts
?? aiflow/context/mvp04-current-handoff.md
?? aiflow/contracts/briefs/MVP04_ADAPTIVE_DRILL_GENERATION.brief.yaml
?? aiflow/contracts/clarifications/MVP04_ADAPTIVE_DRILL_GENERATION.clarification.md
?? aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/
?? aiflow/contracts/ledgers/MVP04_ADAPTIVE_DRILL_GENERATION.result.md
?? aiflow/contracts/manifests/MVP04_ADAPTIVE_DRILL_GENERATION.manifest.yaml
?? aiflow/contracts/runs/MVP04_ADAPTIVE_DRILL_GENERATION.run-001.yaml
?? aiflow/contracts/taskpacks/MVP04_ADAPTIVE_DRILL_GENERATION.taskpack.yaml
?? aiflow/contracts/verifiers/MVP04_ADAPTIVE_DRILL_GENERATION.verifier.yaml
?? aiflow/contracts/verifiers/verify_mvp04_drill.js
```

注意：上面 4 个 MVP03 evidence/run 文件是运行 verifier 后的刷新痕迹；当前 `git diff --quiet -- <these files>` 显示无内容 diff，仅有 CRLF / index 状态提示。不要把它们误判为新的 MVP03 功能改动。

## 当前阶段状态

- Latest Accepted Baseline：`MVP04_ADAPTIVE_DRILL_GENERATION@v0.1`
- Accepted Run：`aiflow/contracts/runs/MVP04_ADAPTIVE_DRILL_GENERATION.run-001.yaml`
- Evidence Index：`aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/index.md`
- Result Ledger：`aiflow/contracts/ledgers/MVP04_ADAPTIVE_DRILL_GENERATION.result.md`
- 下一建议阶段：`MVP05_EVALUATION_AND_ITERATION`

`aiflow/CONTEXT.md`、`aiflow/specs/GAME_PHASES.md`、`aiflow/specs/MVP04_ADAPTIVE_DRILL_GENERATION.md` 和 `aiflow/contracts/README.md` 已同步到 MVP04 accepted 状态。

## 本轮已实现

### MVP04 合同层

新增：

- `aiflow/contracts/clarifications/MVP04_ADAPTIVE_DRILL_GENERATION.clarification.md`
- `aiflow/contracts/briefs/MVP04_ADAPTIVE_DRILL_GENERATION.brief.yaml`
- `aiflow/contracts/taskpacks/MVP04_ADAPTIVE_DRILL_GENERATION.taskpack.yaml`
- `aiflow/contracts/manifests/MVP04_ADAPTIVE_DRILL_GENERATION.manifest.yaml`
- `aiflow/contracts/verifiers/MVP04_ADAPTIVE_DRILL_GENERATION.verifier.yaml`

范围冻结为 MVP04 v0.1：

- 只支持 `single_enemy_execution_response`。
- 只从 `coaching.json` 读取 `practice_objective` 与 `drill_spec_candidate`。
- 生成正式 `drill_spec.json` 与 `drill_session.json`。
- 拒绝非白名单 template、非白名单参数、危险字段 / 字符串和 `insufficient_evidence` 输入。
- 不生成或修改 Blueprint、关卡资产、控制台命令或战斗数值。

### TypeScript / Runtime

新增：

- `TypeScript/GuideBuddy/drill.ts`
- `Content/JavaScript/GuideBuddy/drill.js`

主要入口：

- `buildDrillArtifacts(...)`
- `generateDrillForRunDirectory(...)`
- CLI：`node Content/JavaScript/GuideBuddy/drill.js [run-directory]`

更新：

- `TypeScript/GuideBuddy/main.ts`
- `Content/JavaScript/GuideBuddy/main.js`

运行时行为：

- 战斗结束后点击“复盘一下”仍会写出 `combat_events.jsonl`、`attempt_summary.json`、`diagnosis.json`、`coaching.json`。
- 如果 `coaching.json` 可生成训练场，运行时还会写出：
  - `guide_requests/request-001/drill_spec.json`
  - `guide_requests/request-001/drill_session.json`
- 如果证据不足或模板不支持，会保留 coaching 输出，并跳过 drill artifacts。

### npm 命令

`package.json` 已新增：

```powershell
npm.cmd run drill:mvp04
npm.cmd run verify:mvp04
```

## 验收结果

已通过：

```powershell
npm.cmd run verify:mvp04
```

覆盖：

- TypeScript build
- `drill_spec.json` schema
- `drill_session.json` schema
- source attempt / diagnosis / coaching / practice objective 追溯
- template whitelist
- parameter whitelist and safe ranges
- unsupported template rejection
- unknown parameter rejection
- unsafe field/string rejection
- insufficient evidence rejection
- runtime guide request 写出 drill artifacts

已通过回归：

```powershell
npm.cmd run verify:mvp03:runtime
```

已通过：

```powershell
git diff --check
```

该命令只出现正常 CRLF warning，退出码为 0。

## 关键输出样例

Accepted MVP04 raw evidence：

- `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/coaching.json`
- `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/drill_spec.json`
- `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/raw/drill_session.json`
- `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/v0.1/run-001/runtime_request_verifier.json`

Accepted drill：

- `primary_failure`: `posture_break_into_execution`
- `practice_objective_id`: `practice.posture_break_into_execution.avoid_execution_setup`
- `template_id`: `single_enemy_execution_response`
- `metric_ids`:
  - `terminal_execution_count`
  - `enemy_execution_after_player_death`
  - `defensive_input_before_execution_window`

## 换机恢复步骤

如果使用 Git：

1. 先在当前电脑创建提交或至少创建包含 untracked files 的补丁 / 压缩包。
2. 另一台电脑拉取或解压后，确认 `TypeScript/GuideBuddy/drill.ts` 和 `aiflow/contracts/evidence/MVP04_ADAPTIVE_DRILL_GENERATION/` 存在。
3. 如果没有 `node_modules/`，运行：

```powershell
npm.cmd install
```

4. 重新生成 TypeScript 编译产物：

```powershell
npm.cmd run build:guidebuddy
```

5. 跑 MVP04 验收：

```powershell
npm.cmd run verify:mvp04
```

6. 跑运行时回归：

```powershell
npm.cmd run verify:mvp03:runtime
```

7. 如果要启动 UE，请使用本机 UE 5.7 路径编译 `UnrealEditor` target。原机器曾使用：

```powershell
& 'D:\Program Files\Epic Games\UE_5.7\Engine\Binaries\DotNET\UnrealBuildTool\UnrealBuildTool.exe' UnrealEditor Win64 Development -Project='<repo>\TCF_Sample.uproject' -WaitMutex
```

## 忽略目录与不必搬运的内容

以下目录当前被 `.gitignore` 忽略，换机后通常重新生成或重新安装：

- `node_modules/`
- `Saved/`
- `Binaries/`
- `Intermediate/`
- `DerivedDataCache/`
- `Plugins/*/Binaries/`
- `Plugins/*/Intermediate/`
- `Plugins/Puerts/ThirdParty/nodejs_16/`

如果另一台机器缺少 Puerts 第三方 Node/V8 运行时，需要按 Puerts 插件要求重新补齐对应 ThirdParty 目录；否则 UE 侧 Puerts 启动可能失败。

## 下一步建议

进入 `MVP05_EVALUATION_AND_ITERATION`：

1. 编译 MVP05 contracts。
2. 读取 `drill_session.json` 和后续 telemetry。
3. 判断 `terminal_execution_count`、`enemy_execution_after_player_death`、`defensive_input_before_execution_window` 是否相对原始失败窗口改善。
4. 输出 `evaluation.json` 或等价结果，并把结果接回下一轮 coaching。

短期不建议马上扩展多模板。先让 MVP05 能证明当前 `single_enemy_execution_response` 练习是否真的改善玩家表现。
