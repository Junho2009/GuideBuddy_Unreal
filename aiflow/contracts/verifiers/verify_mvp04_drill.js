const fs = require("fs");
const path = require("path");
const Module = require("module");

const PHASE_ID = "MVP04_ADAPTIVE_DRILL_GENERATION";
const BASELINE_VERSION = "v0.1";
const BASELINE_ID = `${PHASE_ID}@${BASELINE_VERSION}`;
const UPSTREAM_PHASE_ID = "MVP03_LLM_COACHING_LOOP";
const ACCEPTED_GENERATED_AT = "2026-05-05T14:30:00.000Z";
const ACCEPTED_RANDOM_SEED = 40404;
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

const repoRoot = path.resolve(__dirname, "../../..");
const fixtureRoot = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  UPSTREAM_PHASE_ID,
  BASELINE_VERSION,
  "run-001",
  "raw"
);
const fixtureEventsPath = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  "MVP01_COMBAT_TELEMETRY_FOUNDATION",
  BASELINE_VERSION,
  "run-002",
  "raw",
  "combat_events.jsonl"
);
const workRoot = path.join(repoRoot, "Saved", "GuideBuddy", "DrillVerifier", PHASE_ID);
const primaryWorkRun = path.join(workRoot, "run-001-execution-response");
const runsRoot = path.join(repoRoot, "aiflow", "contracts", "runs");
const evidenceRoot = path.join(repoRoot, "aiflow", "contracts", "evidence", PHASE_ID, BASELINE_VERSION);
const targetRunDirectory = path.join(evidenceRoot, "run-001");
const ledgerPath = path.join(repoRoot, "aiflow", "contracts", "ledgers", `${PHASE_ID}.result.md`);
const drillRuntimePath = path.join(repoRoot, "Content", "JavaScript", "GuideBuddy", "drill.js");
const runtimePath = path.join(repoRoot, "Content", "JavaScript", "GuideBuddy", "main.js");
const runtimeEvidencePath = path.join(targetRunDirectory, "runtime_request_verifier.json");
const verifierRef = `aiflow/contracts/verifiers/${PHASE_ID}.verifier.yaml`;
const requiredRawFiles = ["attempt_summary.json", "diagnosis.json", "coaching.json", "drill_spec.json", "drill_session.json"];

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

function safeRemoveInsideWorkRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const allowedRoot = path.resolve(workRoot);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    fail(`Refusing to remove outside verifier work root: ${resolved}`);
  }

  fs.rmSync(resolved, { recursive: true, force: true });
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Invalid ${label}: ${filePath}: ${error.message}`);
  }
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  if (!fs.existsSync(runtimePath)) {
    fail(`Compiled runtime does not exist. Run npm run build:guidebuddy first: ${runtimePath}`);
  }

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
        telemetry_root: "Z:/GuideBuddy/MVP04RuntimeRequestTest",
        player: {}
      });
    },
    GetTelemetryRootDirectory() {
      return "Z:/GuideBuddy/MVP04RuntimeRequestTest";
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

function verifyRuntimeDrillArtifacts(events) {
  const replayResult = runRuntimeGuideRequestReplay(events);
  const drillSpecEntry = [...replayResult.writtenFiles.entries()]
    .find(([filePath]) => filePath.includes("/guide_requests/request-001/drill_spec.json"));
  const drillSessionEntry = [...replayResult.writtenFiles.entries()]
    .find(([filePath]) => filePath.includes("/guide_requests/request-001/drill_session.json"));
  const coachingEntry = [...replayResult.writtenFiles.entries()]
    .find(([filePath]) => filePath.includes("/guide_requests/request-001/coaching.json"));

  if (!replayResult.battleEndMenuShown || !replayResult.coachingCardShown) {
    fail("Runtime replay did not show the expected battle-end and coaching UI hooks.", {
      battle_end_menu: replayResult.battleEndMenuShown,
      coaching_card: replayResult.coachingCardShown
    });
  }

  if (!drillSpecEntry || !drillSessionEntry || !coachingEntry) {
    fail("Runtime guide request did not write MVP04 drill artifacts.", {
      wrote_coaching: Boolean(coachingEntry),
      wrote_drill_spec: Boolean(drillSpecEntry),
      wrote_drill_session: Boolean(drillSessionEntry),
      written_files: [...replayResult.writtenFiles.keys()]
    });
  }

  const coaching = JSON.parse(coachingEntry[1]);
  const drillSpec = JSON.parse(drillSpecEntry[1]);
  const drillSession = JSON.parse(drillSessionEntry[1]);

  if (drillSpec.schema_version !== "guidebuddy.drill_spec.v1" || drillSession.schema_version !== "guidebuddy.drill_session.v1") {
    fail("Runtime drill artifacts have unexpected schema versions.", {
      drill_spec_schema: drillSpec.schema_version,
      drill_session_schema: drillSession.schema_version
    });
  }

  if (drillSession.source_kind !== "runtime" || drillSpec.practice_objective_id !== coaching.practice_objective?.id) {
    fail("Runtime drill artifacts are not linked back to runtime coaching.", {
      drill_session: drillSession,
      coaching_practice_objective: coaching.practice_objective
    });
  }

  const stableEvidence = {
    ok: true,
    fixture: toDisplayPath(fixtureEventsPath),
    replayed_events: events.length,
    expected_snapshot_suffix: "guide_requests/request-001/drill_session.json",
    trigger: "battle_end_review_button",
    primary_failure: drillSpec.primary_failure,
    practice_objective_id: drillSpec.practice_objective_id,
    drill_template_id: drillSpec.template_id,
    drill_spec_path: drillSpecEntry[0],
    drill_session_path: drillSessionEntry[0]
  };

  writeJson(runtimeEvidencePath, stableEvidence);
  return stableEvidence;
}

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function preparePrimaryFixture() {
  for (const fileName of ["attempt_summary.json", "diagnosis.json", "coaching.json"]) {
    const sourcePath = path.join(fixtureRoot, fileName);
    if (!fs.existsSync(sourcePath)) {
      fail(`Missing MVP03 fixture file: ${sourcePath}`);
    }
  }

  safeRemoveInsideWorkRoot(primaryWorkRun);
  fs.mkdirSync(primaryWorkRun, { recursive: true });
  copyFile(path.join(fixtureRoot, "attempt_summary.json"), path.join(primaryWorkRun, "attempt_summary.json"));
  copyFile(path.join(fixtureRoot, "diagnosis.json"), path.join(primaryWorkRun, "diagnosis.json"));
  copyFile(path.join(fixtureRoot, "coaching.json"), path.join(primaryWorkRun, "coaching.json"));
  return primaryWorkRun;
}

function loadDrillRuntime() {
  if (!fs.existsSync(drillRuntimePath)) {
    fail(`Compiled drill runtime does not exist. Run npm run build:guidebuddy first: ${drillRuntimePath}`);
  }

  delete require.cache[drillRuntimePath];
  const runtime = require(drillRuntimePath);
  if (typeof runtime.generateDrillForRunDirectory !== "function") {
    fail("drill.js does not export generateDrillForRunDirectory.");
  }

  return runtime;
}

function runDrill(runtime, runDirectory, sourceKind) {
  runtime.generateDrillForRunDirectory(runDirectory, runDirectory, {
    generatedAt: ACCEPTED_GENERATED_AT,
    sourceKind,
    randomSeed: ACCEPTED_RANDOM_SEED
  });

  const drillSpecPath = path.join(runDirectory, "drill_spec.json");
  const drillSessionPath = path.join(runDirectory, "drill_session.json");
  if (!fs.existsSync(drillSpecPath) || !fs.existsSync(drillSessionPath)) {
    fail("Drill runtime did not write both drill artifacts.", {
      run_directory: toDisplayPath(runDirectory),
      wrote_drill_spec: fs.existsSync(drillSpecPath),
      wrote_drill_session: fs.existsSync(drillSessionPath)
    });
  }

  return {
    drillSpec: readJson(drillSpecPath, "drill_spec.json"),
    drillSession: readJson(drillSessionPath, "drill_session.json")
  };
}

function verifyPrimaryDrill(coaching, drillSpec, drillSession) {
  const practiceObjective = coaching.practice_objective || {};
  const final = coaching.final || {};
  const sessionRefs = drillSession.source_refs || {};
  const normalized = drillSession.template_request?.normalized_parameters || {};

  if (drillSpec.schema_version !== "guidebuddy.drill_spec.v1") {
    fail("drill_spec.json has unexpected schema_version.", {
      schema_version: drillSpec.schema_version
    });
  }

  if (drillSession.schema_version !== "guidebuddy.drill_session.v1") {
    fail("drill_session.json has unexpected schema_version.", {
      schema_version: drillSession.schema_version
    });
  }

  if (drillSpec.template_id !== "single_enemy_execution_response" || drillSession.template_request?.template_id !== "single_enemy_execution_response") {
    fail("MVP04 v0.1 must use the single_enemy_execution_response template.", {
      drill_template: drillSpec.template_id,
      session_template: drillSession.template_request?.template_id
    });
  }

  if (drillSpec.constraints?.max_enemies !== 1 || normalized.enemy_count !== 1) {
    fail("MVP04 accepted drill must be a single-enemy drill.", {
      constraints: drillSpec.constraints,
      normalized_parameters: normalized
    });
  }

  if (drillSpec.source_attempt_run_id !== coaching.run_id || sessionRefs.source_attempt_run_id !== coaching.run_id) {
    fail("Drill artifacts must link back to the source attempt run id.", {
      coaching_run_id: coaching.run_id,
      drill_source_attempt: drillSpec.source_attempt_run_id,
      session_source_attempt: sessionRefs.source_attempt_run_id
    });
  }

  if (drillSpec.practice_objective_id !== practiceObjective.id || sessionRefs.practice_objective_id !== practiceObjective.id) {
    fail("Drill artifacts must link back to the practice objective.", {
      practice_objective_id: practiceObjective.id,
      drill_practice_objective_id: drillSpec.practice_objective_id,
      session_practice_objective_id: sessionRefs.practice_objective_id
    });
  }

  if (drillSpec.primary_failure !== final.primary_failure || normalized.target_error !== final.primary_failure) {
    fail("Drill primary failure must stay aligned with coaching.final.primary_failure.", {
      final,
      drill_primary_failure: drillSpec.primary_failure,
      normalized
    });
  }

  const unknownParams = Object.keys(normalized).filter((name) => !ALLOWED_PARAMETER_NAMES.includes(name));
  if (unknownParams.length > 0) {
    fail("drill_session normalized_parameters contains non-whitelisted fields.", {
      unknown_parameters: unknownParams,
      normalized_parameters: normalized
    });
  }

  if (normalized.repetition_goal < 1 || normalized.repetition_goal > 10 ||
    normalized.success_window_seconds < 0.5 || normalized.success_window_seconds > 3 ||
    normalized.max_consecutive_failures < 0 || normalized.max_consecutive_failures > 5) {
    fail("drill_session normalized parameters are outside safe ranges.", {
      normalized_parameters: normalized
    });
  }

  const objectiveMetricIds = new Set((practiceObjective.measurable_metrics || []).map((metric) => metric.id));
  const sessionMetricIds = normalized.metric_ids || [];
  if (!Array.isArray(sessionMetricIds) || sessionMetricIds.length === 0 || sessionMetricIds.some((metricId) => !objectiveMetricIds.has(metricId))) {
    fail("Drill session metric ids must be a non-empty subset of practice objective metrics.", {
      objective_metrics: practiceObjective.measurable_metrics,
      session_metric_ids: sessionMetricIds
    });
  }

  if (!/[\u4e00-\u9fff]/.test(String(drillSession.readable_zh?.objective || ""))) {
    fail("drill_session.json should include a human-readable Chinese objective.", {
      readable_zh: drillSession.readable_zh
    });
  }

  if (JSON.stringify(drillSpec).match(/ExecuteConsoleCommand|Blueprint|\/Game\/|\.uasset|SpawnActor|https?:\/\//i)) {
    fail("drill_spec.json contains unsafe scene or asset instructions.", {
      drill_spec: drillSpec
    });
  }

  return {
    drill_id: drillSpec.drill_id,
    session_id: drillSession.session_id,
    template_id: drillSpec.template_id,
    practice_objective_id: drillSpec.practice_objective_id,
    primary_failure: drillSpec.primary_failure,
    metric_ids: sessionMetricIds
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepareRejectionFixture(label, mutate) {
  const rejectDirectory = path.join(workRoot, label);
  safeRemoveInsideWorkRoot(rejectDirectory);
  fs.mkdirSync(rejectDirectory, { recursive: true });
  const coaching = readJson(path.join(fixtureRoot, "coaching.json"), "fixture coaching.json");
  mutate(coaching);
  writeJson(path.join(rejectDirectory, "coaching.json"), coaching);
  return rejectDirectory;
}

function expectFailure(runtime, label, mutate) {
  const rejectDirectory = prepareRejectionFixture(label, mutate);
  let rejected = false;
  let errorMessage = "";

  try {
    runtime.generateDrillForRunDirectory(rejectDirectory, rejectDirectory, {
      generatedAt: ACCEPTED_GENERATED_AT,
      sourceKind: "verifier-negative",
      randomSeed: ACCEPTED_RANDOM_SEED
    });
  } catch (error) {
    rejected = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  if (!rejected) {
    fail(`Expected ${label} to be rejected.`, {
      reject_directory: toDisplayPath(rejectDirectory)
    });
  }

  if (fs.existsSync(path.join(rejectDirectory, "drill_spec.json")) || fs.existsSync(path.join(rejectDirectory, "drill_session.json"))) {
    fail(`Rejected fixture ${label} should not write drill artifacts.`, {
      reject_directory: toDisplayPath(rejectDirectory)
    });
  }

  return {
    label,
    status: "rejected",
    error: errorMessage,
    evidence: toDisplayPath(rejectDirectory)
  };
}

function copyRawEvidence(runDirectory, rawDirectory) {
  const copied = [];
  const reused = [];

  fs.mkdirSync(rawDirectory, { recursive: true });

  for (const fileName of requiredRawFiles) {
    const sourcePath = path.join(runDirectory, fileName);
    const targetPath = path.join(rawDirectory, fileName);

    if (!fs.existsSync(sourcePath)) {
      fail(`Missing raw file for archive: ${sourcePath}`);
    }

    if (fs.existsSync(targetPath) && fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath))) {
      reused.push(fileName);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
    copied.push(fileName);
  }

  return { copied, reused };
}

function yamlQuote(value) {
  return JSON.stringify(String(value || ""));
}

function renderYamlList(values, indent = 2) {
  const prefix = " ".repeat(indent);
  return values.map((value) => `${prefix}- ${yamlQuote(value)}`).join("\n");
}

function writeTextIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === contents) {
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
  return true;
}

function renderEvidenceIndex(observed, negativeResults, runtimeObserved) {
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.run-001.yaml`);

  return `# ${PHASE_ID} Evidence Index

- Baseline: \`${BASELINE_ID}\`
- Run: \`${PHASE_ID}.run-001\`
- Source MVP03 Fixture: \`${toDisplayPath(fixtureRoot)}/\`
- Archived Raw Root: \`${toDisplayPath(rawDirectory)}/\`
- Generated At: \`${ACCEPTED_GENERATED_AT}\`

## Evidence

| Type | Path | Description |
|---|---|---|
| Attempt summary | \`${toDisplayPath(path.join(rawDirectory, "attempt_summary.json"))}\` | Archived MVP03 attempt summary. |
| Diagnosis | \`${toDisplayPath(path.join(rawDirectory, "diagnosis.json"))}\` | Archived MVP03 diagnosis input. |
| Coaching | \`${toDisplayPath(path.join(rawDirectory, "coaching.json"))}\` | MVP03 coaching output consumed by MVP04. |
| Drill Spec | \`${toDisplayPath(path.join(rawDirectory, "drill_spec.json"))}\` | MVP04 validated formal Drill Spec. |
| Drill Session | \`${toDisplayPath(path.join(rawDirectory, "drill_session.json"))}\` | MVP04 template request and source trace. |
| Runtime request verifier | \`${toDisplayPath(runtimeEvidencePath)}\` | Runtime guide request wrote drill artifacts beside coaching output. |
| Run record | \`${toDisplayPath(runRecordPath)}\` | Accepted verifier run record. |
| Verifier run | \`npm run verify:mvp04\` | Passed automatic MVP04 drill generation checks. |

## Observed Drill

- Primary failure: \`${observed.primary_failure}\`
- Practice objective: \`${observed.practice_objective_id}\`
- Drill template: \`${observed.template_id}\`
- Drill id: \`${observed.drill_id}\`
- Session id: \`${observed.session_id}\`
- Metric ids: \`${observed.metric_ids.join(", ")}\`

## Rejection Guards

${negativeResults.map((result) => `- \`${result.label}\`: ${result.status} (${result.error})`).join("\n")}

## Runtime Guide Request

- Trigger: \`${runtimeObserved.trigger}\`
- Drill template: \`${runtimeObserved.drill_template_id}\`
- Drill session suffix: \`${runtimeObserved.expected_snapshot_suffix}\`

## Notes

- MVP04 consumes \`coaching.json\` and does not read raw combat event logs.
- The accepted template is limited to \`single_enemy_execution_response\`.
- Drill artifacts contain a whitelist template request and traceability metadata, not free-form Unreal scene instructions.
`;
}

function renderRunRecord(observed, negativeResults, runtimeObserved) {
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");

  return `id: ${PHASE_ID}.run-001
baseline_id: ${BASELINE_ID}
status: accepted
started_at: ${yamlQuote(ACCEPTED_GENERATED_AT)}
finished_at: ${yamlQuote(ACCEPTED_GENERATED_AT)}
environment: "Windows, Node.js verifier, MVP03 archived coaching fixture"
verifier_ref: ${verifierRef}
stimulus:
${renderYamlList([
  "Copy accepted MVP03 run-001 attempt_summary.json, diagnosis.json, and coaching.json into a verifier work directory.",
  "Run the compiled GuideBuddy drill runtime to generate drill_spec.json and drill_session.json.",
  "Verify schema, source traceability, template whitelist, parameter whitelist, safe ranges, and readable objective.",
  "Run rejection fixtures for unsupported template, unknown parameter, unsafe string, and insufficient evidence.",
  "Replay a runtime guide request and confirm drill_spec.json and drill_session.json are written beside coaching.json."
])}
results:
  - id: DRILL_INPUT_PARSE
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "coaching.json"))}
  - id: DRILL_OUTPUT_SCHEMA
    status: pass
    evidence: ${toDisplayPath(rawDirectory)}/
  - id: SOURCE_TRACEABILITY
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "drill_session.json"))}
  - id: TEMPLATE_WHITELIST
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "drill_spec.json"))}
    observed:
      template_id: ${observed.template_id}
  - id: PARAMETER_WHITELIST
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "drill_session.json"))}
    observed:
      metric_ids: ${yamlQuote(observed.metric_ids.join(", "))}
  - id: REJECT_UNSUPPORTED_TEMPLATE
    status: pass
    evidence: ${negativeResults.find((result) => result.label === "reject-unsupported-template").evidence}/
  - id: REJECT_UNKNOWN_PARAMETER
    status: pass
    evidence: ${negativeResults.find((result) => result.label === "reject-unknown-parameter").evidence}/
  - id: REJECT_UNSAFE_FIELDS
    status: pass
    evidence: ${negativeResults.find((result) => result.label === "reject-unsafe-fields").evidence}/
  - id: REJECT_INSUFFICIENT_EVIDENCE
    status: pass
    evidence: ${negativeResults.find((result) => result.label === "reject-insufficient-evidence").evidence}/
  - id: RUNTIME_DRILL_ARTIFACTS
    status: pass
    evidence: ${toDisplayPath(runtimeEvidencePath)}
    observed:
      drill_template_id: ${runtimeObserved.drill_template_id}
      expected_snapshot_suffix: ${runtimeObserved.expected_snapshot_suffix}
evidence:
  raw_root: ${toDisplayPath(rawDirectory)}/
  index: ${toDisplayPath(indexPath)}
  verifier_work_root: ${toDisplayPath(workRoot)}/
notes:
${renderYamlList([
  "MVP04 v0.1 validates and normalizes the MVP03 candidate; it does not generate or mutate Unreal assets.",
  "The drill session links back to source attempt, diagnosis, coaching, and practice objective.",
  "Unsafe free-form scene instructions are rejected before a formal Drill Spec is written."
])}
`;
}

function renderLedger(observed) {
  return `# ${PHASE_ID} 结果台账

- Baseline: \`${BASELINE_ID}\`
- Accepted Run: \`aiflow/contracts/runs/${PHASE_ID}.run-001.yaml\`
- Evidence Index: \`aiflow/contracts/evidence/${PHASE_ID}/${BASELINE_VERSION}/run-001/index.md\`
- Status: accepted

## Accepted Summary

MVP04 已通过自动验收。生成器读取 MVP03 accepted evidence 中的 \`coaching.json\`，验证 \`practice_objective\` 与 \`drill_spec_candidate\`，并生成正式 \`drill_spec.json\` 与 \`drill_session.json\`。

Accepted run 将 \`${observed.primary_failure}\` 的 \`${observed.practice_objective_id}\` 练习目标规范化为白名单模板 \`${observed.template_id}\`。输出保留 source attempt、diagnosis、coaching、practice objective 与 telemetry metric 链路，不包含 Blueprint、资产路径、控制台命令或自由形式场景创建指令。

## Checks

- TypeScript build: pass
- Drill input parse: pass
- Drill Spec schema: pass
- Drill Session schema: pass
- Source traceability: pass
- Template whitelist: pass
- Parameter whitelist and safe ranges: pass
- Unsupported template rejection: pass
- Unknown parameter rejection: pass
- Unsafe field/string rejection: pass
- Insufficient evidence rejection: pass
- Runtime guide request drill artifacts: pass

## Remaining Risks

- 当前只支持 \`single_enemy_execution_response\` 一个模板。
- 当前输出是 UE 白名单模板请求和 session 元数据；真实进入练习场的关卡/出生点/敌人控制入口仍需后续 UE 侧接入深化。
- 成功指标已写入 Drill Spec，但是否改善仍由 MVP05 telemetry evaluation 判断。

## Next Step

进入 \`MVP05_EVALUATION_AND_ITERATION\`，基于 drill session 和后续 telemetry 判断练习目标是否改善。
`;
}

function archiveEvidence(runDirectory, observed, negativeResults, runtimeObserved) {
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.run-001.yaml`);
  const copyResult = copyRawEvidence(runDirectory, rawDirectory);
  const indexWritten = writeTextIfChanged(indexPath, renderEvidenceIndex(observed, negativeResults, runtimeObserved));
  const runRecordWritten = writeTextIfChanged(runRecordPath, renderRunRecord(observed, negativeResults, runtimeObserved));
  const ledgerWritten = writeTextIfChanged(ledgerPath, renderLedger(observed));

  return {
    evidence_directory: toDisplayPath(targetRunDirectory),
    raw_directory: toDisplayPath(rawDirectory),
    index_path: toDisplayPath(indexPath),
    run_record_path: toDisplayPath(runRecordPath),
    ledger_path: toDisplayPath(ledgerPath),
    copied_files: copyResult.copied,
    reused_files: copyResult.reused,
    index_written: indexWritten,
    run_record_written: runRecordWritten,
    ledger_written: ledgerWritten
  };
}

const runtime = loadDrillRuntime();
const primaryRunDirectory = preparePrimaryFixture();
const coaching = readJson(path.join(primaryRunDirectory, "coaching.json"), "coaching.json");
const { drillSpec, drillSession } = runDrill(runtime, primaryRunDirectory, "verifier");
const observed = verifyPrimaryDrill(coaching, drillSpec, drillSession);

const negativeResults = [
  expectFailure(runtime, "reject-unsupported-template", (candidateCoaching) => {
    candidateCoaching.drill_spec_candidate.template_id = "freeform_boss_arena";
  }),
  expectFailure(runtime, "reject-unknown-parameter", (candidateCoaching) => {
    candidateCoaching.drill_spec_candidate.parameters.spawn_budget = 2;
  }),
  expectFailure(runtime, "reject-unsafe-fields", (candidateCoaching) => {
    candidateCoaching.drill_spec_candidate.parameters.focus = "/Game/Unsafe/BP_FreeformArena";
  }),
  expectFailure(runtime, "reject-insufficient-evidence", (candidateCoaching) => {
    candidateCoaching.final = {
      status: "insufficient_evidence",
      primary_failure: "insufficient_evidence",
      main_issue_count: 0,
      advice_focus: "collect_more_failure_evidence",
      practice_objective_id: "practice.insufficient_evidence.collect_more_failure_evidence",
      drill_template_id: "telemetry_capture_repeat"
    };
    candidateCoaching.practice_objective.id = "practice.insufficient_evidence.collect_more_failure_evidence";
    candidateCoaching.practice_objective.target_error = "insufficient_evidence";
    candidateCoaching.drill_spec_candidate.template_id = "telemetry_capture_repeat";
    candidateCoaching.drill_spec_candidate.objective_ref = "practice.insufficient_evidence.collect_more_failure_evidence";
  })
];

if (!fs.existsSync(fixtureEventsPath)) {
  fail(`Missing runtime request fixture: ${fixtureEventsPath}`);
}

const fixtureEvents = readJsonl(fixtureEventsPath)
  .filter((event) => Number(event.seq || 0) <= 1301);
const runtimeObserved = verifyRuntimeDrillArtifacts(fixtureEvents);

const archive = archiveEvidence(primaryRunDirectory, observed, negativeResults, runtimeObserved);

console.log(JSON.stringify({
  ok: true,
  run_directory: toDisplayPath(primaryRunDirectory),
  primary_failure: observed.primary_failure,
  practice_objective_id: observed.practice_objective_id,
  drill_template_id: observed.template_id,
  metric_ids: observed.metric_ids,
  runtime_drill_template_id: runtimeObserved.drill_template_id,
  rejection_guards: negativeResults,
  archive
}, null, 2));
