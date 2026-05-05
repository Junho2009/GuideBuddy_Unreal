type JsonRecord = Record<string, unknown>;

interface TelemetrySignal {
  signal_type: string;
  schema_version?: string;
  time_seconds: number;
  iso_time: string;
  map: string;
  payload: JsonRecord;
}

interface ActorInfo extends JsonRecord {
  role?: string;
  name?: string;
  path?: string;
  class_name?: string;
}

interface CombatEvent extends JsonRecord {
  schema_version: string;
  run_id: string;
  seq: number;
  event_type: string;
  time_seconds: number;
  iso_time: string;
  map: string;
}

interface LastEnemyAction {
  time_seconds: number;
  event_type: string;
  actor_name?: string;
  actor_path?: string;
  tag?: string;
  confidence: "inferred_recent_enemy_action";
}

const puerts = require("puerts") as PuertsModule;
const maybeBridge = puerts.argv.getByName("GuideBuddyBridge") as GuideBuddyBridge | undefined;

if (!maybeBridge) {
  throw new Error("GuideBuddyBridge argv is required.");
}

const bridge = maybeBridge;
const initialContext = parseJsonObject(bridge.GetInitialContextJson());
const runId = createRunId(String(initialContext.map || "unknown-map"));
const telemetryRoot = normalizePath(bridge.GetTelemetryRootDirectory());
const runDirectory = joinPath(telemetryRoot, runId);
const events: CombatEvent[] = [];
let sequence = 0;
let finalized = false;
let lastEnemyAction: LastEnemyAction | undefined;
let deathInfo: JsonRecord | undefined;

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

bridge.OnTelemetrySignal.Add((signalJson: string) => {
  handleSignal(signalJson);
});

console.log(`[GuideBuddy] MVP01 telemetry started: ${runId}`);

function handleSignal(signalJson: string): void {
  if (finalized) {
    return;
  }

  const signal = parseJsonObject(signalJson) as unknown as TelemetrySignal;
  const signalType = String(signal.signal_type || "");
  const payload = (signal.payload || {}) as JsonRecord;

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
    rememberEnemyAction(event, payload.actor as ActorInfo | undefined, String(payload.ability_tag || ""));
    return;
  }

  if (signalType === "state_activated") {
    const event = recordEvent("state_activated", flattenPayload(signal, {
      actor: payload.actor,
      state: payload.state,
      state_tag: payload.state_tag,
      change_type: payload.change_type
    }));
    rememberEnemyAction(event, payload.actor as ActorInfo | undefined, String(payload.state_tag || ""));
    maybeRecordPlayerStateDeath(signal, event, payload.actor as ActorInfo | undefined, String(payload.state_tag || ""));
    return;
  }

  if (signalType === "combat_status_changed") {
    const event = recordEvent("combat_status_changed", flattenPayload(signal, {
      actor: payload.actor,
      combat_status_tag: payload.combat_status_tag,
      change_type: payload.change_type
    }));
    rememberEnemyAction(event, payload.actor as ActorInfo | undefined, String(payload.combat_status_tag || ""));
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

function maybeRecordDamage(signal: TelemetrySignal, payload: JsonRecord, attributeEvent: CombatEvent): void {
  const attributeTag = String(payload.attribute_tag || "");
  const delta = Number(payload.delta || 0);
  const newValue = Number(payload.new_value || 0);
  const actor = (payload.actor || {}) as ActorInfo;

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
  }
}

function maybeRecordPlayerStateDeath(signal: TelemetrySignal, terminalEvent: CombatEvent, actor: ActorInfo | undefined, stateTag: string): void {
  if (!actor || actor.role !== "player" || deathInfo || !isDeathStateTag(stateTag)) {
    return;
  }

  recordPlayerDeath(signal, terminalEvent, actor, "state_death", inferTerminalDeathSource(terminalEvent.time_seconds));
}

function recordPlayerDeath(
  signal: TelemetrySignal,
  terminalEvent: CombatEvent,
  actor: ActorInfo,
  deathReason: string,
  source: LastEnemyAction | undefined,
  extra: JsonRecord = {}
): void {
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

  finalize("player_death", signal);
}

function inferTerminalDeathSource(timeSeconds: number): LastEnemyAction | undefined {
  const recentSource = inferDamageSource(timeSeconds);
  if (recentSource) {
    return recentSource;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const actor = event.actor as ActorInfo | undefined;
    const tag = getEventTag(event).toLowerCase();
    const isEnemy = event.role === "enemy" || actor?.role === "enemy";
    const isRelevant = tag.includes("attack") || tag.includes("execution") || tag.includes("riposte") || tag.includes("no block");

    if (timeSeconds - event.time_seconds > 4) {
      break;
    }

    if (isEnemy && isRelevant) {
      return {
        time_seconds: event.time_seconds,
        event_type: event.event_type,
        actor_name: typeof event.actor_name === "string" ? event.actor_name : actor?.name,
        actor_path: typeof event.actor_path === "string" ? event.actor_path : actor?.path,
        tag: getEventTag(event),
        confidence: "inferred_recent_enemy_action"
      };
    }
  }

  return undefined;
}

function selectDeathEvidenceEvents(terminalEvent: CombatEvent): CombatEvent[] {
  const windowStart = terminalEvent.time_seconds - 4;
  const evidenceEvents = events.filter((event) =>
    event.seq <= terminalEvent.seq &&
    event.time_seconds >= windowStart &&
    isDeathEvidenceEvent(event));

  return evidenceEvents.slice(Math.max(0, evidenceEvents.length - 24));
}

function isDeathEvidenceEvent(event: CombatEvent): boolean {
  return event.event_type === "damage" ||
    event.event_type === "attribute_changed" ||
    event.event_type === "combat_status_changed" ||
    event.event_type === "ability_activated" ||
    event.event_type === "state_activated";
}

function inferDamageSource(timeSeconds: number): LastEnemyAction | undefined {
  if (!lastEnemyAction) {
    return undefined;
  }

  if (timeSeconds - lastEnemyAction.time_seconds > 3) {
    return undefined;
  }

  return lastEnemyAction;
}

function rememberEnemyAction(event: CombatEvent, actor: ActorInfo | undefined, tag: string): void {
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

function recordEvent(eventType: string, payload: JsonRecord, override?: Partial<CombatEvent>): CombatEvent {
  const event: CombatEvent = {
    schema_version: "guidebuddy.combat_event.v1",
    run_id: runId,
    seq: ++sequence,
    event_type: eventType,
    time_seconds: Number(override?.time_seconds ?? payload.time_seconds ?? 0),
    iso_time: String(override?.iso_time ?? payload.iso_time ?? new Date().toISOString()),
    map: String(override?.map ?? payload.map ?? initialContext.map ?? ""),
    ...payload
  };

  events.push(event);
  return event;
}

function flattenPayload(signal: TelemetrySignal, payload: JsonRecord): JsonRecord {
  const actor = payload.actor as ActorInfo | undefined;
  return {
    time_seconds: signal.time_seconds,
    iso_time: signal.iso_time,
    map: signal.map,
    actor,
    role: actor?.role || "unknown",
    actor_name: actor?.name || "",
    actor_path: actor?.path || "",
    ...payload
  };
}

function signalToEventOverride(signal: TelemetrySignal): Partial<CombatEvent> {
  return {
    time_seconds: signal.time_seconds,
    iso_time: signal.iso_time,
    map: signal.map
  };
}

function finalize(endReason: string, signal?: TelemetrySignal): void {
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

function buildSummary(endReason: string, combatEventsPath: string, attemptSummaryPath: string): JsonRecord {
  const first = events[0];
  const last = events[events.length - 1];
  const damageEvents = events.filter((event) => event.event_type === "damage");
  const playerDamageEvents = damageEvents.filter((event) => (event.target as ActorInfo | undefined)?.role === "player");
  const enemyDamageEvents = damageEvents.filter((event) => (event.target as ActorInfo | undefined)?.role === "enemy");
  const eventCounts: Record<string, number> = {};

  for (const event of events) {
    eventCounts[event.event_type] = (eventCounts[event.event_type] || 0) + 1;
  }

  return {
    schema_version: "guidebuddy.attempt_summary.v1",
    run_id: runId,
    map: String(initialContext.map || ""),
    start_time: first?.iso_time || "",
    end_time: last?.iso_time || "",
    duration_seconds: Math.max(0, Number(last?.time_seconds || 0) - Number(first?.time_seconds || 0)),
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

function sumNumberField(sourceEvents: CombatEvent[], fieldName: string): number {
  return sourceEvents.reduce((total, event) => total + Number(event[fieldName] || 0), 0);
}

function isHealthAttribute(attributeTag: string): boolean {
  return attributeTag === "Attribute.Health" || attributeTag.toLowerCase().includes("health");
}

function isDeathStateTag(stateTag: string): boolean {
  return stateTag === "State.Death" || stateTag.toLowerCase() === "death";
}

function getEventTag(event: CombatEvent): string {
  return String(event.ability_tag || event.state_tag || event.combat_status_tag || event.attribute_tag || "");
}

function parseJsonObject(raw: string): JsonRecord {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonRecord;
    }
  } catch (error) {
    console.error("[GuideBuddy] Failed to parse JSON:", error);
  }
  return {};
}

function createRunId(mapName: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const safeMap = mapName.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "unknown_map";
  const suffix = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `${timestamp}_${safeMap}_${suffix}`;
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter((part) => part.length > 0).join("/"));
}
