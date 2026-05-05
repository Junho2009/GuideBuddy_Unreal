"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCoaching = exports.generateCoachingForRunDirectory = void 0;
const SCHEMA_VERSION = "guidebuddy.coaching.v1";
const DRILL_SPEC_SCHEMA_VERSION = "guidebuddy.drill_spec_candidate.v1";
const TEMPLATE_WHITELIST_VERSION = "guidebuddy.drill_templates.v0.1";
const DEFAULT_PLAYER_LEVEL = "novice";
let fileSystemModule;
let pathModule;
const ALLOWED_TEMPLATE_IDS = [
    "single_enemy_execution_response",
    "single_enemy_overcommit_punish",
    "single_enemy_dodge_timing",
    "single_enemy_last_hit_review",
    "telemetry_capture_repeat"
];
const ALLOWED_PARAMETER_NAMES = [
    "target_error",
    "focus",
    "player_level",
    "enemy_count",
    "repetition_goal",
    "success_window_seconds",
    "max_consecutive_failures",
    "metric_ids"
];
function generateCoachingForRunDirectory(runDirectoryInput, outputPathInput, options = {}) {
    const fs = getFs();
    const path = getPath();
    const runDirectory = path.resolve(runDirectoryInput);
    const summaryPath = path.join(runDirectory, "attempt_summary.json");
    const diagnosisPath = path.join(runDirectory, "diagnosis.json");
    const outputPath = outputPathInput ? path.resolve(outputPathInput) : path.join(runDirectory, "coaching.json");
    if (!fs.existsSync(runDirectory) || !fs.statSync(runDirectory).isDirectory()) {
        throw new Error(`Run directory does not exist: ${runDirectory}`);
    }
    const summary = readJson(summaryPath);
    const diagnosis = readJson(diagnosisPath);
    const coaching = buildCoaching(runDirectory, summaryPath, diagnosisPath, summary, diagnosis, options);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(coaching, null, 2)}\n`, "utf8");
    return coaching;
}
exports.generateCoachingForRunDirectory = generateCoachingForRunDirectory;
function buildCoaching(runDirectory, summaryPath, diagnosisPath, summary, diagnosis, options = {}) {
    var _a, _b;
    const generatedAt = options.generatedAt || new Date().toISOString();
    const playerLevel = normalizePlayerLevel(options.playerLevel);
    const finalDiagnosis = recordField(diagnosis, "final");
    const deterministicDiagnosis = recordField(diagnosis, "deterministic");
    const seed = recordField(finalDiagnosis, "practice_objective_seed");
    const primaryFailure = String(finalDiagnosis.primary_failure || deterministicDiagnosis.primary_failure || "insufficient_evidence");
    const confidence = (_b = (_a = numberField(finalDiagnosis, "confidence")) !== null && _a !== void 0 ? _a : numberField(deterministicDiagnosis, "confidence")) !== null && _b !== void 0 ? _b : 0;
    const evidenceSeqs = numberArrayField(seed, "evidence_event_seqs")
        .concat(numberArrayField(deterministicDiagnosis, "evidence_event_seqs"))
        .filter((value, index, values) => values.indexOf(value) === index);
    const signals = signalSummaries(arrayField(deterministicDiagnosis, "signals"));
    const recipe = recipeFor(primaryFailure, confidence, playerLevel, signals, evidenceSeqs);
    const inputSummary = buildLlmInputSummary(summary, diagnosis, primaryFailure, confidence, seed, signals, evidenceSeqs);
    const practiceObjective = buildPracticeObjective(primaryFailure, playerLevel, seed, recipe, evidenceSeqs);
    const drillSpecCandidate = buildDrillSpecCandidate(primaryFailure, playerLevel, practiceObjective, seed);
    return {
        schema_version: SCHEMA_VERSION,
        run_id: String(diagnosis.run_id || summary.run_id || ""),
        generated_at: generatedAt,
        source_files: {
            run_directory: normalizePath(runDirectory),
            attempt_summary_json: normalizePath(summaryPath),
            diagnosis_json: normalizePath(diagnosisPath)
        },
        provider: {
            kind: options.provider || "local_rule_template",
            source_kind: options.sourceKind || "offline",
            llm_api_called: false,
            replaceable_with_llm: true,
            status: "mock_provider"
        },
        player_level_assumption: {
            level: playerLevel,
            reason: "No long-term player model is available in MVP03, so the generator defaults to one explicit expression level."
        },
        llm_input_summary: inputSummary,
        review_card: {
            language: "zh-CN",
            card_type: "post_attempt_single_issue",
            title: recipe.title,
            diagnosis_sentence: recipe.diagnosisSentence,
            evidence_line: recipe.evidenceLine,
            next_action: recipe.nextAction,
            success_condition: recipe.successCondition,
            confidence: {
                value: confidence,
                label: confidenceLabelZh(confidence)
            },
            prompt_strength: promptStrength(confidence),
            player_level: playerLevel
        },
        practice_objective: practiceObjective,
        drill_spec_candidate: drillSpecCandidate,
        final: {
            status: primaryFailure === "insufficient_evidence" ? "insufficient_evidence" : "coaching_ready",
            primary_failure: primaryFailure,
            main_issue_count: primaryFailure === "insufficient_evidence" ? 0 : 1,
            advice_focus: recipe.focus,
            practice_objective_id: String(practiceObjective.id || ""),
            drill_template_id: String(drillSpecCandidate.template_id || "")
        }
    };
}
exports.buildCoaching = buildCoaching;
function buildLlmInputSummary(summary, diagnosis, primaryFailure, confidence, seed, signals, evidenceSeqs) {
    var _a;
    return {
        summary_schema_version: "guidebuddy.llm_input_summary.v1",
        run_id: String(diagnosis.run_id || summary.run_id || ""),
        map: String(summary.map || ""),
        end_reason: String(summary.end_reason || ""),
        duration_seconds: (_a = numberField(summary, "duration_seconds")) !== null && _a !== void 0 ? _a : null,
        diagnosis: {
            primary_failure: primaryFailure,
            category: String(recordField(diagnosis, "deterministic").category || ""),
            confidence,
            deterministic_summary: String(recordField(diagnosis, "final").summary || "")
        },
        practice_objective_seed: {
            focus: String(seed.focus || ""),
            target_error: String(seed.target_error || primaryFailure),
            candidate_drill_focuses: stringArrayField(seed, "candidate_drill_focuses").slice(0, 4),
            measurable_metrics: arrayField(seed, "measurable_metrics").slice(0, 4)
        },
        evidence: {
            event_seqs: evidenceSeqs.slice(0, 8),
            signals: signals.slice(0, 6)
        },
        constraints: {
            one_main_issue_only: true,
            no_raw_event_log: true,
            no_unreal_scene_creation: true,
            drill_spec_must_use_whitelist: true
        }
    };
}
function buildPracticeObjective(primaryFailure, playerLevel, seed, recipe, evidenceSeqs) {
    const seedMetrics = arrayField(seed, "measurable_metrics");
    const metricIds = seedMetrics
        .map((metric) => String(recordField(metric, "").id || ""))
        .filter((id) => id.length > 0);
    const metrics = metricIds.length > 0 ? seedMetrics : defaultMetrics(primaryFailure);
    return {
        schema_version: "guidebuddy.practice_objective.v1",
        id: `practice.${sanitizeId(primaryFailure)}.${sanitizeId(recipe.focus)}`,
        target_error: String(seed.target_error || primaryFailure),
        focus: recipe.focus,
        player_level: playerLevel,
        observable_action: recipe.observableAction,
        coaching_instruction: recipe.nextAction,
        evidence_event_seqs: evidenceSeqs.slice(0, 8),
        measurable_metrics: metrics,
        success_criteria: recipe.successCriteria
    };
}
function buildDrillSpecCandidate(primaryFailure, playerLevel, practiceObjective, seed) {
    const templateId = templateFor(primaryFailure);
    const metricIds = arrayField(practiceObjective, "measurable_metrics")
        .map((metric) => String(recordField(metric, "").id || ""))
        .filter((id) => id.length > 0)
        .slice(0, 4);
    const parameters = {
        target_error: String(seed.target_error || primaryFailure),
        focus: String(practiceObjective.focus || ""),
        player_level: playerLevel,
        enemy_count: 1,
        repetition_goal: primaryFailure === "insufficient_evidence" ? 1 : 5,
        success_window_seconds: primaryFailure === "missed_or_late_dodge" ? 0.8 : 1.5,
        max_consecutive_failures: 3,
        metric_ids: metricIds
    };
    return {
        schema_version: DRILL_SPEC_SCHEMA_VERSION,
        status: "candidate_requires_mvp04_validation",
        template_whitelist_version: TEMPLATE_WHITELIST_VERSION,
        template_id: templateId,
        objective_ref: String(practiceObjective.id || ""),
        parameters,
        validation: {
            template_whitelist_passed: ALLOWED_TEMPLATE_IDS.includes(templateId),
            parameter_whitelist_passed: Object.keys(parameters).every((name) => ALLOWED_PARAMETER_NAMES.includes(name)),
            allowed_template_ids: ALLOWED_TEMPLATE_IDS,
            allowed_parameter_names: ALLOWED_PARAMETER_NAMES
        },
        safety: {
            llm_may_not_create_unreal_assets: true,
            llm_may_not_execute_console_commands: true,
            requires_mvp04_validation: true
        }
    };
}
function recipeFor(primaryFailure, confidence, playerLevel, signals, evidenceSeqs) {
    const evidenceLine = buildEvidenceLine(primaryFailure, confidence, signals, evidenceSeqs);
    const levelHint = playerLevel === "novice"
        ? "先不要贪输出"
        : playerLevel === "intermediate"
            ? "把反应窗口留给防御"
            : "优先管理风险收益";
    if (primaryFailure === "posture_break_into_execution") {
        return {
            focus: "avoid_execution_setup",
            title: "先避开处决窗口",
            diagnosisSentence: "这次主要问题是架势崩溃后被处决。",
            evidenceLine,
            nextAction: `下一局只练一件事：看到敌人进入处决或特殊动作前兆时，${levelHint}，立刻停手后撤或防御。`,
            observableAction: "Stop attacking and create a defensive input or distance before the execution window.",
            successCondition: "失败窗口内不再出现处决信号，或处决前 1.5 秒内出现防御/闪避输入。",
            successCriteria: [
                { metric_id: "terminal_execution_count", operator: "<=", threshold: 0 },
                { metric_id: "defensive_input_before_execution_window", operator: "==", threshold: true }
            ]
        };
    }
    if (primaryFailure === "overcommit_into_enemy_attack") {
        return {
            focus: "shorten_attack_commitment",
            title: "少打一刀，留出防御",
            diagnosisSentence: "这次主要问题是攻击承诺太深，被敌人起手惩罚。",
            evidenceLine,
            nextAction: `下一局只练一件事：每次攻击后强制停一下，${levelHint}，看清敌人起手再决定继续进攻。`,
            observableAction: "Pause after one attack and avoid a second attack during nearby enemy windup.",
            successCondition: "敌人命中前 1 秒内不再出现连续攻击输入。",
            successCriteria: [
                { metric_id: "player_attack_within_1s_before_enemy_hit", operator: "<=", threshold: 0 },
                { metric_id: "defensive_input_after_enemy_windup", operator: ">=", threshold: 1 }
            ]
        };
    }
    if (primaryFailure === "missed_or_late_dodge") {
        return {
            focus: "dodge_timing",
            title: "把闪避提前到敌人起手",
            diagnosisSentence: "这次主要问题是敌人攻击窗口附近没有及时闪避。",
            evidenceLine,
            nextAction: `下一局只练一件事：眼睛盯敌人起手，看到攻击前兆就闪避，${levelHint}。`,
            observableAction: "Dodge within the first reaction window after enemy windup evidence.",
            successCondition: "敌人攻击窗口内出现闪避输入，且闪避延迟低于 0.8 秒。",
            successCriteria: [
                { metric_id: "dodge_input_latency_after_enemy_attack", operator: "<=", threshold: 0.8 },
                { metric_id: "enemy_attack_windows_without_dodge", operator: "<=", threshold: 0 }
            ]
        };
    }
    if (primaryFailure === "fatal_attack_attribution") {
        return {
            focus: "identify_fatal_attack_source",
            title: "先认出最后一次伤害来源",
            diagnosisSentence: "这次能归因到最后伤害来源，但动作窗口证据还不够细。",
            evidenceLine,
            nextAction: "下一局只练一件事：复盘最后一次受击前敌人的动作，优先确认是哪类攻击导致失败。",
            observableAction: "Name the attack source and avoid the same last-damage window in the next attempt.",
            successCondition: "下一次请求中能保留同类攻击来源，并减少最后伤害窗口内的受击。",
            successCriteria: [
                { metric_id: "diagnosable_terminal_failures", operator: ">=", threshold: 1 },
                { metric_id: "last_damage_window_hits_taken", operator: "<=", threshold: 0 }
            ]
        };
    }
    return {
        focus: "collect_more_failure_evidence",
        title: "先补足可诊断证据",
        diagnosisSentence: "这次证据不足，暂时不强行给出战斗归因。",
        evidenceLine,
        nextAction: "下一局先正常打一轮并保留死亡、受击、攻击和闪避事件，再请求指导。",
        observableAction: "Complete one diagnosable combat attempt with damage or death evidence.",
        successCondition: "下一次 `diagnosis.json` 不再是 `insufficient_evidence`。",
        successCriteria: [
            { metric_id: "diagnosable_failure_windows", operator: ">=", threshold: 1 }
        ]
    };
}
function buildEvidenceLine(primaryFailure, confidence, signals, evidenceSeqs) {
    if (signals.length > 0) {
        const signal = signals[0];
        const seq = String(signal.event_seq || evidenceSeqs[0] || "?");
        const tag = String(signal.tag || signal.event_type || primaryFailure);
        const role = String(signal.actor_role || "unknown");
        return `证据：关键事件 #${seq}（${tag}，${role}）支持该判断，诊断置信度 ${Math.round(confidence * 100)}%。`;
    }
    if (evidenceSeqs.length > 0) {
        return `证据：诊断层保留了事件 #${evidenceSeqs.slice(0, 4).join(", #")} 作为窗口证据，置信度 ${Math.round(confidence * 100)}%。`;
    }
    return "证据：当前没有足够的死亡、受击或敌人动作窗口，暂不强行归因。";
}
function signalSummaries(rawSignals) {
    return rawSignals
        .map((value) => recordField(value, ""))
        .filter((value) => Object.keys(value).length > 0)
        .map((signal) => {
        var _a, _b, _c;
        return ({
            id: String(signal.id || ""),
            event_seq: (_a = numberField(signal, "event_seq")) !== null && _a !== void 0 ? _a : null,
            event_type: String(signal.event_type || ""),
            time_seconds: (_b = numberField(signal, "time_seconds")) !== null && _b !== void 0 ? _b : null,
            tag: String(signal.tag || ""),
            actor_role: String(signal.actor_role || ""),
            confidence: (_c = numberField(signal, "confidence")) !== null && _c !== void 0 ? _c : null
        });
    });
}
function templateFor(primaryFailure) {
    if (primaryFailure === "posture_break_into_execution") {
        return "single_enemy_execution_response";
    }
    if (primaryFailure === "overcommit_into_enemy_attack") {
        return "single_enemy_overcommit_punish";
    }
    if (primaryFailure === "missed_or_late_dodge") {
        return "single_enemy_dodge_timing";
    }
    if (primaryFailure === "fatal_attack_attribution") {
        return "single_enemy_last_hit_review";
    }
    return "telemetry_capture_repeat";
}
function defaultMetrics(primaryFailure) {
    if (primaryFailure === "posture_break_into_execution") {
        return [
            { id: "terminal_execution_count", unit: "count", direction: "lower_is_better" },
            { id: "defensive_input_before_execution_window", unit: "boolean", direction: "higher_is_better" }
        ];
    }
    if (primaryFailure === "overcommit_into_enemy_attack") {
        return [
            { id: "player_attack_within_1s_before_enemy_hit", unit: "count", direction: "lower_is_better" }
        ];
    }
    if (primaryFailure === "missed_or_late_dodge") {
        return [
            { id: "dodge_input_latency_after_enemy_attack", unit: "seconds", direction: "lower_is_better" }
        ];
    }
    return [
        { id: "diagnosable_failure_windows", unit: "count", direction: "higher_is_better" }
    ];
}
function normalizePlayerLevel(value) {
    if (value === "intermediate" || value === "advanced" || value === "novice") {
        return value;
    }
    return DEFAULT_PLAYER_LEVEL;
}
function confidenceLabelZh(confidence) {
    if (confidence >= 0.8) {
        return "高";
    }
    if (confidence >= 0.6) {
        return "中";
    }
    if (confidence > 0) {
        return "低";
    }
    return "无";
}
function promptStrength(confidence) {
    if (confidence >= 0.8) {
        return "direct";
    }
    if (confidence >= 0.6) {
        return "suggestive";
    }
    return "cautious";
}
function recordField(value, fieldName) {
    const target = fieldName ? (isRecord(value) ? value[fieldName] : undefined) : value;
    return isRecord(target) ? target : {};
}
function arrayField(value, fieldName) {
    const target = isRecord(value) ? value[fieldName] : undefined;
    return Array.isArray(target) ? target : [];
}
function stringArrayField(value, fieldName) {
    return arrayField(value, fieldName)
        .map((item) => String(item || ""))
        .filter((item) => item.length > 0);
}
function numberArrayField(value, fieldName) {
    return arrayField(value, fieldName)
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
}
function numberField(value, fieldName) {
    if (!isRecord(value)) {
        return undefined;
    }
    const raw = value[fieldName];
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
    }
    if (typeof raw === "string" && raw.trim().length > 0) {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readJson(filePath) {
    const fs = getFs();
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    catch (error) {
        throw new Error(`Invalid JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function normalizePath(filePath) {
    return filePath.replace(/\\/g, "/");
}
function sanitizeId(value) {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    return sanitized || "unknown";
}
function findLatestTelemetryRunDirectory() {
    const fs = getFs();
    const path = getPath();
    const telemetryRoot = path.join(process.cwd(), "Saved", "GuideBuddy", "Telemetry");
    if (!fs.existsSync(telemetryRoot)) {
        throw new Error(`Telemetry root does not exist: ${telemetryRoot}`);
    }
    const candidates = fs.readdirSync(telemetryRoot)
        .map((name) => path.join(telemetryRoot, name))
        .filter((candidate) => fs.statSync(candidate).isDirectory())
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    if (candidates.length === 0) {
        throw new Error(`No telemetry run directories found under: ${telemetryRoot}`);
    }
    return candidates[0];
}
function printHelp() {
    console.log(`Usage:
  node Content/JavaScript/GuideBuddy/coaching.js [run-directory] [--output path] [--player-level novice|intermediate|advanced]

Default source:
  Saved/GuideBuddy/Telemetry/<latest-run>

Output:
  <run-directory>/coaching.json`);
}
function runCli(argv) {
    const path = getPath();
    let runDirectory = "";
    let outputPath = "";
    let playerLevel = DEFAULT_PLAYER_LEVEL;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") {
            printHelp();
            return;
        }
        if (arg === "--output") {
            outputPath = argv[index + 1] || "";
            index += 1;
            if (!outputPath) {
                throw new Error("--output requires a path.");
            }
            continue;
        }
        if (arg === "--player-level") {
            playerLevel = normalizePlayerLevel(argv[index + 1] || "");
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        }
        if (runDirectory) {
            throw new Error(`Only one run directory may be provided. Unexpected argument: ${arg}`);
        }
        runDirectory = arg;
    }
    const sourceDirectory = runDirectory ? path.resolve(runDirectory) : findLatestTelemetryRunDirectory();
    const coaching = generateCoachingForRunDirectory(sourceDirectory, outputPath || undefined, {
        playerLevel,
        provider: "local_rule_template",
        sourceKind: "cli"
    });
    console.log(JSON.stringify({
        ok: true,
        run_directory: normalizePath(sourceDirectory),
        run_id: coaching.run_id,
        output_path: normalizePath(outputPath || path.join(sourceDirectory, "coaching.json")),
        primary_failure: String(coaching.final.primary_failure || ""),
        drill_template_id: String(coaching.final.drill_template_id || "")
    }, null, 2));
}
function getFs() {
    if (!fileSystemModule) {
        fileSystemModule = require("fs");
    }
    return fileSystemModule;
}
function getPath() {
    if (!pathModule) {
        pathModule = require("path");
    }
    return pathModule;
}
if (typeof require !== "undefined" && require.main === module) {
    try {
        runCli(process.argv.slice(2));
    }
    catch (error) {
        console.error(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        }, null, 2));
        process.exit(1);
    }
}
