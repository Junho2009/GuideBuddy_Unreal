"use strict";
const puerts = require("puerts");
const maybeBridge = puerts.argv.getByName("GuideBuddyBridge");
if (!maybeBridge) {
    throw new Error("GuideBuddyBridge argv is required.");
}
const bridge = maybeBridge;
const initialContext = parseJsonObject(bridge.GetInitialContextJson());
const runId = createRunId(String(initialContext.map || "unknown-map"));
const telemetryRoot = normalizePath(bridge.GetTelemetryRootDirectory());
const runDirectory = joinPath(telemetryRoot, runId);
const events = [];
let sequence = 0;
let finalized = false;
let lastEnemyAction;
let deathInfo;
bridge.CreateDirectoryTree(runDirectory);
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
        finalize(String(payload.reason || "bridge_shutdown"), signal);
        return;
    }
    if (signalType === "player_input") {
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
        deathInfo = {
            event_seq: damageEvent.seq,
            time_seconds: damageEvent.time_seconds,
            iso_time: damageEvent.iso_time,
            actor,
            source,
            remaining_health: newValue
        };
        recordEvent("death", {
            actor,
            source,
            damage_event_seq: damageEvent.seq
        }, signalToEventOverride(signal));
        finalize("player_death", signal);
    }
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
    const combatEventsPath = joinPath(runDirectory, "combat_events.jsonl");
    const attemptSummaryPath = joinPath(runDirectory, "attempt_summary.json");
    const summary = buildSummary(endReason, combatEventsPath, attemptSummaryPath);
    const jsonl = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
    bridge.CreateDirectoryTree(runDirectory);
    const wroteEvents = bridge.WriteUtf8File(combatEventsPath, jsonl);
    const wroteSummary = bridge.WriteUtf8File(attemptSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    if (!wroteEvents || !wroteSummary) {
        console.error(`[GuideBuddy] Telemetry write failed: ${bridge.GetLastError()}`);
        return;
    }
    console.log(`[GuideBuddy] MVP01 telemetry written: ${runDirectory}`);
}
function buildSummary(endReason, combatEventsPath, attemptSummaryPath) {
    const first = events[0];
    const last = events[events.length - 1];
    const damageEvents = events.filter((event) => event.event_type === "damage");
    const playerDamageEvents = damageEvents.filter((event) => { var _a; return ((_a = event.target) === null || _a === void 0 ? void 0 : _a.role) === "player"; });
    const enemyDamageEvents = damageEvents.filter((event) => { var _a; return ((_a = event.target) === null || _a === void 0 ? void 0 : _a.role) === "enemy"; });
    const eventCounts = {};
    for (const event of events) {
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
        last_events: events.slice(Math.max(0, events.length - 20)),
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
function sumNumberField(sourceEvents, fieldName) {
    return sourceEvents.reduce((total, event) => total + Number(event[fieldName] || 0), 0);
}
function isHealthAttribute(attributeTag) {
    return attributeTag === "Attribute.Health" || attributeTag.toLowerCase().includes("health");
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
