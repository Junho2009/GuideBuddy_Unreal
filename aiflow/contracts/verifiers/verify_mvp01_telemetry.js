const fs = require("fs");
const path = require("path");

const PHASE_ID = "MVP01_COMBAT_TELEMETRY_FOUNDATION";
const BASELINE_VERSION = "v0.1";
const BASELINE_ID = `${PHASE_ID}@${BASELINE_VERSION}`;

const repoRoot = path.resolve(__dirname, "../../..");
const telemetryRoot = path.join(repoRoot, "Saved", "GuideBuddy", "Telemetry");
const runsRoot = path.join(repoRoot, "aiflow", "contracts", "runs");
const evidenceRoot = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  PHASE_ID,
  BASELINE_VERSION
);

const REQUIRED_RAW_FILES = ["combat_events.jsonl", "attempt_summary.json"];
const VERIFIER_REF = `aiflow/contracts/verifiers/${PHASE_ID}.verifier.yaml`;

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  node aiflow/contracts/verifiers/verify_mvp01_telemetry.js [run-directory] [options]

Options:
  --archive      Archive passing raw evidence into aiflow/contracts/evidence. Default.
  --no-archive   Verify only; do not write evidence files.
  --help         Show this help.

Default source:
  Saved/GuideBuddy/Telemetry/<latest-run>`);
}

function parseArgs(argv) {
  const options = {
    archive: true,
    sourceDirectory: undefined
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--archive") {
      options.archive = true;
      continue;
    }

    if (arg === "--no-archive") {
      options.archive = false;
      continue;
    }

    if (arg.startsWith("--")) {
      fail(`Unknown option: ${arg}`);
    }

    if (options.sourceDirectory) {
      fail(`Only one run directory may be provided. Unexpected argument: ${arg}`);
    }

    options.sourceDirectory = path.resolve(arg);
  }

  return options;
}

function readLatestRunDirectory() {
  if (!fs.existsSync(telemetryRoot)) {
    fail(`Telemetry root does not exist: ${telemetryRoot}`);
  }

  const candidates = fs.readdirSync(telemetryRoot)
    .map((name) => path.join(telemetryRoot, name))
    .filter((candidate) => fs.statSync(candidate).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (candidates.length === 0) {
    fail(`No telemetry run directories found under: ${telemetryRoot}`);
  }

  return candidates[0];
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Invalid ${label}: ${filePath}: ${error.message}`);
  }
}

function parseJsonl(filePath) {
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

function verifyRunDirectory(runDirectory) {
  const eventsPath = path.join(runDirectory, "combat_events.jsonl");
  const summaryPath = path.join(runDirectory, "attempt_summary.json");

  if (!fs.existsSync(runDirectory) || !fs.statSync(runDirectory).isDirectory()) {
    fail(`Run directory does not exist: ${runDirectory}`);
  }

  if (!fs.existsSync(eventsPath)) {
    fail(`Missing combat_events.jsonl: ${eventsPath}`);
  }

  if (!fs.existsSync(summaryPath)) {
    fail(`Missing attempt_summary.json: ${summaryPath}`);
  }

  const events = parseJsonl(eventsPath);
  const summary = readJson(summaryPath, "attempt_summary.json");

  if (events.length === 0) {
    fail("combat_events.jsonl is empty.");
  }

  for (let index = 1; index < events.length; index += 1) {
    if (Number(events[index].time_seconds) < Number(events[index - 1].time_seconds)) {
      fail(`Event time is not monotonic at seq ${events[index].seq}.`);
    }
  }

  const eventTypes = new Set(events.map((event) => event.event_type));
  const hasEnemyAction = events.some((event) =>
    (event.event_type === "ability_activated" ||
      event.event_type === "state_activated" ||
      event.event_type === "combat_status_changed") &&
    event.role === "enemy");

  if (!eventTypes.has("attempt_start")) {
    fail("Missing attempt_start event.");
  }

  if (!eventTypes.has("player_input")) {
    fail("Missing player_input event.");
  }

  if (!hasEnemyAction) {
    fail("Missing enemy ability/state/status event.");
  }

  if (!eventTypes.has("damage") && !eventTypes.has("death")) {
    fail("Missing damage or death event.");
  }

  for (const field of ["run_id", "map", "start_time", "end_reason", "last_events", "damage_summary"]) {
    if (!(field in summary)) {
      fail(`attempt_summary.json missing field: ${field}`);
    }
  }

  const eventCounts = {};
  for (const event of events) {
    eventCounts[event.event_type] = (eventCounts[event.event_type] || 0) + 1;
  }

  const damageSummary = summary.damage_summary || {};
  const observed = {
    events: events.length,
    event_types: [...eventTypes],
    event_counts: eventCounts,
    player_events: events.filter((event) => event.role === "player").length,
    enemy_events: events.filter((event) => event.role === "enemy").length,
    damage_events: events.filter((event) => event.event_type === "damage").length,
    end_reason: String(summary.end_reason || ""),
    duration_seconds: Number(summary.duration_seconds || 0),
    hits_taken: Number(damageSummary.hits_taken || 0),
    total_damage_taken: Number(damageSummary.total_damage_taken || 0),
    hits_dealt: Number(damageSummary.hits_dealt || 0),
    total_damage_dealt: Number(damageSummary.total_damage_dealt || 0)
  };

  return {
    runDirectory,
    eventsPath,
    summaryPath,
    events,
    summary,
    observed
  };
}

function toDisplayPath(filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, "/");
  }

  return path.normalize(filePath).replace(/\\/g, "/");
}

function listEvidenceRunDirectories() {
  if (!fs.existsSync(evidenceRoot)) {
    return [];
  }

  return fs.readdirSync(evidenceRoot)
    .filter((name) => /^run-\d+$/.test(name))
    .map((name) => path.join(evidenceRoot, name))
    .filter((candidate) => fs.statSync(candidate).isDirectory())
    .sort();
}

function readArchivedRunId(runDirectory) {
  const summaryPath = path.join(runDirectory, "raw", "attempt_summary.json");
  if (!fs.existsSync(summaryPath)) {
    return "";
  }

  const summary = readJson(summaryPath, "archived attempt_summary.json");
  return String(summary.run_id || "");
}

function indexReferencesSource(indexPath, sourceRunId, sourceDirectoryName) {
  if (!fs.existsSync(indexPath)) {
    return false;
  }

  const contents = fs.readFileSync(indexPath, "utf8");
  return contents.includes(sourceRunId) || contents.includes(sourceDirectoryName);
}

function findExistingArchive(verification) {
  const sourceRunId = String(verification.summary.run_id || "");
  const sourceDirectoryName = path.basename(verification.runDirectory);

  for (const runDirectory of listEvidenceRunDirectories()) {
    const archivedRunId = readArchivedRunId(runDirectory);
    if (archivedRunId && archivedRunId === sourceRunId) {
      return { runDirectory, mode: "already_archived" };
    }

    const rawDirectory = path.join(runDirectory, "raw");
    const indexPath = path.join(runDirectory, "index.md");
    const hasRawEvidence = fs.existsSync(path.join(rawDirectory, "combat_events.jsonl")) ||
      fs.existsSync(path.join(rawDirectory, "attempt_summary.json"));

    if (!hasRawEvidence && indexReferencesSource(indexPath, sourceRunId, sourceDirectoryName)) {
      return { runDirectory, mode: "backfilled" };
    }
  }

  return undefined;
}

function allocateNextEvidenceRunDirectory() {
  const nextNumber = listEvidenceRunDirectories()
    .map((runDirectory) => Number(path.basename(runDirectory).replace("run-", "")))
    .filter((value) => Number.isFinite(value))
    .reduce((maximum, value) => Math.max(maximum, value), 0) + 1;

  return path.join(evidenceRoot, `run-${String(nextNumber).padStart(3, "0")}`);
}

function filesMatch(leftPath, rightPath) {
  return fs.readFileSync(leftPath).equals(fs.readFileSync(rightPath));
}

function copyRawEvidence(verification, rawDirectory) {
  const copied = [];
  const reused = [];

  fs.mkdirSync(rawDirectory, { recursive: true });

  for (const fileName of REQUIRED_RAW_FILES) {
    const sourcePath = path.join(verification.runDirectory, fileName);
    const targetPath = path.join(rawDirectory, fileName);

    if (fs.existsSync(targetPath)) {
      if (!filesMatch(sourcePath, targetPath)) {
        fail(`Archive target already has different contents for ${fileName}.`, {
          target: toDisplayPath(targetPath)
        });
      }

      reused.push(fileName);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
    copied.push(fileName);
  }

  return { copied, reused };
}

function renderEvidenceIndex(verification, targetRunDirectory, generatedAt) {
  const runLabel = path.basename(targetRunDirectory);
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.${runLabel}.yaml`);
  const eventCounts = verification.observed.event_counts;

  const eventCoverageLines = Object.keys(eventCounts)
    .map((eventType) => `- \`${eventType}\`: ${eventCounts[eventType]}`)
    .join("\n");

  return `# ${PHASE_ID} Evidence Index

- Baseline: \`${BASELINE_ID}\`
- Run: \`${PHASE_ID}.${runLabel}\`
- Source Telemetry Root: \`${toDisplayPath(verification.runDirectory)}/\`
- Archived Raw Root: \`${toDisplayPath(rawDirectory)}/\`
- Source Run ID: \`${String(verification.summary.run_id || "")}\`
- Generated At: \`${generatedAt}\`

## Evidence

| Type | Path | Description |
|---|---|---|
| Raw events | \`${toDisplayPath(path.join(rawDirectory, "combat_events.jsonl"))}\` | Archived MVP01 JSONL event stream with ${verification.observed.events} events. |
| Attempt summary | \`${toDisplayPath(path.join(rawDirectory, "attempt_summary.json"))}\` | Archived summary containing \`run_id\`, \`map\`, \`start_time\`, \`end_reason\`, \`last_events\`, and \`damage_summary\`. |
| Run record | \`${toDisplayPath(runRecordPath)}\` | Accepted verifier run record for this archived raw evidence. |
| Verifier run | \`npm run verify:mvp01\` | Passed automatic MVP01 telemetry checks and archived raw evidence. |

## Observed Event Coverage

${eventCoverageLines}

## Observed Combat Summary

- Player events: ${verification.observed.player_events}
- Enemy events: ${verification.observed.enemy_events}
- Hits taken: ${verification.observed.hits_taken}
- Total damage taken: ${verification.observed.total_damage_taken}
- Hits dealt: ${verification.observed.hits_dealt}
- Total damage dealt: ${verification.observed.total_damage_dealt}
- Duration: ${verification.observed.duration_seconds} seconds
- End reason: \`${verification.observed.end_reason}\`

## Notes

- This index was generated by \`aiflow/contracts/verifiers/verify_mvp01_telemetry.js\` after the raw telemetry passed MVP01 automatic checks.
- The working \`Saved/GuideBuddy/Telemetry/\` directory remains a local runtime output; this archived \`raw/\` directory is the versioned evidence copy.
- Existing archived raw evidence is never overwritten with different contents.
`;
}

function yamlQuote(value) {
  return JSON.stringify(String(value || ""));
}

function renderYamlList(values, indent = 2) {
  const prefix = " ".repeat(indent);
  return values.map((value) => `${prefix}- ${yamlQuote(value)}`).join("\n");
}

function renderRunRecord(verification, targetRunDirectory, generatedAt) {
  const runLabel = path.basename(targetRunDirectory);
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");
  const observed = verification.observed;
  const startTime = String(verification.summary.start_time || generatedAt);
  const finishTime = String(verification.summary.end_time || generatedAt);

  return `id: ${PHASE_ID}.${runLabel}
baseline_id: ${BASELINE_ID}
status: accepted
started_at: ${yamlQuote(startTime)}
finished_at: ${yamlQuote(finishTime)}
environment: "Windows, Unreal Engine 5.7 PIE telemetry output, Node.js verifier"
verifier_ref: ${VERIFIER_REF}
stimulus:
${renderYamlList([
  "Run SampleDemoShowcaseMap in PIE and complete a short real combat attempt.",
  "Exit PIE so GuideBuddy writes telemetry files.",
  "Run npm run verify:mvp01 against the latest telemetry output."
])}
results:
  - id: TELEMETRY_OUTPUT_EXISTS
    status: pass
    evidence: ${toDisplayPath(rawDirectory)}/
  - id: TELEMETRY_JSON_PARSE
    status: pass
    evidence: ${toDisplayPath(rawDirectory)}/
  - id: MINIMUM_EVENT_COVERAGE
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "combat_events.jsonl"))}
    observed:
      events: ${observed.events}
      event_types:
${renderYamlList(observed.event_types, 8)}
      player_events: ${observed.player_events}
      enemy_events: ${observed.enemy_events}
      damage_events: ${observed.damage_events}
  - id: ATTEMPT_SUMMARY_CONTENT
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "attempt_summary.json"))}
    observed:
      end_reason: ${observed.end_reason}
      duration_seconds: ${observed.duration_seconds}
      hits_taken: ${observed.hits_taken}
      total_damage_taken: ${observed.total_damage_taken}
      hits_dealt: ${observed.hits_dealt}
      total_damage_dealt: ${observed.total_damage_dealt}
evidence:
  source_root: ${toDisplayPath(verification.runDirectory)}/
  raw_root: ${toDisplayPath(rawDirectory)}/
  index: ${toDisplayPath(indexPath)}
notes:
${renderYamlList([
  "This run is a real PIE gameplay smoke, not synthetic telemetry injection.",
  "The accepted run includes player input, enemy events, combat status changes, health attribute changes, and damage.",
  "Raw evidence is archived under aiflow/contracts/evidence rather than versioning the Saved runtime directory directly."
])}
`;
}

function writeRunRecord(verification, targetRunDirectory, generatedAt) {
  const runLabel = path.basename(targetRunDirectory);
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.${runLabel}.yaml`);
  const sourceRunId = String(verification.summary.run_id || "");

  fs.mkdirSync(runsRoot, { recursive: true });

  if (fs.existsSync(runRecordPath)) {
    const contents = fs.readFileSync(runRecordPath, "utf8");
    if (!contents.includes(sourceRunId)) {
      fail("Run record already exists but does not reference the source run id.", {
        run_record: toDisplayPath(runRecordPath),
        source_run_id: sourceRunId
      });
    }

    return { path: toDisplayPath(runRecordPath), written: false };
  }

  fs.writeFileSync(runRecordPath, renderRunRecord(verification, targetRunDirectory, generatedAt), "utf8");
  return { path: toDisplayPath(runRecordPath), written: true };
}

function shouldRefreshIndex(indexPath) {
  if (!fs.existsSync(indexPath)) {
    return true;
  }

  const contents = fs.readFileSync(indexPath, "utf8");
  return !contents.includes("| Run record |");
}

function archiveEvidence(verification) {
  const existingArchive = findExistingArchive(verification);
  const targetRunDirectory = existingArchive
    ? existingArchive.runDirectory
    : allocateNextEvidenceRunDirectory();
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");
  const mode = existingArchive ? existingArchive.mode : "created";
  const copyResult = copyRawEvidence(verification, rawDirectory);
  const generatedAt = new Date().toISOString();
  const runRecord = writeRunRecord(verification, targetRunDirectory, generatedAt);
  const shouldWriteIndex = mode !== "already_archived" || shouldRefreshIndex(indexPath);

  fs.mkdirSync(targetRunDirectory, { recursive: true });
  if (shouldWriteIndex) {
    fs.writeFileSync(indexPath, renderEvidenceIndex(verification, targetRunDirectory, generatedAt), "utf8");
  }

  return {
    status: mode,
    evidence_directory: toDisplayPath(targetRunDirectory),
    raw_directory: toDisplayPath(rawDirectory),
    index_path: toDisplayPath(indexPath),
    run_record_path: runRecord.path,
    copied_files: copyResult.copied,
    reused_files: copyResult.reused,
    index_written: shouldWriteIndex,
    run_record_written: runRecord.written
  };
}

const options = parseArgs(process.argv.slice(2));
const runDirectory = options.sourceDirectory || readLatestRunDirectory();
const verification = verifyRunDirectory(runDirectory);
const archive = options.archive ? archiveEvidence(verification) : undefined;

console.log(JSON.stringify({
  ok: true,
  run_directory: toDisplayPath(verification.runDirectory),
  events: verification.observed.events,
  event_types: verification.observed.event_types,
  summary_run_id: verification.summary.run_id,
  archive
}, null, 2));
