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
const runtimeEvidencePath = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  "MVP02_DIAGNOSTIC_SIGNAL_LAYER",
  "v0.1",
  "run-001",
  "runtime_request_verifier.json"
);

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  process.exit(1);
}

function toDisplayPath(filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, "/");
  }

  return path.normalize(filePath).replace(/\\/g, "/");
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

function verifyReadableZh(diagnosis) {
  const readableZh = diagnosis.readable_zh || {};
  const summary = readableZh.summary;
  const practiceSuggestion = readableZh.practice_suggestion;
  const evidence = readableZh.evidence;

  if (readableZh.language !== "zh-CN") {
    fail("Runtime guide request diagnosis is missing readable_zh.language=zh-CN.", {
      readable_zh: readableZh
    });
  }

  if (typeof summary !== "string" || !/[\u4e00-\u9fff]/.test(summary)) {
    fail("Runtime guide request diagnosis is missing a Chinese readable_zh.summary.", {
      summary
    });
  }

  if (typeof practiceSuggestion !== "string" || !/[\u4e00-\u9fff]/.test(practiceSuggestion)) {
    fail("Runtime guide request diagnosis is missing a Chinese readable_zh.practice_suggestion.", {
      practice_suggestion: practiceSuggestion
    });
  }

  if (!Array.isArray(evidence) || evidence.length === 0 || !evidence.some((line) => typeof line === "string" && /[\u4e00-\u9fff]/.test(line))) {
    fail("Runtime guide request diagnosis is missing Chinese readable_zh.evidence lines.", {
      evidence
    });
  }

  return summary;
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

function runRuntimeGuideRequestReplay(events) {
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
        telemetry_root: "Z:/GuideBuddy/RuntimeRequestTest",
        player: {}
      });
    },
    GetTelemetryRootDirectory() {
      return "Z:/GuideBuddy/RuntimeRequestTest";
    },
    CreateDirectoryTree() {
      return true;
    },
    WriteUtf8File(absolutePath, contents) {
      writtenFiles.set(absolutePath.replace(/\\/g, "/"), contents);
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

  const lastEvent = events[events.length - 1];
  telemetryCallback(JSON.stringify({
    signal_type: "guide_request",
    schema_version: "guidebuddy.telemetry.signal.v1",
    time_seconds: Number(lastEvent.time_seconds || 0) + 0.25,
    iso_time: String(lastEvent.iso_time || ""),
    map: String(lastEvent.map || "UEDPIE_0_SampleDemoShowcaseMap"),
    payload: {
      source: "keyboard_f10",
      reason: "player_requested_guidance",
      button: "F10",
      actor: {
        role: "player",
        name: "BP_GhostSamuraiCharacter_C_0"
      }
    }
  }));

  return writtenFiles;
}

if (!fs.existsSync(runtimePath)) {
  fail(`Compiled runtime does not exist. Run npm run build:guidebuddy first: ${runtimePath}`);
}

if (!fs.existsSync(fixtureEventsPath)) {
  fail(`Missing runtime request fixture: ${fixtureEventsPath}`);
}

const fixtureEvents = readJsonl(fixtureEventsPath)
  .filter((event) => Number(event.seq || 0) <= 545);
const writtenFiles = runRuntimeGuideRequestReplay(fixtureEvents);
const diagnosisEntry = [...writtenFiles.entries()]
  .find(([filePath]) => filePath.includes("/guide_requests/request-001/diagnosis.json"));
const eventsEntry = [...writtenFiles.entries()]
  .find(([filePath]) => filePath.includes("/guide_requests/request-001/combat_events.jsonl"));
const summaryEntry = [...writtenFiles.entries()]
  .find(([filePath]) => filePath.includes("/guide_requests/request-001/attempt_summary.json"));

if (!diagnosisEntry || !eventsEntry || !summaryEntry) {
  fail("Runtime guide request did not write all expected snapshot files.", {
    wrote_diagnosis: Boolean(diagnosisEntry),
    wrote_events: Boolean(eventsEntry),
    wrote_summary: Boolean(summaryEntry),
    written_files: [...writtenFiles.keys()]
  });
}

const diagnosis = JSON.parse(diagnosisEntry[1]);
const snapshotEvents = eventsEntry[1].trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const snapshotSummary = JSON.parse(summaryEntry[1]);

if (diagnosis.schema_version !== "guidebuddy.diagnosis.v1") {
  fail("Runtime guide request diagnosis has unexpected schema_version.", {
    schema_version: diagnosis.schema_version
  });
}

if (!diagnosis.final || diagnosis.final.primary_failure === "insufficient_evidence") {
  fail("Runtime guide request should diagnose the recent player damage window.", {
    final: diagnosis.final
  });
}

if (!Array.isArray(diagnosis.deterministic?.evidence_event_seqs) || diagnosis.deterministic.evidence_event_seqs.length === 0) {
  fail("Runtime guide request diagnosis did not preserve evidence_event_seqs.");
}

const readableZhSummary = verifyReadableZh(diagnosis);

if (!snapshotEvents.some((event) => event.event_type === "guide_request")) {
  fail("Runtime guide request snapshot did not include guide_request event.");
}

if (snapshotSummary.end_reason !== "guide_request") {
  fail("Runtime guide request summary should end with guide_request.", {
    end_reason: snapshotSummary.end_reason
  });
}

const stableEvidence = {
  ok: true,
  fixture: toDisplayPath(fixtureEventsPath),
  replayed_events: fixtureEvents.length,
  snapshot_events: snapshotEvents.length,
  expected_snapshot_suffix: "guide_requests/request-001/diagnosis.json",
  primary_failure: diagnosis.final.primary_failure,
  confidence: diagnosis.final.confidence,
  readable_zh_summary: readableZhSummary,
  end_reason: snapshotSummary.end_reason
};

fs.mkdirSync(path.dirname(runtimeEvidencePath), { recursive: true });
fs.writeFileSync(runtimeEvidencePath, `${JSON.stringify(stableEvidence, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ...stableEvidence,
  diagnosis_path: diagnosisEntry[0],
  runtime_evidence: toDisplayPath(runtimeEvidencePath)
}, null, 2));
