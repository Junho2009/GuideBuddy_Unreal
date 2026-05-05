"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDiagnosis = exports.generateDiagnosisForRunDirectory = void 0;
const fs = require("fs");
const path = require("path");
const SCHEMA_VERSION = "guidebuddy.diagnosis.v1";
const DEFAULT_EVIDENCE_WINDOW_SECONDS = 4;
const POST_TERMINAL_EVIDENCE_SECONDS = 0.8;
function generateDiagnosisForRunDirectory(runDirectoryInput, outputPathInput) {
    const runDirectory = path.resolve(runDirectoryInput);
    const eventsPath = path.join(runDirectory, "combat_events.jsonl");
    const summaryPath = path.join(runDirectory, "attempt_summary.json");
    const outputPath = outputPathInput ? path.resolve(outputPathInput) : path.join(runDirectory, "diagnosis.json");
    if (!fs.existsSync(runDirectory) || !fs.statSync(runDirectory).isDirectory()) {
        throw new Error(`Run directory does not exist: ${runDirectory}`);
    }
    const events = readJsonl(eventsPath);
    const summary = readJson(summaryPath);
    const diagnosis = buildDiagnosis(runDirectory, eventsPath, summaryPath, events, summary);
    fs.writeFileSync(outputPath, `${JSON.stringify(diagnosis, null, 2)}\n`, "utf8");
    return diagnosis;
}
exports.generateDiagnosisForRunDirectory = generateDiagnosisForRunDirectory;
function buildDiagnosis(runDirectory, eventsPath, summaryPath, events, summary) {
    const terminal = findTerminalFailure(events, summary);
    const evidenceEvents = terminal ? selectEvidenceEvents(events, terminal) : selectFallbackEvidenceEvents(events);
    const classification = terminal
        ? classifyTerminalFailure(events, terminal, evidenceEvents)
        : buildInsufficientEvidenceClassification(summary);
    const evidenceWindow = buildEvidenceWindow(evidenceEvents);
    const sourceRunId = String(summary.run_id || firstString(events, "run_id") || "");
    const practiceObjectiveSeed = buildPracticeObjectiveSeed(classification, evidenceWindow, evidenceEvents);
    const readableZh = buildReadableZh(classification, terminal, evidenceEvents, evidenceWindow);
    const evidenceSeqs = evidenceEvents.map((event) => event.seq);
    return {
        schema_version: SCHEMA_VERSION,
        run_id: sourceRunId,
        generated_at: new Date().toISOString(),
        source_files: {
            run_directory: normalizePath(runDirectory),
            combat_events_jsonl: normalizePath(eventsPath),
            attempt_summary_json: normalizePath(summaryPath)
        },
        readable_zh: readableZh,
        deterministic: {
            status: terminal ? "diagnosed" : "insufficient_evidence",
            primary_failure: classification.primaryFailure,
            category: classification.category,
            confidence: classification.confidence,
            evidence_event_seqs: evidenceSeqs,
            evidence_window: evidenceWindow,
            terminal: terminal ? {
                event_seq: terminal.terminalEvent.seq,
                event_type: terminal.terminalEvent.event_type,
                time_seconds: terminal.terminalEvent.time_seconds,
                terminal_tag: terminal.terminalTag,
                death_reason: terminal.reason
            } : null,
            source: terminal ? normalizeSource(terminal.source, evidenceEvents) : null,
            signals: classification.signals,
            summary: classification.summary
        },
        llm_review: {
            enabled: false,
            status: "not_configured",
            input_summary: {
                deterministic_primary_failure: classification.primaryFailure,
                confidence: classification.confidence,
                evidence_event_seqs: evidenceSeqs
            },
            output: null
        },
        final: {
            status: terminal ? "diagnosed" : "insufficient_evidence",
            primary_failure: classification.primaryFailure,
            confidence: classification.confidence,
            summary: classification.summary,
            practice_objective_seed: practiceObjectiveSeed
        }
    };
}
exports.buildDiagnosis = buildDiagnosis;
function findTerminalFailure(events, summary) {
    const deathInfo = isRecord(summary.death_info) ? summary.death_info : undefined;
    if (deathInfo) {
        const terminalEvent = findEventBySeq(events, numberField(deathInfo, "terminal_event_seq")) ||
            findEventBySeq(events, numberField(deathInfo, "event_seq")) ||
            findDeathStateEvent(events) ||
            findFatalDamageEvent(events);
        if (terminalEvent) {
            const deathEvent = findEventBySeq(events, numberField(deathInfo, "event_seq"));
            return {
                terminalEvent,
                deathEvent,
                terminalTag: String(deathInfo.terminal_tag || getEventTag(terminalEvent)),
                source: isRecord(deathInfo.source) ? deathInfo.source : undefined,
                reason: String(deathInfo.death_reason || "player_death")
            };
        }
    }
    const deathEvent = events.find((event) => event.event_type === "death");
    if (deathEvent) {
        const terminalEvent = findEventBySeq(events, numberField(deathEvent, "terminal_event_seq")) || deathEvent;
        return {
            terminalEvent,
            deathEvent,
            terminalTag: String(deathEvent.terminal_tag || getEventTag(terminalEvent)),
            source: isRecord(deathEvent.source) ? deathEvent.source : undefined,
            reason: String(deathEvent.death_reason || "player_death")
        };
    }
    const deathStateEvent = findDeathStateEvent(events);
    if (deathStateEvent) {
        return {
            terminalEvent: deathStateEvent,
            terminalTag: getEventTag(deathStateEvent),
            source: undefined,
            reason: "state_death"
        };
    }
    const fatalDamageEvent = findFatalDamageEvent(events);
    if (fatalDamageEvent) {
        return {
            terminalEvent: fatalDamageEvent,
            terminalTag: getEventTag(fatalDamageEvent),
            source: isRecord(fatalDamageEvent.source) ? fatalDamageEvent.source : undefined,
            reason: "health_depleted"
        };
    }
    return undefined;
}
function classifyTerminalFailure(events, terminal, evidenceEvents) {
    var _a, _b, _c;
    const terminalTime = terminal.terminalEvent.time_seconds;
    const executionEvent = findExecutionEvent(evidenceEvents, terminalTime);
    const sourceEvent = executionEvent ||
        sourceToEvent(events, terminal.source) ||
        findRecentEnemyAttackEvent(evidenceEvents, terminalTime);
    const playerAttack = findRecentPlayerAttackEvent(evidenceEvents, (_a = sourceEvent === null || sourceEvent === void 0 ? void 0 : sourceEvent.time_seconds) !== null && _a !== void 0 ? _a : terminalTime);
    const dodgeInput = findRecentDodgeInput(evidenceEvents, (_b = sourceEvent === null || sourceEvent === void 0 ? void 0 : sourceEvent.time_seconds) !== null && _b !== void 0 ? _b : terminalTime);
    const hasExecution = Boolean(executionEvent) ||
        tagMatches(String(((_c = terminal.source) === null || _c === void 0 ? void 0 : _c.tag) || ""), ["execut"]) ||
        tagMatches(terminal.terminalTag, ["execut"]);
    if (hasExecution) {
        return {
            primaryFailure: "posture_break_into_execution",
            category: "fatal_attack_attribution",
            confidence: 0.88,
            summary: "Player death is attributed to a terminal death state followed by an enemy execution signal.",
            signals: compactRecords([
                signal("terminal_death_state", terminal.terminalEvent, 0.9),
                executionEvent ? signal("enemy_execution_signal", executionEvent, 0.88) : undefined,
                playerAttack ? signal("recent_player_attack_commitment", playerAttack, 0.55) : undefined
            ])
        };
    }
    if (playerAttack && sourceEvent && Math.abs(sourceEvent.time_seconds - playerAttack.time_seconds) <= 1.2) {
        return {
            primaryFailure: "overcommit_into_enemy_attack",
            category: "overcommitment",
            confidence: 0.74,
            summary: "Player attack commitment occurred close to the enemy action that led into the terminal failure.",
            signals: compactRecords([
                signal("recent_player_attack_commitment", playerAttack, 0.74),
                signal("enemy_attack_signal", sourceEvent, 0.72),
                signal("terminal_failure", terminal.terminalEvent, 0.7)
            ])
        };
    }
    if (sourceEvent && !dodgeInput && isEnemyAttackLike(sourceEvent)) {
        return {
            primaryFailure: "missed_or_late_dodge",
            category: "dodge_timing",
            confidence: 0.68,
            summary: "Enemy attack evidence exists near the failure window, but no Dodge_Input was observed before the terminal event.",
            signals: compactRecords([
                signal("enemy_attack_signal", sourceEvent, 0.68),
                signal("missing_recent_dodge_input", terminal.terminalEvent, 0.62)
            ])
        };
    }
    if (sourceEvent) {
        return {
            primaryFailure: "fatal_attack_attribution",
            category: "fatal_attack_attribution",
            confidence: 0.64,
            summary: "Terminal failure is attributable to the nearest enemy attack-like signal, but finer timing evidence is limited.",
            signals: compactRecords([
                signal("enemy_attack_signal", sourceEvent, 0.64),
                signal("terminal_failure", terminal.terminalEvent, 0.7)
            ])
        };
    }
    return {
        primaryFailure: "insufficient_evidence",
        category: "unknown",
        confidence: 0,
        summary: "A terminal player failure was observed, but nearby enemy action evidence was not strong enough for attribution.",
        signals: compactRecords([
            signal("terminal_failure", terminal.terminalEvent, 0.5)
        ])
    };
}
function buildInsufficientEvidenceClassification(summary) {
    const hitsTaken = numberField(summary.damage_summary, "hits_taken") || 0;
    const endReason = String(summary.end_reason || "unknown");
    return {
        primaryFailure: "insufficient_evidence",
        category: "unknown",
        confidence: 0,
        summary: `No terminal death or obvious failure was found. end_reason=${endReason}, hits_taken=${hitsTaken}.`,
        signals: []
    };
}
function selectEvidenceEvents(events, terminal) {
    const terminalTime = terminal.terminalEvent.time_seconds;
    const startTime = terminalTime - DEFAULT_EVIDENCE_WINDOW_SECONDS;
    const endTime = terminalTime + POST_TERMINAL_EVIDENCE_SECONDS;
    const selected = events.filter((event) => event.time_seconds >= startTime &&
        event.time_seconds <= endTime &&
        isRelevantEvidenceEvent(event));
    if (!selected.some((event) => event.seq === terminal.terminalEvent.seq)) {
        selected.push(terminal.terminalEvent);
    }
    return selected
        .sort((left, right) => left.seq - right.seq)
        .slice(Math.max(0, selected.length - 32));
}
function selectFallbackEvidenceEvents(events) {
    return events
        .filter(isRelevantEvidenceEvent)
        .slice(Math.max(0, events.length - 24));
}
function isRelevantEvidenceEvent(event) {
    if (event.event_type === "damage" || event.event_type === "death") {
        return true;
    }
    if (event.event_type === "attribute_changed" && tagMatches(getEventTag(event), ["health"])) {
        return true;
    }
    if (event.event_type === "ability_activated" ||
        event.event_type === "state_activated" ||
        event.event_type === "combat_status_changed") {
        return true;
    }
    if (event.event_type === "player_input") {
        return tagMatches(String(event.input_name || ""), ["attack", "dodge", "parry", "block", "guard"]);
    }
    return false;
}
function buildEvidenceWindow(evidenceEvents) {
    if (evidenceEvents.length === 0) {
        return {
            start_time_seconds: null,
            end_time_seconds: null,
            event_seqs: []
        };
    }
    return {
        start_time_seconds: evidenceEvents[0].time_seconds,
        end_time_seconds: evidenceEvents[evidenceEvents.length - 1].time_seconds,
        event_seqs: evidenceEvents.map((event) => event.seq)
    };
}
function buildPracticeObjectiveSeed(classification, evidenceWindow, evidenceEvents) {
    return {
        focus: `avoid_${classification.primaryFailure}`,
        target_error: classification.primaryFailure,
        evidence_window: evidenceWindow,
        candidate_drill_focuses: candidateFocusesFor(classification.primaryFailure),
        measurable_metrics: metricsFor(classification.primaryFailure),
        evidence_event_seqs: evidenceEvents.map((event) => event.seq)
    };
}
function buildReadableZh(classification, terminal, evidenceEvents, evidenceWindow) {
    const failureInfo = readableFailureInfoZh(classification.primaryFailure);
    const confidencePercent = Math.round(classification.confidence * 100);
    const evidence = buildReadableEvidenceZh(classification.signals, evidenceEvents);
    const statusText = terminal ? "已找到可诊断的失败窗口" : "未找到明确死亡或失败窗口";
    return {
        language: "zh-CN",
        status: statusText,
        summary: `${statusText}。本次主要问题：${failureInfo.label}。诊断置信度：${confidenceLabelZh(classification.confidence)}（${confidencePercent}%）。`,
        primary_failure_id: classification.primaryFailure,
        primary_failure_label: failureInfo.label,
        category: classification.category,
        confidence_label: confidenceLabelZh(classification.confidence),
        confidence_percent: confidencePercent,
        evidence_window: evidenceWindow,
        evidence,
        practice_suggestion: failureInfo.practiceSuggestion,
        notes: "这是规则诊断生成的中文速读说明；完整机器可读证据仍以 deterministic、final 和原始事件文件为准。"
    };
}
function readableFailureInfoZh(primaryFailure) {
    if (primaryFailure === "posture_break_into_execution") {
        return {
            label: "架势崩溃后被处决",
            practiceSuggestion: "下一轮优先练习：识别处决或特殊攻击前兆，在敌人压近或架势危险时停止追刀，先闪避、防御或拉开距离。"
        };
    }
    if (primaryFailure === "overcommit_into_enemy_attack") {
        return {
            label: "贪刀 / 过度承诺",
            practiceSuggestion: "下一轮优先练习：单次攻击后留出防御窗口，看到敌人起手时停止连按攻击。"
        };
    }
    if (primaryFailure === "missed_or_late_dodge") {
        return {
            label: "闪避过晚或缺失",
            practiceSuggestion: "下一轮优先练习：把注意力放在敌人起手动作上，缩短看到攻击到闪避的反应时间。"
        };
    }
    if (primaryFailure === "fatal_attack_attribution") {
        return {
            label: "致命攻击来源归因",
            practiceSuggestion: "下一轮优先练习：复盘最后一次伤害来源，先确认是哪类敌人动作造成失败。"
        };
    }
    return {
        label: "证据不足，暂不强行归因",
        practiceSuggestion: "下一轮建议：再打一场并保留死亡、受击、攻击和闪避事件，以便诊断层获得足够证据。"
    };
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
function buildReadableEvidenceZh(signals, evidenceEvents) {
    const lines = signals.map(describeSignalZh);
    if (lines.length > 0) {
        return lines;
    }
    if (evidenceEvents.length > 0) {
        return [`已保留 ${evidenceEvents.length} 条候选事件，但还不足以支撑明确归因。`];
    }
    return ["未发现足以支撑明确归因的死亡、受击或敌人动作证据。"];
}
function describeSignalZh(signalRecord) {
    const id = String(signalRecord.id || "evidence");
    const seq = String(signalRecord.event_seq || "?");
    const eventType = String(signalRecord.event_type || "unknown_event");
    const tag = String(signalRecord.tag || "");
    const role = String(signalRecord.actor_role || "");
    const timeSeconds = Number(signalRecord.time_seconds);
    const tagText = tag.length > 0 ? `，标签 ${tag}` : "";
    const roleText = role.length > 0 ? `，角色 ${role}` : "";
    const timeText = Number.isFinite(timeSeconds) ? `，时间 ${timeSeconds.toFixed(2)}s` : "";
    return `${signalLabelZh(id)}：事件 #${seq}，类型 ${eventType}${tagText}${roleText}${timeText}。`;
}
function signalLabelZh(id) {
    if (id === "terminal_death_state") {
        return "死亡状态证据";
    }
    if (id === "enemy_execution_signal") {
        return "敌人处决信号";
    }
    if (id === "recent_player_attack_commitment") {
        return "失败前玩家攻击输入";
    }
    if (id === "enemy_attack_signal") {
        return "敌人攻击信号";
    }
    if (id === "missing_recent_dodge_input") {
        return "未观察到近期闪避输入";
    }
    if (id === "terminal_failure") {
        return "最终失败事件";
    }
    return "诊断证据";
}
function candidateFocusesFor(primaryFailure) {
    if (primaryFailure === "posture_break_into_execution") {
        return ["avoid_execution_setup", "recover_before_terminal_state", "respond_to_enemy_special_attack"];
    }
    if (primaryFailure === "overcommit_into_enemy_attack") {
        return ["shorten_attack_commitment", "stop_attacking_during_enemy_windup", "defensive_cancel_timing"];
    }
    if (primaryFailure === "missed_or_late_dodge") {
        return ["dodge_timing", "enemy_windup_recognition", "single_attack_reaction_window"];
    }
    if (primaryFailure === "fatal_attack_attribution") {
        return ["identify_fatal_attack_source", "survive_last_damage_window"];
    }
    return ["collect_more_failure_evidence"];
}
function metricsFor(primaryFailure) {
    if (primaryFailure === "posture_break_into_execution") {
        return [
            metric("terminal_execution_count", "count", "lower_is_better"),
            metric("enemy_execution_after_player_death", "count", "lower_is_better"),
            metric("defensive_input_before_execution_window", "boolean", "higher_is_better")
        ];
    }
    if (primaryFailure === "overcommit_into_enemy_attack") {
        return [
            metric("player_attack_within_1s_before_enemy_hit", "count", "lower_is_better"),
            metric("defensive_input_after_enemy_windup", "count", "higher_is_better")
        ];
    }
    if (primaryFailure === "missed_or_late_dodge") {
        return [
            metric("dodge_input_latency_after_enemy_attack", "seconds", "lower_is_better"),
            metric("enemy_attack_windows_without_dodge", "count", "lower_is_better")
        ];
    }
    return [
        metric("diagnosable_terminal_failures", "count", "higher_is_better")
    ];
}
function metric(id, unit, direction) {
    return { id, unit, direction };
}
function signal(id, event, confidence) {
    return {
        id,
        event_seq: event.seq,
        event_type: event.event_type,
        time_seconds: event.time_seconds,
        tag: getEventTag(event) || String(event.input_name || ""),
        actor_role: String(event.role || actorRole(event.actor) || actorRole(event.target) || ""),
        confidence
    };
}
function compactRecords(values) {
    return values.filter((value) => Boolean(value));
}
function normalizeSource(source, evidenceEvents) {
    var _a;
    if (!source) {
        const sourceEvent = findRecentEnemyAttackEvent(evidenceEvents, ((_a = evidenceEvents[evidenceEvents.length - 1]) === null || _a === void 0 ? void 0 : _a.time_seconds) || 0);
        return sourceEvent ? {
            event_seq: sourceEvent.seq,
            event_type: sourceEvent.event_type,
            time_seconds: sourceEvent.time_seconds,
            actor_name: sourceEvent.actor_name || objectField(sourceEvent.actor, "name"),
            tag: getEventTag(sourceEvent),
            confidence: "inferred_from_evidence_window"
        } : null;
    }
    return {
        time_seconds: source.time_seconds,
        event_type: source.event_type,
        actor_name: source.actor_name,
        actor_path: source.actor_path,
        tag: source.tag,
        confidence: source.confidence || "provided_by_summary"
    };
}
function findExecutionEvent(events, terminalTime) {
    return events.find((event) => tagMatches(getEventTag(event), ["execut"]) &&
        Math.abs(event.time_seconds - terminalTime) <= 1.0);
}
function findRecentEnemyAttackEvent(events, terminalTime) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event.time_seconds > terminalTime + POST_TERMINAL_EVIDENCE_SECONDS) {
            continue;
        }
        if (terminalTime - event.time_seconds > DEFAULT_EVIDENCE_WINDOW_SECONDS) {
            break;
        }
        if (actorRole(event.actor) === "enemy" && isEnemyAttackLike(event)) {
            return event;
        }
    }
    return undefined;
}
function findRecentPlayerAttackEvent(events, anchorTime) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event.time_seconds > anchorTime + 0.2) {
            continue;
        }
        if (anchorTime - event.time_seconds > 1.2) {
            break;
        }
        const isPlayerActor = actorRole(event.actor) === "player" || event.role === "player";
        const isAttackEvent = tagMatches(getEventTag(event), ["attack"]) ||
            (event.event_type === "player_input" && tagMatches(String(event.input_name || ""), ["attack"]));
        if (isPlayerActor && isAttackEvent) {
            return event;
        }
    }
    return undefined;
}
function findRecentDodgeInput(events, anchorTime) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event.time_seconds > anchorTime + 0.2) {
            continue;
        }
        if (anchorTime - event.time_seconds > 1.5) {
            break;
        }
        if (event.event_type === "player_input" && tagMatches(String(event.input_name || ""), ["dodge"])) {
            return event;
        }
    }
    return undefined;
}
function isEnemyAttackLike(event) {
    return tagMatches(getEventTag(event), ["attack", "execut", "riposte", "hit"]);
}
function sourceToEvent(events, source) {
    if (!source) {
        return undefined;
    }
    const sourceTime = numberField(source, "time_seconds");
    const sourceTag = String(source.tag || "");
    if (sourceTime === undefined) {
        return undefined;
    }
    return events.find((event) => Math.abs(event.time_seconds - sourceTime) <= 0.05 &&
        (!sourceTag || getEventTag(event) === sourceTag));
}
function findEventBySeq(events, seq) {
    if (seq === undefined) {
        return undefined;
    }
    return events.find((event) => event.seq === seq);
}
function findDeathStateEvent(events) {
    return events.find((event) => event.event_type === "state_activated" &&
        actorRole(event.actor) === "player" &&
        isDeathTag(getEventTag(event)));
}
function findFatalDamageEvent(events) {
    return events.find((event) => event.event_type === "damage" &&
        actorRole(event.target) === "player" &&
        event.is_fatal === true);
}
function isDeathTag(tag) {
    return tag.toLowerCase() === "state.death" || tag.toLowerCase() === "death" || tag.toLowerCase().includes("death");
}
function getEventTag(event) {
    return String(event.ability_tag || event.state_tag || event.combat_status_tag || event.attribute_tag || event.terminal_tag || "");
}
function tagMatches(value, needles) {
    const normalized = value.toLowerCase();
    return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}
function actorRole(value) {
    if (!isRecord(value)) {
        return "";
    }
    return String(value.role || "");
}
function objectField(value, fieldName) {
    return isRecord(value) ? value[fieldName] : undefined;
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
function firstString(events, fieldName) {
    for (const event of events) {
        const value = event[fieldName];
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    catch (error) {
        throw new Error(`Invalid JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function readJsonl(filePath) {
    return fs.readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line, index) => {
        try {
            return JSON.parse(line);
        }
        catch (error) {
            throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}
function normalizePath(filePath) {
    return filePath.replace(/\\/g, "/");
}
function findLatestTelemetryRunDirectory() {
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
  node Content/JavaScript/GuideBuddy/diagnosis.js [run-directory] [--output path]

Default source:
  Saved/GuideBuddy/Telemetry/<latest-run>

Output:
  <run-directory>/diagnosis.json`);
}
function runCli(argv) {
    let runDirectory = "";
    let outputPath = "";
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
        if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        }
        if (runDirectory) {
            throw new Error(`Only one run directory may be provided. Unexpected argument: ${arg}`);
        }
        runDirectory = arg;
    }
    const sourceDirectory = runDirectory ? path.resolve(runDirectory) : findLatestTelemetryRunDirectory();
    const diagnosis = generateDiagnosisForRunDirectory(sourceDirectory, outputPath || undefined);
    console.log(JSON.stringify({
        ok: true,
        run_directory: normalizePath(sourceDirectory),
        run_id: diagnosis.run_id,
        output_path: normalizePath(outputPath || path.join(sourceDirectory, "diagnosis.json")),
        primary_failure: String(diagnosis.final.primary_failure || ""),
        confidence: Number(diagnosis.final.confidence || 0)
    }, null, 2));
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
