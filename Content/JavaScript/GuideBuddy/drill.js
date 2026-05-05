"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDrillArtifacts = exports.generateDrillForCoachingFile = exports.generateDrillForRunDirectory = void 0;
const DRILL_SPEC_SCHEMA_VERSION = "guidebuddy.drill_spec.v1";
const DRILL_SESSION_SCHEMA_VERSION = "guidebuddy.drill_session.v1";
const ACCEPTED_CANDIDATE_SCHEMA_VERSION = "guidebuddy.drill_spec_candidate.v1";
const VALIDATOR_VERSION = "guidebuddy.drill_validator.v0.1";
const TEMPLATE_WHITELIST_VERSION = "guidebuddy.drill_templates.v0.1";
const SUPPORTED_TEMPLATE_IDS = ["single_enemy_execution_response"];
const ALLOWED_CANDIDATE_FIELDS = [
    "schema_version",
    "status",
    "template_whitelist_version",
    "template_id",
    "objective_ref",
    "parameters",
    "validation",
    "safety"
];
const ALLOWED_VALIDATION_FIELDS = [
    "template_whitelist_passed",
    "parameter_whitelist_passed",
    "allowed_template_ids",
    "allowed_parameter_names"
];
const ALLOWED_SAFETY_FIELDS = [
    "llm_may_not_create_unreal_assets",
    "llm_may_not_execute_console_commands",
    "requires_mvp04_validation"
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
const DANGEROUS_FIELD_NAMES = [
    "asset_path",
    "blueprint",
    "blueprint_path",
    "class_name",
    "console_command",
    "level_path",
    "script",
    "spawn_actor_class",
    "unreal_asset"
];
const DANGEROUS_VALUE_PATTERN = /(ExecuteConsoleCommand|Blueprint|\/Game\/|\.uasset|SpawnActor|powershell|cmd\.exe|require\s*\(|eval\s*\(|https?:\/\/)/i;
let fileSystemModule;
let pathModule;
function generateDrillForRunDirectory(runDirectoryInput, outputDirectoryInput, options = {}) {
    const path = getPath();
    const runDirectory = path.resolve(runDirectoryInput);
    const coachingPath = path.join(runDirectory, "coaching.json");
    const outputDirectory = outputDirectoryInput ? path.resolve(outputDirectoryInput) : runDirectory;
    return generateDrillForCoachingFile(coachingPath, outputDirectory, options);
}
exports.generateDrillForRunDirectory = generateDrillForRunDirectory;
function generateDrillForCoachingFile(coachingPathInput, outputDirectoryInput, options = {}) {
    const fs = getFs();
    const path = getPath();
    const coachingPath = path.resolve(coachingPathInput);
    const outputDirectory = outputDirectoryInput ? path.resolve(outputDirectoryInput) : path.dirname(coachingPath);
    if (!fs.existsSync(coachingPath)) {
        throw new Error(`coaching.json does not exist: ${coachingPath}`);
    }
    const coaching = readJson(coachingPath);
    const artifacts = buildDrillArtifacts(outputDirectory, coachingPath, coaching, options);
    const drillSpecPath = path.join(outputDirectory, "drill_spec.json");
    const drillSessionPath = path.join(outputDirectory, "drill_session.json");
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(drillSpecPath, `${JSON.stringify(artifacts.drillSpec, null, 2)}\n`, "utf8");
    fs.writeFileSync(drillSessionPath, `${JSON.stringify(artifacts.drillSession, null, 2)}\n`, "utf8");
    return artifacts;
}
exports.generateDrillForCoachingFile = generateDrillForCoachingFile;
function buildDrillArtifacts(outputDirectoryInput, coachingPathInput, coaching, options = {}) {
    const outputDirectory = normalizePath(outputDirectoryInput).replace(/\/+$/g, "");
    const coachingPath = normalizePath(coachingPathInput);
    const generatedAt = options.generatedAt || new Date().toISOString();
    const runId = stringField(coaching, "run_id");
    const final = recordField(coaching, "final");
    const practiceObjective = recordField(coaching, "practice_objective");
    const candidate = recordField(coaching, "drill_spec_candidate");
    const reviewCard = recordField(coaching, "review_card");
    const sourceFiles = recordField(coaching, "source_files");
    validateCoaching(coaching, final, practiceObjective, candidate);
    const normalizedParameters = validateAndNormalizeCandidate(candidate, practiceObjective, final);
    const primaryFailure = stringField(final, "primary_failure");
    const practiceObjectiveId = stringField(practiceObjective, "id");
    const drillId = `drill.${sanitizeId(runId)}.${sanitizeId(practiceObjectiveId)}`;
    const sessionId = `session.${sanitizeId(runId)}.${sanitizeId(normalizedParameters.focus)}`;
    const drillSpecPath = joinPath(outputDirectory, "drill_spec.json");
    const drillSessionPath = joinPath(outputDirectory, "drill_session.json");
    const seed = normalizeSeed(options.randomSeed, runId, practiceObjectiveId);
    const difficulty = difficultyFor(normalizedParameters.player_level);
    const metricIds = normalizedParameters.metric_ids;
    const successCriteria = arrayField(practiceObjective, "success_criteria");
    const drillSpec = {
        schema_version: DRILL_SPEC_SCHEMA_VERSION,
        drill_id: drillId,
        generated_at: generatedAt,
        source_attempt_run_id: runId,
        source_diagnosis_id: `diagnosis.${sanitizeId(runId)}.${sanitizeId(primaryFailure)}`,
        source_coaching_path: normalizePath(coachingPath),
        practice_objective_id: practiceObjectiveId,
        primary_failure: primaryFailure,
        template_id: "single_enemy_execution_response",
        arena_template: "single_enemy_execution_response",
        enemy_archetype: "sample_demo_single_enemy",
        random_seed: seed,
        pattern_weights: {
            execution_response_window: 0.7,
            basic_pressure: 0.3
        },
        success_metrics: {
            repetition_goal: normalizedParameters.repetition_goal,
            success_window_seconds: normalizedParameters.success_window_seconds,
            max_terminal_execution_count: 0,
            require_defensive_input_before_execution_window: true,
            max_consecutive_failures: normalizedParameters.max_consecutive_failures
        },
        constraints: {
            max_enemies: 1,
            disable_extra_hazards: true,
            difficulty,
            reset_between_repetitions: true,
            allow_freeform_assets: false,
            allow_console_commands: false
        },
        telemetry_eval_hooks: {
            metric_ids: metricIds,
            success_criteria: successCriteria
        },
        validation: {
            validator_version: VALIDATOR_VERSION,
            template_whitelist_version: TEMPLATE_WHITELIST_VERSION,
            supported_template_ids: SUPPORTED_TEMPLATE_IDS,
            allowed_parameter_names: ALLOWED_PARAMETER_NAMES,
            candidate_validation_status: "passed"
        }
    };
    const drillSession = {
        schema_version: DRILL_SESSION_SCHEMA_VERSION,
        session_id: sessionId,
        drill_id: drillId,
        generated_at: generatedAt,
        status: "ready_for_controlled_template",
        source_kind: options.sourceKind || "offline",
        output_directory: normalizePath(outputDirectory),
        files: {
            drill_spec_json: normalizePath(drillSpecPath),
            drill_session_json: normalizePath(drillSessionPath)
        },
        source_refs: {
            source_attempt_run_id: runId,
            source_diagnosis_json: normalizePath(String(sourceFiles.diagnosis_json || "")),
            source_coaching_json: normalizePath(coachingPath),
            practice_objective_id: practiceObjectiveId,
            evidence_event_seqs: arrayField(practiceObjective, "evidence_event_seqs")
        },
        template_request: {
            template_id: "single_enemy_execution_response",
            arena_template: "single_enemy_execution_response",
            enemy_archetype: "sample_demo_single_enemy",
            normalized_parameters: normalizedParameters,
            random_seed: seed,
            pattern_weights: drillSpec.pattern_weights,
            success_metrics: drillSpec.success_metrics,
            constraints: drillSpec.constraints
        },
        readable_zh: {
            title: "处决窗口反应练习",
            objective: "只练一件事：架势崩溃或处决前兆出现时，停止贪刀并立刻防御或后撤。",
            source_diagnosis: String(recordField(coaching, "review_card").diagnosis_sentence || ""),
            success_condition: String(reviewCard.success_condition || "")
        },
        final: {
            status: "drill_ready",
            template_id: "single_enemy_execution_response",
            practice_objective_id: practiceObjectiveId,
            primary_failure: primaryFailure,
            metric_ids: metricIds
        }
    };
    return {
        drillSpec,
        drillSession
    };
}
exports.buildDrillArtifacts = buildDrillArtifacts;
function validateCoaching(coaching, final, practiceObjective, candidate) {
    if (coaching.schema_version !== "guidebuddy.coaching.v1") {
        throw new Error(`Unsupported coaching schema_version: ${String(coaching.schema_version || "")}`);
    }
    if (String(final.status || "") !== "coaching_ready") {
        throw new Error(`MVP04 only generates drills from coaching_ready output. status=${String(final.status || "")}`);
    }
    if (!practiceObjective.id || !Array.isArray(practiceObjective.measurable_metrics)) {
        throw new Error("coaching.practice_objective is missing id or measurable_metrics.");
    }
    if (Object.keys(candidate).length === 0) {
        throw new Error("coaching.drill_spec_candidate is missing.");
    }
}
function validateAndNormalizeCandidate(candidate, practiceObjective, final) {
    var _a, _b, _c, _d;
    validateNoUnknownFields(candidate, ALLOWED_CANDIDATE_FIELDS, "drill_spec_candidate");
    scanUnsafeCandidate(candidate, "drill_spec_candidate");
    if (candidate.schema_version !== ACCEPTED_CANDIDATE_SCHEMA_VERSION) {
        throw new Error(`Unsupported drill_spec_candidate schema_version: ${String(candidate.schema_version || "")}`);
    }
    const templateId = stringField(candidate, "template_id");
    if (!SUPPORTED_TEMPLATE_IDS.includes(templateId)) {
        throw new Error(`Unsupported drill template_id for MVP04: ${templateId}`);
    }
    if (stringField(candidate, "objective_ref") !== stringField(practiceObjective, "id")) {
        throw new Error("drill_spec_candidate.objective_ref does not match practice_objective.id.");
    }
    const validation = recordField(candidate, "validation");
    validateNoUnknownFields(validation, ALLOWED_VALIDATION_FIELDS, "drill_spec_candidate.validation");
    if (validation.template_whitelist_passed !== true || validation.parameter_whitelist_passed !== true) {
        throw new Error("drill_spec_candidate must arrive with MVP03 whitelist validation already passed.");
    }
    const safety = recordField(candidate, "safety");
    validateNoUnknownFields(safety, ALLOWED_SAFETY_FIELDS, "drill_spec_candidate.safety");
    if (safety.llm_may_not_create_unreal_assets !== true ||
        safety.llm_may_not_execute_console_commands !== true ||
        safety.requires_mvp04_validation !== true) {
        throw new Error("drill_spec_candidate safety boundary is missing or weakened.");
    }
    const parameters = recordField(candidate, "parameters");
    validateNoUnknownFields(parameters, ALLOWED_PARAMETER_NAMES, "drill_spec_candidate.parameters");
    const targetError = stringField(parameters, "target_error");
    const focus = stringField(parameters, "focus");
    const playerLevel = normalizePlayerLevel(parameters.player_level);
    const enemyCount = (_a = integerField(parameters, "enemy_count")) !== null && _a !== void 0 ? _a : 1;
    const repetitionGoal = (_b = integerField(parameters, "repetition_goal")) !== null && _b !== void 0 ? _b : 5;
    const successWindowSeconds = (_c = numberField(parameters, "success_window_seconds")) !== null && _c !== void 0 ? _c : 1.5;
    const maxConsecutiveFailures = (_d = integerField(parameters, "max_consecutive_failures")) !== null && _d !== void 0 ? _d : 3;
    const metricIds = stringArrayField(parameters, "metric_ids");
    const objectiveMetricIds = arrayField(practiceObjective, "measurable_metrics")
        .map((metric) => stringField(recordField(metric, ""), "id"))
        .filter((value) => value.length > 0);
    if (targetError !== "posture_break_into_execution" || stringField(final, "primary_failure") !== targetError) {
        throw new Error(`single_enemy_execution_response requires target_error=posture_break_into_execution. target_error=${targetError}`);
    }
    if (focus !== "avoid_execution_setup") {
        throw new Error(`single_enemy_execution_response requires focus=avoid_execution_setup. focus=${focus}`);
    }
    if (enemyCount !== 1) {
        throw new Error(`single_enemy_execution_response supports exactly one enemy. enemy_count=${enemyCount}`);
    }
    if (repetitionGoal < 1 || repetitionGoal > 10) {
        throw new Error(`repetition_goal is outside the safe MVP04 range 1..10: ${repetitionGoal}`);
    }
    if (successWindowSeconds < 0.5 || successWindowSeconds > 3) {
        throw new Error(`success_window_seconds is outside the safe MVP04 range 0.5..3: ${successWindowSeconds}`);
    }
    if (maxConsecutiveFailures < 0 || maxConsecutiveFailures > 5) {
        throw new Error(`max_consecutive_failures is outside the safe MVP04 range 0..5: ${maxConsecutiveFailures}`);
    }
    if (metricIds.length === 0 || metricIds.some((metricId) => !objectiveMetricIds.includes(metricId))) {
        throw new Error("drill_spec_candidate.parameters.metric_ids must be a non-empty subset of practice_objective.measurable_metrics.");
    }
    return {
        target_error: targetError,
        focus,
        player_level: playerLevel,
        enemy_count: enemyCount,
        repetition_goal: repetitionGoal,
        success_window_seconds: successWindowSeconds,
        max_consecutive_failures: maxConsecutiveFailures,
        metric_ids: metricIds
    };
}
function validateNoUnknownFields(record, allowedNames, label) {
    const unknownNames = Object.keys(record).filter((name) => !allowedNames.includes(name));
    if (unknownNames.length > 0) {
        throw new Error(`${label} contains non-whitelisted fields: ${unknownNames.join(", ")}`);
    }
}
function scanUnsafeCandidate(value, pathLabel) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => scanUnsafeCandidate(item, `${pathLabel}[${index}]`));
        return;
    }
    if (isRecord(value)) {
        for (const [key, nestedValue] of Object.entries(value)) {
            if (DANGEROUS_FIELD_NAMES.includes(key.toLowerCase())) {
                throw new Error(`Unsafe field rejected at ${pathLabel}.${key}`);
            }
            scanUnsafeCandidate(nestedValue, `${pathLabel}.${key}`);
        }
        return;
    }
    if (typeof value === "string" && DANGEROUS_VALUE_PATTERN.test(value)) {
        throw new Error(`Unsafe string rejected at ${pathLabel}`);
    }
}
function normalizeSeed(inputSeed, runId, objectiveId) {
    if (typeof inputSeed === "number" && Number.isInteger(inputSeed) && inputSeed >= 0) {
        return inputSeed;
    }
    const text = `${runId}:${objectiveId}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function difficultyFor(playerLevel) {
    if (playerLevel === "advanced") {
        return 0.55;
    }
    if (playerLevel === "intermediate") {
        return 0.45;
    }
    return 0.35;
}
function normalizePlayerLevel(value) {
    if (value === "intermediate" || value === "advanced" || value === "novice") {
        return value;
    }
    throw new Error(`Unsupported player_level for MVP04 drill: ${String(value || "")}`);
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
function stringField(value, fieldName) {
    if (!isRecord(value)) {
        return "";
    }
    const raw = value[fieldName];
    return typeof raw === "string" ? raw : "";
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
function integerField(value, fieldName) {
    const numberValue = numberField(value, fieldName);
    return Number.isInteger(numberValue) ? numberValue : undefined;
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
function joinPath(...parts) {
    return normalizePath(parts.filter((part) => part.length > 0).join("/"));
}
function sanitizeId(value) {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    return sanitized || "unknown";
}
function findLatestCoachingRunDirectory() {
    const fs = getFs();
    const path = getPath();
    const telemetryRoot = path.join(process.cwd(), "Saved", "GuideBuddy", "Telemetry");
    if (!fs.existsSync(telemetryRoot)) {
        throw new Error(`Telemetry root does not exist: ${telemetryRoot}`);
    }
    const candidates = fs.readdirSync(telemetryRoot)
        .map((name) => path.join(telemetryRoot, name))
        .filter((candidate) => fs.statSync(candidate).isDirectory() && fs.existsSync(path.join(candidate, "coaching.json")))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    if (candidates.length === 0) {
        throw new Error(`No coaching run directories found under: ${telemetryRoot}`);
    }
    return candidates[0];
}
function printHelp() {
    console.log(`Usage:
  node Content/JavaScript/GuideBuddy/drill.js [run-directory] [--coaching path] [--output-dir path]

Default source:
  Saved/GuideBuddy/Telemetry/<latest-run-with-coaching>

Output:
  <run-directory>/drill_spec.json
  <run-directory>/drill_session.json`);
}
function runCli(argv) {
    const path = getPath();
    let runDirectory = "";
    let coachingPath = "";
    let outputDirectory = "";
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") {
            printHelp();
            return;
        }
        if (arg === "--coaching") {
            coachingPath = argv[index + 1] || "";
            index += 1;
            if (!coachingPath) {
                throw new Error("--coaching requires a path.");
            }
            continue;
        }
        if (arg === "--output-dir") {
            outputDirectory = argv[index + 1] || "";
            index += 1;
            if (!outputDirectory) {
                throw new Error("--output-dir requires a path.");
            }
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
    const sourceRunDirectory = runDirectory ? path.resolve(runDirectory) : findLatestCoachingRunDirectory();
    const sourceCoachingPath = coachingPath ? path.resolve(coachingPath) : path.join(sourceRunDirectory, "coaching.json");
    const targetDirectory = outputDirectory ? path.resolve(outputDirectory) : path.dirname(sourceCoachingPath);
    const artifacts = generateDrillForCoachingFile(sourceCoachingPath, targetDirectory, {
        sourceKind: "cli"
    });
    console.log(JSON.stringify({
        ok: true,
        coaching_path: normalizePath(sourceCoachingPath),
        output_directory: normalizePath(targetDirectory),
        drill_id: String(artifacts.drillSpec.drill_id || ""),
        session_id: String(artifacts.drillSession.session_id || ""),
        template_id: String(artifacts.drillSpec.template_id || "")
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
