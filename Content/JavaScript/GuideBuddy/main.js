"use strict";
const coachingRuntime = require("./coaching");
const drillRuntime = require("./drill");
const soulslikeControlsRuntime = require("./soulslike_controls");
const puerts = require("puerts");
const maybeBridge = puerts.argv.getByName("GuideBuddyBridge");
const maybeCombatControlBridge = puerts.argv.getByName("CombatControlBridge");
if (!maybeBridge) {
    throw new Error("GuideBuddyBridge argv is required.");
}
const bridge = maybeBridge;
const soulslikeControls = soulslikeControlsRuntime.createSoulslikeControls(maybeCombatControlBridge);
const initialContext = parseJsonObject(bridge.GetInitialContextJson());
const runId = createRunId(String(initialContext.map || "unknown-map"));
const telemetryRoot = normalizePath(bridge.GetTelemetryRootDirectory());
const runDirectory = joinPath(telemetryRoot, runId);
const events = [];
let sequence = 0;
let finalized = false;
let battleEnded = false;
let battleEndReason;
let lastEnemyAction;
let deathInfo;
let guideRequestCount = 0;
bridge.CreateDirectoryTree(runDirectory);
showRuntimeStatus(`GuideBuddy ready. Battle-end menu will appear after this attempt. Output: ${runDirectory}`, true);
recordEvent("attempt_start", {
    map: String(initialContext.map || ""),
    player: initialContext.player || {},
    telemetry_root: telemetryRoot,
    run_directory: runDirectory
}, {
    time_seconds: 0,
    iso_time: String(initialContext.iso_time || new Date().toISOString()),
    map: String(initialContext.map || "")
});
bridge.OnTelemetrySignal.Add((signalJson) => {
    handleSignal(signalJson);
});
console.log(`[GuideBuddy] MVP01 telemetry started: ${runId}`);
function handleSignal(signalJson) {
    if (finalized) {
        return;
    }
    const signal = parseJsonObject(signalJson);
    const signalType = String(signal.signal_type || "");
    const payload = (signal.payload || {});
    if (signalType === "bridge_started") {
        return;
    }
    if (signalType === "bridge_shutdown") {
        finalize(battleEndReason || String(payload.reason || "bridge_shutdown"), signal);
        return;
    }
    if (signalType === "guide_request") {
        handleGuideRequest(signal, payload);
        return;
    }
    if (battleEnded) {
        return;
    }
    if (signalType === "player_input") {
        soulslikeControls.handleTelemetrySignal(signal);
        recordEvent("player_input", flattenPayload(signal, {
            input_name: payload.input_name,
            trigger_event: payload.trigger_event,
            watchlist_tag: payload.watchlist_tag,
            actor: payload.actor,
            input: payload.input
        }));
        return;
    }
    if (signalType === "ability_activated") {
        const event = recordEvent("ability_activated", flattenPayload(signal, {
            actor: payload.actor,
            ability: payload.ability,
            ability_tag: payload.ability_tag,
            change_type: payload.change_type
        }));
        rememberEnemyAction(event, payload.actor, String(payload.ability_tag || ""));
        return;
    }
    if (signalType === "state_activated") {
        const event = recordEvent("state_activated", flattenPayload(signal, {
            actor: payload.actor,
            state: payload.state,
            state_tag: payload.state_tag,
            change_type: payload.change_type
        }));
        rememberEnemyAction(event, payload.actor, String(payload.state_tag || ""));
        maybeRecordPlayerStateDeath(signal, event, payload.actor, String(payload.state_tag || ""));
        maybeRecordEnemyStateDeath(signal, event, payload.actor, String(payload.state_tag || ""));
        return;
    }
    if (signalType === "combat_status_changed") {
        const event = recordEvent("combat_status_changed", flattenPayload(signal, {
            actor: payload.actor,
            combat_status_tag: payload.combat_status_tag,
            change_type: payload.change_type
        }));
        rememberEnemyAction(event, payload.actor, String(payload.combat_status_tag || ""));
        return;
    }
    if (signalType === "attribute_changed") {
        const attributeEvent = recordEvent("attribute_changed", flattenPayload(signal, {
            actor: payload.actor,
            attribute: payload.attribute,
            attribute_tag: payload.attribute_tag,
            old_value: payload.old_value,
            new_value: payload.new_value,
            delta: payload.delta,
            min_value: payload.min_value,
            max_value: payload.max_value
        }));
        maybeRecordDamage(signal, payload, attributeEvent);
        return;
    }
    recordEvent(signalType || "unknown_signal", flattenPayload(signal, payload));
}
function handleGuideRequest(signal, payload) {
    const guideRequestEvent = recordEvent("guide_request", flattenPayload(signal, {
        actor: payload.actor,
        source: payload.source,
        reason: payload.reason,
        button: payload.button
    }));
    writeGuideRequestSnapshot("guide_request", signal, guideRequestEvent);
}
function maybeRecordDamage(signal, payload, attributeEvent) {
    const attributeTag = String(payload.attribute_tag || "");
    const delta = Number(payload.delta || 0);
    const newValue = Number(payload.new_value || 0);
    const actor = (payload.actor || {});
    if (!isHealthAttribute(attributeTag) || delta >= 0) {
        return;
    }
    const source = inferDamageSource(signal.time_seconds);
    const damageEvent = recordEvent("damage", {
        actor,
        target: actor,
        attribute_tag: attributeTag,
        damage_amount: Math.abs(delta),
        remaining_health: newValue,
        is_fatal: newValue <= 0,
        source,
        source_confidence: source ? source.confidence : "unknown",
        inferred_from_event_seq: attributeEvent.seq
    }, signalToEventOverride(signal));
    if (actor.role === "player" && newValue <= 0) {
        recordPlayerDeath(signal, damageEvent, actor, "health_depleted", source, {
            damage_event_seq: damageEvent.seq,
            remaining_health: newValue
        });
        return;
    }
    if (actor.role === "enemy" && newValue <= 0) {
        recordEnemyDefeated(signal, damageEvent, actor, "health_depleted", {
            damage_event_seq: damageEvent.seq,
            remaining_health: newValue
        });
    }
}
function maybeRecordPlayerStateDeath(signal, terminalEvent, actor, stateTag) {
    if (!actor || actor.role !== "player" || deathInfo || !isDeathStateTag(stateTag)) {
        return;
    }
    recordPlayerDeath(signal, terminalEvent, actor, "state_death", inferTerminalDeathSource(terminalEvent.time_seconds));
}
function maybeRecordEnemyStateDeath(signal, terminalEvent, actor, stateTag) {
    if (!actor || actor.role !== "enemy" || battleEnded || !isDeathStateTag(stateTag)) {
        return;
    }
    recordEnemyDefeated(signal, terminalEvent, actor, "state_death");
}
function recordPlayerDeath(signal, terminalEvent, actor, deathReason, source, extra = {}) {
    if (deathInfo) {
        return;
    }
    const evidenceEvents = selectDeathEvidenceEvents(terminalEvent);
    const terminalTag = getEventTag(terminalEvent);
    const deathEvent = recordEvent("death", {
        actor,
        source,
        source_confidence: source ? source.confidence : "terminal_state",
        death_reason: deathReason,
        terminal_event_seq: terminalEvent.seq,
        terminal_event_type: terminalEvent.event_type,
        terminal_tag: terminalTag,
        evidence_event_seqs: evidenceEvents.map((event) => event.seq),
        ...extra
    }, signalToEventOverride(signal));
    deathInfo = {
        event_seq: deathEvent.seq,
        time_seconds: deathEvent.time_seconds,
        iso_time: deathEvent.iso_time,
        actor,
        source,
        source_confidence: source ? source.confidence : "terminal_state",
        death_reason: deathReason,
        terminal_event_seq: terminalEvent.seq,
        terminal_event_type: terminalEvent.event_type,
        terminal_tag: terminalTag,
        evidence_events: evidenceEvents,
        ...extra
    };
    battleEnded = true;
    battleEndReason = "player_death";
    showBattleEndMenu();
}
function recordEnemyDefeated(signal, terminalEvent, actor, defeatReason, extra = {}) {
    if (battleEnded) {
        return;
    }
    recordEvent("enemy_defeated", {
        actor,
        defeat_reason: defeatReason,
        terminal_event_seq: terminalEvent.seq,
        terminal_event_type: terminalEvent.event_type,
        terminal_tag: getEventTag(terminalEvent),
        ...extra
    }, signalToEventOverride(signal));
    battleEnded = true;
    battleEndReason = "enemy_defeated";
    showBattleEndMenu();
}
function inferTerminalDeathSource(timeSeconds) {
    const recentSource = inferDamageSource(timeSeconds);
    if (recentSource) {
        return recentSource;
    }
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        const actor = event.actor;
        const tag = getEventTag(event).toLowerCase();
        const isEnemy = event.role === "enemy" || (actor === null || actor === void 0 ? void 0 : actor.role) === "enemy";
        const isRelevant = tag.includes("attack") || tag.includes("execut") || tag.includes("riposte") || tag.includes("no block");
        if (timeSeconds - event.time_seconds > 4) {
            break;
        }
        if (isEnemy && isRelevant) {
            return {
                time_seconds: event.time_seconds,
                event_type: event.event_type,
                actor_name: typeof event.actor_name === "string" ? event.actor_name : actor === null || actor === void 0 ? void 0 : actor.name,
                actor_path: typeof event.actor_path === "string" ? event.actor_path : actor === null || actor === void 0 ? void 0 : actor.path,
                tag: getEventTag(event),
                confidence: "inferred_recent_enemy_action"
            };
        }
    }
    return undefined;
}
function selectDeathEvidenceEvents(terminalEvent) {
    const windowStart = terminalEvent.time_seconds - 4;
    const evidenceEvents = events.filter((event) => event.seq <= terminalEvent.seq &&
        event.time_seconds >= windowStart &&
        isDeathEvidenceEvent(event));
    return evidenceEvents.slice(Math.max(0, evidenceEvents.length - 24));
}
function isDeathEvidenceEvent(event) {
    return event.event_type === "damage" ||
        event.event_type === "attribute_changed" ||
        event.event_type === "combat_status_changed" ||
        event.event_type === "ability_activated" ||
        event.event_type === "state_activated";
}
function inferDamageSource(timeSeconds) {
    if (!lastEnemyAction) {
        return undefined;
    }
    if (timeSeconds - lastEnemyAction.time_seconds > 3) {
        return undefined;
    }
    return lastEnemyAction;
}
function rememberEnemyAction(event, actor, tag) {
    if (!actor || actor.role !== "enemy") {
        return;
    }
    lastEnemyAction = {
        time_seconds: event.time_seconds,
        event_type: event.event_type,
        actor_name: typeof actor.name === "string" ? actor.name : undefined,
        actor_path: typeof actor.path === "string" ? actor.path : undefined,
        tag,
        confidence: "inferred_recent_enemy_action"
    };
}
function recordEvent(eventType, payload, override) {
    var _a, _b, _c, _d, _e, _f, _g;
    const event = {
        schema_version: "guidebuddy.combat_event.v1",
        run_id: runId,
        seq: ++sequence,
        event_type: eventType,
        time_seconds: Number((_b = (_a = override === null || override === void 0 ? void 0 : override.time_seconds) !== null && _a !== void 0 ? _a : payload.time_seconds) !== null && _b !== void 0 ? _b : 0),
        iso_time: String((_d = (_c = override === null || override === void 0 ? void 0 : override.iso_time) !== null && _c !== void 0 ? _c : payload.iso_time) !== null && _d !== void 0 ? _d : new Date().toISOString()),
        map: String((_g = (_f = (_e = override === null || override === void 0 ? void 0 : override.map) !== null && _e !== void 0 ? _e : payload.map) !== null && _f !== void 0 ? _f : initialContext.map) !== null && _g !== void 0 ? _g : ""),
        ...payload
    };
    events.push(event);
    return event;
}
function flattenPayload(signal, payload) {
    const actor = payload.actor;
    return {
        time_seconds: signal.time_seconds,
        iso_time: signal.iso_time,
        map: signal.map,
        actor,
        role: (actor === null || actor === void 0 ? void 0 : actor.role) || "unknown",
        actor_name: (actor === null || actor === void 0 ? void 0 : actor.name) || "",
        actor_path: (actor === null || actor === void 0 ? void 0 : actor.path) || "",
        ...payload
    };
}
function signalToEventOverride(signal) {
    return {
        time_seconds: signal.time_seconds,
        iso_time: signal.iso_time,
        map: signal.map
    };
}
function finalize(endReason, signal) {
    if (finalized) {
        return;
    }
    finalized = true;
    recordEvent("attempt_end", {
        end_reason: endReason
    }, signal ? signalToEventOverride(signal) : {
        time_seconds: events.length > 0 ? events[events.length - 1].time_seconds : 0,
        iso_time: new Date().toISOString(),
        map: String(initialContext.map || "")
    });
    const result = writeRunFiles(runDirectory, endReason, events);
    if (result) {
        showRuntimeStatus(formatDiagnosisSavedMessage("Battle ended", result), true);
        console.log(`[GuideBuddy] telemetry and diagnosis written: ${runDirectory}`);
    }
}
function writeGuideRequestSnapshot(endReason, signal, guideRequestEvent) {
    guideRequestCount += 1;
    const requestLabel = `request-${guideRequestCount.toString().padStart(3, "0")}`;
    const snapshotDirectory = joinPath(runDirectory, "guide_requests", requestLabel);
    const snapshotEndEvent = createSnapshotEndEvent(endReason, signal, guideRequestEvent);
    const snapshotEvents = [...events, snapshotEndEvent];
    const result = writeRunFiles(snapshotDirectory, endReason, snapshotEvents);
    if (result) {
        showRuntimeStatus(formatDiagnosisSavedMessage("Guidance request", result), true);
        showCoachingCard(result);
        console.log(`[GuideBuddy] guide request coaching written: ${snapshotDirectory}`);
    }
}
function createSnapshotEndEvent(endReason, signal, guideRequestEvent) {
    return {
        schema_version: "guidebuddy.combat_event.v1",
        run_id: runId,
        seq: sequence + 1,
        event_type: "attempt_end",
        time_seconds: signal.time_seconds,
        iso_time: signal.iso_time,
        map: signal.map,
        end_reason: endReason,
        guide_request_event_seq: guideRequestEvent.seq
    };
}
function writeRunFiles(targetDirectory, endReason, sourceEvents) {
    const combatEventsPath = joinPath(targetDirectory, "combat_events.jsonl");
    const attemptSummaryPath = joinPath(targetDirectory, "attempt_summary.json");
    const diagnosisPath = joinPath(targetDirectory, "diagnosis.json");
    const coachingPath = joinPath(targetDirectory, "coaching.json");
    const drillSpecPath = joinPath(targetDirectory, "drill_spec.json");
    const drillSessionPath = joinPath(targetDirectory, "drill_session.json");
    const summary = buildSummary(endReason, combatEventsPath, attemptSummaryPath, sourceEvents);
    const diagnosis = buildRuntimeDiagnosis(targetDirectory, combatEventsPath, attemptSummaryPath, sourceEvents, summary);
    const coaching = coachingRuntime.buildCoaching(targetDirectory, attemptSummaryPath, diagnosisPath, summary, diagnosis, {
        playerLevel: "novice",
        provider: "local_rule_template",
        sourceKind: "runtime"
    });
    let drillSpec;
    let drillSession;
    let drillError;
    try {
        const drillArtifacts = drillRuntime.buildDrillArtifacts(targetDirectory, coachingPath, coaching, {
            sourceKind: "runtime"
        });
        drillSpec = drillArtifacts.drillSpec;
        drillSession = drillArtifacts.drillSession;
    }
    catch (error) {
        drillError = error instanceof Error ? error.message : String(error);
    }
    const jsonl = `${sourceEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
    bridge.CreateDirectoryTree(targetDirectory);
    const wroteEvents = bridge.WriteUtf8File(combatEventsPath, jsonl);
    const wroteSummary = bridge.WriteUtf8File(attemptSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    const wroteDiagnosis = bridge.WriteUtf8File(diagnosisPath, `${JSON.stringify(diagnosis, null, 2)}\n`);
    const wroteCoaching = bridge.WriteUtf8File(coachingPath, `${JSON.stringify(coaching, null, 2)}\n`);
    const wroteDrillSpec = drillSpec ? bridge.WriteUtf8File(drillSpecPath, `${JSON.stringify(drillSpec, null, 2)}\n`) : true;
    const wroteDrillSession = drillSession ? bridge.WriteUtf8File(drillSessionPath, `${JSON.stringify(drillSession, null, 2)}\n`) : true;
    if (!wroteEvents || !wroteSummary || !wroteDiagnosis || !wroteCoaching || !wroteDrillSpec || !wroteDrillSession) {
        const errorMessage = `Save failed: ${bridge.GetLastError()}`;
        showRuntimeStatus(errorMessage, false);
        console.error(`[GuideBuddy] Runtime output write failed: ${bridge.GetLastError()}`);
        return undefined;
    }
    return {
        targetDirectory,
        diagnosis,
        coaching,
        drillSpec,
        drillSession,
        drillError
    };
}
function buildSummary(endReason, combatEventsPath, attemptSummaryPath, sourceEvents) {
    const first = sourceEvents[0];
    const last = sourceEvents[sourceEvents.length - 1];
    const damageEvents = sourceEvents.filter((event) => event.event_type === "damage");
    const playerDamageEvents = damageEvents.filter((event) => { var _a; return ((_a = event.target) === null || _a === void 0 ? void 0 : _a.role) === "player"; });
    const enemyDamageEvents = damageEvents.filter((event) => { var _a; return ((_a = event.target) === null || _a === void 0 ? void 0 : _a.role) === "enemy"; });
    const eventCounts = {};
    for (const event of sourceEvents) {
        eventCounts[event.event_type] = (eventCounts[event.event_type] || 0) + 1;
    }
    return {
        schema_version: "guidebuddy.attempt_summary.v1",
        run_id: runId,
        map: String(initialContext.map || ""),
        start_time: (first === null || first === void 0 ? void 0 : first.iso_time) || "",
        end_time: (last === null || last === void 0 ? void 0 : last.iso_time) || "",
        duration_seconds: Math.max(0, Number((last === null || last === void 0 ? void 0 : last.time_seconds) || 0) - Number((first === null || first === void 0 ? void 0 : first.time_seconds) || 0)),
        end_reason: endReason,
        death_info: deathInfo || null,
        last_events: sourceEvents.slice(Math.max(0, sourceEvents.length - 20)),
        damage_summary: {
            hits_taken: playerDamageEvents.length,
            total_damage_taken: sumNumberField(playerDamageEvents, "damage_amount"),
            hits_dealt: enemyDamageEvents.length,
            total_damage_dealt: sumNumberField(enemyDamageEvents, "damage_amount"),
            fatal_damage: playerDamageEvents.find((event) => event.is_fatal === true) || null
        },
        event_counts: eventCounts,
        output_files: {
            combat_events_jsonl: combatEventsPath,
            attempt_summary_json: attemptSummaryPath
        }
    };
}
function buildRuntimeDiagnosis(targetDirectory, combatEventsPath, attemptSummaryPath, sourceEvents, summary) {
    const terminal = findRuntimeTerminalFailure(sourceEvents, summary);
    const evidenceEvents = terminal ? selectRuntimeEvidenceEvents(sourceEvents, terminal) : selectRuntimeFallbackEvidenceEvents(sourceEvents);
    const classification = terminal
        ? classifyRuntimeTerminalFailure(sourceEvents, terminal, evidenceEvents)
        : {
            primary_failure: "insufficient_evidence",
            category: "unknown",
            confidence: 0,
            summary: `No terminal death or obvious failure was found. end_reason=${String(summary.end_reason || "unknown")}.`,
            signals: []
        };
    const evidenceWindow = buildRuntimeEvidenceWindow(evidenceEvents);
    const practiceObjectiveSeed = {
        focus: `avoid_${classification.primary_failure}`,
        target_error: classification.primary_failure,
        evidence_window: evidenceWindow,
        candidate_drill_focuses: candidateRuntimeFocuses(classification.primary_failure),
        measurable_metrics: runtimeMetricsFor(classification.primary_failure),
        evidence_event_seqs: evidenceEvents.map((event) => event.seq)
    };
    const readableZh = buildRuntimeReadableZh(classification, terminal, evidenceEvents, evidenceWindow);
    return {
        schema_version: "guidebuddy.diagnosis.v1",
        run_id: runId,
        generated_at: new Date().toISOString(),
        source_files: {
            run_directory: targetDirectory,
            combat_events_jsonl: combatEventsPath,
            attempt_summary_json: attemptSummaryPath
        },
        readable_zh: readableZh,
        deterministic: {
            status: terminal ? "diagnosed" : "insufficient_evidence",
            primary_failure: classification.primary_failure,
            category: classification.category,
            confidence: classification.confidence,
            evidence_event_seqs: evidenceEvents.map((event) => event.seq),
            evidence_window: evidenceWindow,
            terminal: terminal ? {
                event_seq: terminal.event.seq,
                event_type: terminal.event.event_type,
                time_seconds: terminal.event.time_seconds,
                terminal_tag: terminal.tag,
                reason: terminal.reason
            } : null,
            source: terminal ? normalizeRuntimeSource(terminal.source, evidenceEvents) : null,
            signals: classification.signals,
            summary: classification.summary
        },
        llm_review: {
            enabled: false,
            status: "not_configured",
            input_summary: {
                deterministic_primary_failure: classification.primary_failure,
                confidence: classification.confidence,
                evidence_event_seqs: evidenceEvents.map((event) => event.seq)
            },
            output: null
        },
        final: {
            status: terminal ? "diagnosed" : "insufficient_evidence",
            primary_failure: classification.primary_failure,
            confidence: classification.confidence,
            summary: classification.summary,
            practice_objective_seed: practiceObjectiveSeed
        }
    };
}
function buildRuntimeReadableZh(classification, terminal, evidenceEvents, evidenceWindow) {
    const primaryFailure = String(classification.primary_failure || "insufficient_evidence");
    const confidence = Number(classification.confidence || 0);
    const failureInfo = runtimeReadableFailureInfoZh(primaryFailure);
    const confidencePercent = Math.round(confidence * 100);
    const signals = Array.isArray(classification.signals) ? classification.signals : [];
    const statusText = terminal ? "已找到可诊断的失败窗口" : "未找到明确死亡或失败窗口";
    return {
        language: "zh-CN",
        status: statusText,
        summary: `${statusText}。本次主要问题：${failureInfo.label}。诊断置信度：${runtimeConfidenceLabelZh(confidence)}（${confidencePercent}%）。`,
        primary_failure_id: primaryFailure,
        primary_failure_label: failureInfo.label,
        category: String(classification.category || "unknown"),
        confidence_label: runtimeConfidenceLabelZh(confidence),
        confidence_percent: confidencePercent,
        evidence_window: evidenceWindow,
        evidence: buildRuntimeReadableEvidenceZh(signals, evidenceEvents),
        practice_suggestion: failureInfo.practiceSuggestion,
        notes: "这是规则诊断生成的中文速读说明；完整机器可读证据仍以 deterministic、final 和原始事件文件为准。"
    };
}
function runtimeReadableFailureInfoZh(primaryFailure) {
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
function runtimeConfidenceLabelZh(confidence) {
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
function buildRuntimeReadableEvidenceZh(signals, evidenceEvents) {
    const lines = signals.map(describeRuntimeSignalZh);
    if (lines.length > 0) {
        return lines;
    }
    if (evidenceEvents.length > 0) {
        return [`已保留 ${evidenceEvents.length} 条候选事件，但还不足以支撑明确归因。`];
    }
    return ["未发现足以支撑明确归因的死亡、受击或敌人动作证据。"];
}
function describeRuntimeSignalZh(signalRecord) {
    const id = String(signalRecord.id || "evidence");
    const seq = String(signalRecord.event_seq || "?");
    const eventType = String(signalRecord.event_type || "unknown_event");
    const tag = String(signalRecord.tag || "");
    const role = String(signalRecord.actor_role || "");
    const timeSeconds = Number(signalRecord.time_seconds);
    const tagText = tag.length > 0 ? `，标签 ${tag}` : "";
    const roleText = role.length > 0 ? `，角色 ${role}` : "";
    const timeText = Number.isFinite(timeSeconds) ? `，时间 ${timeSeconds.toFixed(2)}s` : "";
    return `${runtimeSignalLabelZh(id)}：事件 #${seq}，类型 ${eventType}${tagText}${roleText}${timeText}。`;
}
function runtimeSignalLabelZh(id) {
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
function findRuntimeTerminalFailure(sourceEvents, summary) {
    const summaryDeathInfo = summary.death_info;
    if (summaryDeathInfo) {
        const terminalEvent = findEventBySeq(sourceEvents, Number(summaryDeathInfo.terminal_event_seq || summaryDeathInfo.event_seq || 0));
        if (terminalEvent) {
            return {
                event: terminalEvent,
                tag: String(summaryDeathInfo.terminal_tag || getEventTag(terminalEvent)),
                source: summaryDeathInfo.source,
                reason: String(summaryDeathInfo.death_reason || "player_death")
            };
        }
    }
    const deathEvent = sourceEvents.find((event) => event.event_type === "death");
    if (deathEvent) {
        return {
            event: findEventBySeq(sourceEvents, Number(deathEvent.terminal_event_seq || 0)) || deathEvent,
            tag: String(deathEvent.terminal_tag || getEventTag(deathEvent)),
            source: deathEvent.source,
            reason: String(deathEvent.death_reason || "player_death")
        };
    }
    const deathState = sourceEvents.find((event) => event.event_type === "state_activated" &&
        getActorRoleFromValue(event.actor) === "player" &&
        isDeathStateTag(getEventTag(event)));
    if (deathState) {
        return {
            event: deathState,
            tag: getEventTag(deathState),
            reason: "state_death"
        };
    }
    const fatalDamage = sourceEvents.find((event) => event.event_type === "damage" &&
        getActorRoleFromValue(event.target) === "player" &&
        event.is_fatal === true);
    if (fatalDamage) {
        return {
            event: fatalDamage,
            tag: getEventTag(fatalDamage),
            source: fatalDamage.source,
            reason: "health_depleted"
        };
    }
    return findLatestPlayerDamage(sourceEvents);
}
function findLatestPlayerDamage(sourceEvents) {
    for (let index = sourceEvents.length - 1; index >= 0; index -= 1) {
        const event = sourceEvents[index];
        if (event.event_type === "damage" && getActorRoleFromValue(event.target) === "player") {
            return {
                event,
                tag: getEventTag(event),
                source: event.source,
                reason: "recent_player_damage"
            };
        }
    }
    return undefined;
}
function classifyRuntimeTerminalFailure(sourceEvents, terminal, evidenceEvents) {
    var _a, _b, _c;
    const terminalTime = terminal.event.time_seconds;
    const executionEvent = evidenceEvents.find((event) => getEventTag(event).toLowerCase().includes("execut") &&
        Math.abs(event.time_seconds - terminalTime) <= 1);
    const sourceEvent = executionEvent ||
        runtimeSourceToEvent(sourceEvents, terminal.source) ||
        findRecentRuntimeEnemyAttack(evidenceEvents, terminalTime);
    const recentPlayerAttack = findRecentRuntimePlayerAttack(evidenceEvents, (_a = sourceEvent === null || sourceEvent === void 0 ? void 0 : sourceEvent.time_seconds) !== null && _a !== void 0 ? _a : terminalTime);
    const recentDodge = findRecentRuntimeDodge(evidenceEvents, (_b = sourceEvent === null || sourceEvent === void 0 ? void 0 : sourceEvent.time_seconds) !== null && _b !== void 0 ? _b : terminalTime);
    const hasExecution = Boolean(executionEvent) ||
        String(((_c = terminal.source) === null || _c === void 0 ? void 0 : _c.tag) || "").toLowerCase().includes("execut") ||
        terminal.tag.toLowerCase().includes("execut");
    if (hasExecution) {
        return {
            primary_failure: "posture_break_into_execution",
            category: "fatal_attack_attribution",
            confidence: 0.88,
            summary: "Player failure is attributed to a terminal death state followed by an enemy execution signal.",
            signals: compactRuntimeSignals([
                runtimeSignal("terminal_death_state", terminal.event, 0.9),
                executionEvent ? runtimeSignal("enemy_execution_signal", executionEvent, 0.88) : undefined
            ])
        };
    }
    if (recentPlayerAttack && sourceEvent && Math.abs(sourceEvent.time_seconds - recentPlayerAttack.time_seconds) <= 1.2) {
        return {
            primary_failure: "overcommit_into_enemy_attack",
            category: "overcommitment",
            confidence: 0.74,
            summary: "Player attack commitment occurred close to the enemy action that caused the failure window.",
            signals: compactRuntimeSignals([
                runtimeSignal("recent_player_attack_commitment", recentPlayerAttack, 0.74),
                runtimeSignal("enemy_attack_signal", sourceEvent, 0.72)
            ])
        };
    }
    if (sourceEvent && !recentDodge && isRuntimeEnemyAttackLike(sourceEvent)) {
        return {
            primary_failure: "missed_or_late_dodge",
            category: "dodge_timing",
            confidence: 0.68,
            summary: "Enemy attack evidence exists near the failure window, but no Dodge_Input was observed before the request.",
            signals: compactRuntimeSignals([
                runtimeSignal("enemy_attack_signal", sourceEvent, 0.68),
                runtimeSignal("missing_recent_dodge_input", terminal.event, 0.62)
            ])
        };
    }
    if (sourceEvent) {
        return {
            primary_failure: "fatal_attack_attribution",
            category: "fatal_attack_attribution",
            confidence: 0.64,
            summary: "The failure window is attributable to the nearest enemy attack-like signal, but finer timing evidence is limited.",
            signals: compactRuntimeSignals([
                runtimeSignal("enemy_attack_signal", sourceEvent, 0.64),
                runtimeSignal("terminal_failure", terminal.event, 0.7)
            ])
        };
    }
    return {
        primary_failure: "insufficient_evidence",
        category: "unknown",
        confidence: 0,
        summary: "A failure-like event was observed, but nearby enemy action evidence was not strong enough for attribution.",
        signals: compactRuntimeSignals([
            runtimeSignal("terminal_failure", terminal.event, 0.5)
        ])
    };
}
function selectRuntimeEvidenceEvents(sourceEvents, terminal) {
    const windowStart = terminal.event.time_seconds - 4;
    const windowEnd = terminal.event.time_seconds + 0.8;
    const selected = sourceEvents.filter((event) => event.time_seconds >= windowStart &&
        event.time_seconds <= windowEnd &&
        isRuntimeDiagnosisEvidenceEvent(event));
    if (!selected.some((event) => event.seq === terminal.event.seq)) {
        selected.push(terminal.event);
    }
    return selected.sort((left, right) => left.seq - right.seq).slice(Math.max(0, selected.length - 32));
}
function selectRuntimeFallbackEvidenceEvents(sourceEvents) {
    return sourceEvents.filter(isRuntimeDiagnosisEvidenceEvent).slice(Math.max(0, sourceEvents.length - 24));
}
function isRuntimeDiagnosisEvidenceEvent(event) {
    if (event.event_type === "damage" || event.event_type === "death") {
        return true;
    }
    if (event.event_type === "ability_activated" ||
        event.event_type === "state_activated" ||
        event.event_type === "combat_status_changed" ||
        event.event_type === "attribute_changed") {
        return true;
    }
    if (event.event_type === "player_input") {
        const inputName = String(event.input_name || "").toLowerCase();
        return inputName.includes("attack") || inputName.includes("dodge") || inputName.includes("block") || inputName.includes("guard");
    }
    return event.event_type === "guide_request";
}
function buildRuntimeEvidenceWindow(evidenceEvents) {
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
function normalizeRuntimeSource(source, evidenceEvents) {
    var _a, _b;
    if (!source) {
        const sourceEvent = findRecentRuntimeEnemyAttack(evidenceEvents, ((_a = evidenceEvents[evidenceEvents.length - 1]) === null || _a === void 0 ? void 0 : _a.time_seconds) || 0);
        return sourceEvent ? {
            event_seq: sourceEvent.seq,
            event_type: sourceEvent.event_type,
            time_seconds: sourceEvent.time_seconds,
            actor_name: sourceEvent.actor_name || ((_b = sourceEvent.actor) === null || _b === void 0 ? void 0 : _b.name),
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
function runtimeSourceToEvent(sourceEvents, source) {
    if (!source) {
        return undefined;
    }
    const sourceTime = Number(source.time_seconds);
    const sourceTag = String(source.tag || "");
    if (!Number.isFinite(sourceTime)) {
        return undefined;
    }
    return sourceEvents.find((event) => Math.abs(event.time_seconds - sourceTime) <= 0.05 &&
        (!sourceTag || getEventTag(event) === sourceTag));
}
function findRecentRuntimeEnemyAttack(evidenceEvents, anchorTime) {
    for (let index = evidenceEvents.length - 1; index >= 0; index -= 1) {
        const event = evidenceEvents[index];
        if (event.time_seconds > anchorTime + 0.8) {
            continue;
        }
        if (anchorTime - event.time_seconds > 4) {
            break;
        }
        if (getActorRoleFromValue(event.actor) === "enemy" && isRuntimeEnemyAttackLike(event)) {
            return event;
        }
    }
    return undefined;
}
function findRecentRuntimePlayerAttack(evidenceEvents, anchorTime) {
    for (let index = evidenceEvents.length - 1; index >= 0; index -= 1) {
        const event = evidenceEvents[index];
        if (event.time_seconds > anchorTime + 0.2) {
            continue;
        }
        if (anchorTime - event.time_seconds > 1.2) {
            break;
        }
        const inputName = String(event.input_name || "").toLowerCase();
        const isPlayer = event.role === "player" || getActorRoleFromValue(event.actor) === "player";
        if (isPlayer && (getEventTag(event).toLowerCase().includes("attack") || inputName.includes("attack"))) {
            return event;
        }
    }
    return undefined;
}
function findRecentRuntimeDodge(evidenceEvents, anchorTime) {
    for (let index = evidenceEvents.length - 1; index >= 0; index -= 1) {
        const event = evidenceEvents[index];
        if (event.time_seconds > anchorTime + 0.2) {
            continue;
        }
        if (anchorTime - event.time_seconds > 1.5) {
            break;
        }
        if (event.event_type === "player_input" && String(event.input_name || "").toLowerCase().includes("dodge")) {
            return event;
        }
    }
    return undefined;
}
function isRuntimeEnemyAttackLike(event) {
    const tag = getEventTag(event).toLowerCase();
    return tag.includes("attack") || tag.includes("execut") || tag.includes("riposte") || tag.includes("hit");
}
function findEventBySeq(sourceEvents, seq) {
    if (!Number.isFinite(seq) || seq <= 0) {
        return undefined;
    }
    return sourceEvents.find((event) => event.seq === seq);
}
function getActorRoleFromValue(value) {
    const actor = value;
    return (actor === null || actor === void 0 ? void 0 : actor.role) || "";
}
function runtimeSignal(id, event, confidence) {
    return {
        id,
        event_seq: event.seq,
        event_type: event.event_type,
        time_seconds: event.time_seconds,
        tag: getEventTag(event) || String(event.input_name || ""),
        actor_role: String(event.role || getActorRoleFromValue(event.actor) || getActorRoleFromValue(event.target)),
        confidence
    };
}
function compactRuntimeSignals(values) {
    return values.filter((value) => Boolean(value));
}
function candidateRuntimeFocuses(primaryFailure) {
    const failure = String(primaryFailure || "");
    if (failure === "posture_break_into_execution") {
        return ["avoid_execution_setup", "recover_before_terminal_state", "respond_to_enemy_special_attack"];
    }
    if (failure === "overcommit_into_enemy_attack") {
        return ["shorten_attack_commitment", "stop_attacking_during_enemy_windup", "defensive_cancel_timing"];
    }
    if (failure === "missed_or_late_dodge") {
        return ["dodge_timing", "enemy_windup_recognition", "single_attack_reaction_window"];
    }
    if (failure === "fatal_attack_attribution") {
        return ["identify_failure_source", "survive_last_damage_window"];
    }
    return ["collect_more_failure_evidence"];
}
function runtimeMetricsFor(primaryFailure) {
    const failure = String(primaryFailure || "");
    if (failure === "posture_break_into_execution") {
        return [
            { id: "terminal_execution_count", unit: "count", direction: "lower_is_better" },
            { id: "defensive_input_before_execution_window", unit: "boolean", direction: "higher_is_better" }
        ];
    }
    if (failure === "overcommit_into_enemy_attack") {
        return [
            { id: "player_attack_within_1s_before_enemy_hit", unit: "count", direction: "lower_is_better" },
            { id: "defensive_input_after_enemy_windup", unit: "count", direction: "higher_is_better" }
        ];
    }
    if (failure === "missed_or_late_dodge") {
        return [
            { id: "dodge_input_latency_after_enemy_attack", unit: "seconds", direction: "lower_is_better" },
            { id: "enemy_attack_windows_without_dodge", unit: "count", direction: "lower_is_better" }
        ];
    }
    return [
        { id: "diagnosable_failure_windows", unit: "count", direction: "higher_is_better" }
    ];
}
function formatDiagnosisSavedMessage(prefix, result) {
    var _a;
    const finalDiagnosis = result.diagnosis.final;
    const reviewCard = result.coaching.review_card;
    const primaryFailure = String((finalDiagnosis === null || finalDiagnosis === void 0 ? void 0 : finalDiagnosis.primary_failure) || "unknown");
    const confidence = Number((finalDiagnosis === null || finalDiagnosis === void 0 ? void 0 : finalDiagnosis.confidence) || 0);
    const focus = String(((_a = finalDiagnosis === null || finalDiagnosis === void 0 ? void 0 : finalDiagnosis.practice_objective_seed) === null || _a === void 0 ? void 0 : _a.focus) || "");
    const action = String((reviewCard === null || reviewCard === void 0 ? void 0 : reviewCard.next_action) || "");
    const shortFocus = focus.length > 0 ? ` Focus: ${focus}.` : "";
    const shortAction = action.length > 0 ? ` Coaching ready.` : "";
    const drillStatus = result.drillSpec ? " Drill ready." : result.drillError ? " Drill skipped." : "";
    return `${prefix}: ${primaryFailure} (${Math.round(confidence * 100)}%).${shortFocus}${shortAction}${drillStatus}`;
}
function showCoachingCard(result) {
    var _a;
    const reviewCard = result.coaching.review_card;
    if (!reviewCard) {
        return;
    }
    const nextAction = String(reviewCard.next_action || "");
    const successCondition = String(reviewCard.success_condition || "");
    if (nextAction.length > 0) {
        showRuntimeStatus(`Coaching: ${nextAction}`, true);
    }
    if (successCondition.length > 0) {
        showRuntimeStatus(`Goal: ${successCondition}`, true);
    }
    if (typeof bridge.ShowCoachingReviewCard === "function") {
        bridge.ShowCoachingReviewCard(String(reviewCard.title || "复盘结果"), String(reviewCard.diagnosis_sentence || ""), String(reviewCard.evidence_line || ""), nextAction, successCondition, String(((_a = result.coaching.drill_spec_candidate) === null || _a === void 0 ? void 0 : _a.template_id) || ""));
    }
}
function showBattleEndMenu() {
    if (typeof bridge.ShowBattleEndMenu === "function") {
        bridge.ShowBattleEndMenu("战斗结束", "这一局已经记录完成。重新挑战会重置当前场景；复盘一下会自动生成诊断、导玩建议和针对性练习配置。");
        return;
    }
    showRuntimeStatus("Battle ended. Review UI is unavailable on this bridge; restart the editor after rebuilding GuideBuddyRuntime.", false);
}
function sumNumberField(sourceEvents, fieldName) {
    return sourceEvents.reduce((total, event) => total + Number(event[fieldName] || 0), 0);
}
function isHealthAttribute(attributeTag) {
    return attributeTag === "Attribute.Health" || attributeTag.toLowerCase().includes("health");
}
function isDeathStateTag(stateTag) {
    return stateTag === "State.Death" || stateTag.toLowerCase() === "death";
}
function getEventTag(event) {
    return String(event.ability_tag || event.state_tag || event.combat_status_tag || event.attribute_tag || "");
}
function parseJsonObject(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch (error) {
        console.error("[GuideBuddy] Failed to parse JSON:", error);
    }
    return {};
}
function createRunId(mapName) {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const safeMap = mapName.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "unknown_map";
    const suffix = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    return `${timestamp}_${safeMap}_${suffix}`;
}
function normalizePath(pathValue) {
    return pathValue.replace(/\\/g, "/").replace(/\/+$/g, "");
}
function joinPath(...parts) {
    return normalizePath(parts.filter((part) => part.length > 0).join("/"));
}
function showRuntimeStatus(message, isSuccess) {
    if (typeof bridge.ShowRuntimeStatusMessage === "function") {
        bridge.ShowRuntimeStatusMessage(message, isSuccess);
    }
}
