const fs = require("fs");
const path = require("path");
const Module = require("module");

const repoRoot = path.resolve(__dirname, "../../..");
const fixtureRoot = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  "MVP01_COMBAT_TELEMETRY_FOUNDATION",
  "v0.1",
  "run-002",
  "raw"
);
const fixtureEventsPath = path.join(fixtureRoot, "combat_events.jsonl");
const runtimePath = path.join(repoRoot, "Content", "JavaScript", "GuideBuddy", "main.js");

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  process.exit(1);
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(`Invalid JSONL at ${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function buildSignal(event) {
  const signal = {
    signal_type: event.event_type,
    schema_version: "guidebuddy.telemetry.signal.v1",
    time_seconds: Number(event.time_seconds || 0),
    iso_time: String(event.iso_time || ""),
    map: String(event.map || "UEDPIE_0_SampleDemoShowcaseMap"),
    payload: {}
  };

  if (event.event_type === "player_input") {
    signal.payload = {
      actor: event.actor,
      input: event.input,
      input_name: event.input_name,
      trigger_event: event.trigger_event,
      watchlist_tag: event.watchlist_tag
    };
    return signal;
  }

  if (event.event_type === "ability_activated") {
    signal.payload = {
      actor: event.actor,
      ability: event.ability,
      ability_tag: event.ability_tag,
      change_type: event.change_type
    };
    return signal;
  }

  if (event.event_type === "state_activated") {
    signal.payload = {
      actor: event.actor,
      state: event.state,
      state_tag: event.state_tag,
      change_type: event.change_type
    };
    return signal;
  }

  if (event.event_type === "combat_status_changed") {
    signal.payload = {
      actor: event.actor,
      combat_status_tag: event.combat_status_tag,
      change_type: event.change_type
    };
    return signal;
  }

  if (event.event_type === "attribute_changed") {
    signal.payload = {
      actor: event.actor,
      attribute: event.attribute,
      attribute_tag: event.attribute_tag,
      old_value: event.old_value,
      new_value: event.new_value,
      delta: event.delta,
      min_value: event.min_value,
      max_value: event.max_value
    };
    return signal;
  }

  return undefined;
}

function runRuntimeReplay(events) {
  const writtenFiles = new Map();
  let telemetryCallback;

  const fakeBridge = {
    OnTelemetrySignal: {
      Add(callback) {
        telemetryCallback = callback;
      }
    },
    GetInitialContextJson() {
      return JSON.stringify({
        schema_version: "guidebuddy.telemetry.context.v1",
        map: "UEDPIE_0_SampleDemoShowcaseMap",
        iso_time: "2026-05-05T07:17:06.647Z",
        telemetry_root: "Z:/GuideBuddy/TestTelemetry",
        player: {}
      });
    },
    GetTelemetryRootDirectory() {
      return "Z:/GuideBuddy/TestTelemetry";
    },
    CreateDirectoryTree() {
      return true;
    },
    WriteUtf8File(absolutePath, contents) {
      writtenFiles.set(path.basename(absolutePath), contents);
      return true;
    },
    GetLastError() {
      return "";
    }
  };

  const fakePuerts = {
    argv: {
      getByName(name) {
        return name === "GuideBuddyBridge" ? fakeBridge : undefined;
      }
    }
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "puerts") {
      return fakePuerts;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[runtimePath];
    require(runtimePath);
  } finally {
    Module._load = originalLoad;
  }

  if (typeof telemetryCallback !== "function") {
    fail("Runtime did not register GuideBuddyBridge.OnTelemetrySignal callback.");
  }

  for (const event of events) {
    const signal = buildSignal(event);
    if (signal) {
      telemetryCallback(JSON.stringify(signal));
    }
  }

  telemetryCallback(JSON.stringify({
    signal_type: "bridge_shutdown",
    schema_version: "guidebuddy.telemetry.signal.v1",
    time_seconds: Number(events[events.length - 1].time_seconds || 0),
    iso_time: String(events[events.length - 1].iso_time || ""),
    map: String(events[events.length - 1].map || "UEDPIE_0_SampleDemoShowcaseMap"),
    payload: {
      reason: "death_regression_replay_finished"
    }
  }));

  const summaryRaw = writtenFiles.get("attempt_summary.json");
  const eventsRaw = writtenFiles.get("combat_events.jsonl");
  if (!summaryRaw || !eventsRaw) {
    fail("Runtime replay did not write both attempt_summary.json and combat_events.jsonl.", {
      wrote_summary: Boolean(summaryRaw),
      wrote_events: Boolean(eventsRaw)
    });
  }

  return {
    summary: JSON.parse(summaryRaw),
    events: eventsRaw.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  };
}

if (!fs.existsSync(runtimePath)) {
  fail(`Compiled runtime does not exist. Run npm run build:guidebuddy first: ${runtimePath}`);
}

if (!fs.existsSync(fixtureEventsPath)) {
  fail(`Missing death regression fixture: ${fixtureEventsPath}`);
}

const fixtureEvents = readJsonl(fixtureEventsPath);
const replay = runRuntimeReplay(fixtureEvents);
const deathEvents = replay.events.filter((event) => event.event_type === "death");
const deathInfo = replay.summary.death_info;

if (!deathInfo) {
  fail("Replayed runtime did not populate death_info for run-002 State.Death.");
}

if (replay.summary.end_reason !== "player_death") {
  fail("Replayed runtime did not end the attempt as player_death.", {
    end_reason: replay.summary.end_reason
  });
}

if (deathEvents.length === 0) {
  fail("Replayed runtime did not emit a death event.");
}

if (deathInfo.terminal_tag !== "State.Death") {
  fail("death_info did not preserve the terminal State.Death tag.", {
    terminal_tag: deathInfo.terminal_tag
  });
}

if (!Array.isArray(deathInfo.evidence_events) || deathInfo.evidence_events.length === 0) {
  fail("death_info does not include evidence_events.");
}

console.log(JSON.stringify({
  ok: true,
  fixture: path.relative(repoRoot, fixtureEventsPath).replace(/\\/g, "/"),
  replayed_events: replay.events.length,
  death_events: deathEvents.length,
  end_reason: replay.summary.end_reason,
  death_reason: deathInfo.death_reason,
  terminal_tag: deathInfo.terminal_tag,
  evidence_events: deathInfo.evidence_events.length
}, null, 2));
