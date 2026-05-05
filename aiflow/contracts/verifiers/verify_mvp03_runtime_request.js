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
  "MVP03_LLM_COACHING_LOOP",
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

function hasChineseText(value) {
  return typeof value === "string" && /[\u4e00-\u9fff]/.test(value);
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
  let battleEndMenuShown = false;
  let coachingCardShown = false;

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
    },
    ShowRuntimeStatusMessage() {
      return undefined;
    },
    ShowBattleEndMenu() {
      battleEndMenuShown = true;
    },
    ShowCoachingReviewCard() {
      coachingCardShown = true;
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
      source: "battle_end_review_button",
      reason: "battle_end_review_requested",
      button: "ReviewButton",
      actor: {
        role: "player",
        name: "BP_GhostSamuraiCharacter_C_0"
      }
    }
  }));

  return { writtenFiles, battleEndMenuShown, coachingCardShown };
}

function runRuntimeEnemyDefeatReplay() {
  const writtenFiles = new Map();
  let telemetryCallback;
  let battleEndMenuShown = false;

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
        iso_time: "2026-05-05T12:35:11.647Z",
        telemetry_root: "Z:/GuideBuddy/RuntimeEnemyDefeatTest",
        player: {}
      });
    },
    GetTelemetryRootDirectory() {
      return "Z:/GuideBuddy/RuntimeEnemyDefeatTest";
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
    },
    ShowRuntimeStatusMessage() {
      return undefined;
    },
    ShowBattleEndMenu() {
      battleEndMenuShown = true;
    },
    ShowCoachingReviewCard() {
      return undefined;
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
    fail("Runtime did not register GuideBuddyBridge.OnTelemetrySignal callback for enemy defeat replay.");
  }

  telemetryCallback(JSON.stringify({
    signal_type: "state_activated",
    schema_version: "guidebuddy.telemetry.signal.v1",
    time_seconds: 12.5,
    iso_time: "2026-05-05T12:35:24.147Z",
    map: "UEDPIE_0_SampleDemoShowcaseMap",
    payload: {
      actor: {
        role: "enemy",
        name: "BP_GS_Enemy_Katana_C_0"
      },
      state: {
        name: "BP_EnemyDeathState_C_0"
      },
      state_tag: "State.Death",
      change_type: "activated"
    }
  }));

  telemetryCallback(JSON.stringify({
    signal_type: "bridge_shutdown",
    schema_version: "guidebuddy.telemetry.signal.v1",
    time_seconds: 13.0,
    iso_time: "2026-05-05T12:35:24.647Z",
    map: "UEDPIE_0_SampleDemoShowcaseMap",
    payload: {
      reason: "world_cleanup"
    }
  }));

  return { writtenFiles, battleEndMenuShown };
}

function verifyCoaching(coaching, diagnosis) {
  const reviewCard = coaching.review_card || {};
  const drillSpec = coaching.drill_spec_candidate || {};
  const provider = coaching.provider || {};

  if (coaching.schema_version !== "guidebuddy.coaching.v1") {
    fail("Runtime guide request coaching has unexpected schema_version.", {
      schema_version: coaching.schema_version
    });
  }

  if (provider.llm_api_called !== false) {
    fail("Runtime guide request must not call a real LLM API in MVP03.", {
      provider
    });
  }

  if (coaching.final?.primary_failure !== diagnosis.final?.primary_failure) {
    fail("Runtime coaching primary failure must follow runtime diagnosis.", {
      coaching_final: coaching.final,
      diagnosis_final: diagnosis.final
    });
  }

  if (!hasChineseText(reviewCard.next_action) || !hasChineseText(reviewCard.evidence_line)) {
    fail("Runtime coaching should include player-readable Chinese review-card content.", {
      review_card: reviewCard
    });
  }

  if (drillSpec.validation?.template_whitelist_passed !== true || drillSpec.validation?.parameter_whitelist_passed !== true) {
    fail("Runtime coaching drill_spec_candidate must pass template and parameter whitelists.", {
      drill_spec_candidate: drillSpec
    });
  }

  return {
    primary_failure: coaching.final.primary_failure,
    advice_focus: coaching.final.advice_focus,
    drill_template_id: drillSpec.template_id,
    next_action: reviewCard.next_action
  };
}

if (!fs.existsSync(runtimePath)) {
  fail(`Compiled runtime does not exist. Run npm run build:guidebuddy first: ${runtimePath}`);
}

if (!fs.existsSync(fixtureEventsPath)) {
  fail(`Missing runtime request fixture: ${fixtureEventsPath}`);
}

const fixtureEvents = readJsonl(fixtureEventsPath)
  .filter((event) => Number(event.seq || 0) <= 1301);
const replayResult = runRuntimeGuideRequestReplay(fixtureEvents);
const enemyDefeatReplayResult = runRuntimeEnemyDefeatReplay();
const { writtenFiles } = replayResult;
const coachingEntry = [...writtenFiles.entries()]
  .find(([filePath]) => filePath.includes("/guide_requests/request-001/coaching.json"));
const diagnosisEntry = [...writtenFiles.entries()]
  .find(([filePath]) => filePath.includes("/guide_requests/request-001/diagnosis.json"));
const eventsEntry = [...writtenFiles.entries()]
  .find(([filePath]) => filePath.includes("/guide_requests/request-001/combat_events.jsonl"));
const summaryEntry = [...writtenFiles.entries()]
  .find(([filePath]) => filePath.includes("/guide_requests/request-001/attempt_summary.json"));

if (!coachingEntry || !diagnosisEntry || !eventsEntry || !summaryEntry) {
  fail("Runtime guide request did not write all expected MVP03 snapshot files.", {
    wrote_coaching: Boolean(coachingEntry),
    wrote_diagnosis: Boolean(diagnosisEntry),
    wrote_events: Boolean(eventsEntry),
    wrote_summary: Boolean(summaryEntry),
    written_files: [...writtenFiles.keys()]
  });
}

if (!replayResult.battleEndMenuShown) {
  fail("Runtime replay did not show the battle-end menu before review.");
}

if (!enemyDefeatReplayResult.battleEndMenuShown) {
  fail("Runtime replay did not show the battle-end menu when an enemy reaches State.Death.");
}

const enemyDefeatSummaryEntry = [...enemyDefeatReplayResult.writtenFiles.entries()]
  .find(([filePath]) => filePath.endsWith("/attempt_summary.json"));
if (!enemyDefeatSummaryEntry) {
  fail("Enemy defeat replay did not write an attempt summary on shutdown.");
}

const enemyDefeatSummary = JSON.parse(enemyDefeatSummaryEntry[1]);
if (enemyDefeatSummary.end_reason !== "enemy_defeated") {
  fail("Enemy defeat replay should preserve enemy_defeated as the attempt end reason.", {
    end_reason: enemyDefeatSummary.end_reason
  });
}

const coaching = JSON.parse(coachingEntry[1]);
const diagnosis = JSON.parse(diagnosisEntry[1]);
const snapshotEvents = eventsEntry[1].trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const snapshotSummary = JSON.parse(summaryEntry[1]);
const observed = verifyCoaching(coaching, diagnosis);

if (!replayResult.coachingCardShown) {
  fail("Runtime replay did not show the coaching review card after review.");
}

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
  expected_snapshot_suffix: "guide_requests/request-001/coaching.json",
  trigger: "battle_end_review_button",
  enemy_defeat_menu: true,
  primary_failure: observed.primary_failure,
  advice_focus: observed.advice_focus,
  drill_template_id: observed.drill_template_id,
  end_reason: snapshotSummary.end_reason
};

fs.mkdirSync(path.dirname(runtimeEvidencePath), { recursive: true });
fs.writeFileSync(runtimeEvidencePath, `${JSON.stringify(stableEvidence, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ...stableEvidence,
  coaching_path: coachingEntry[0],
  runtime_evidence: toDisplayPath(runtimeEvidencePath)
}, null, 2));
