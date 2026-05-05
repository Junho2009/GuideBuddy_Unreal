const fs = require("fs");
const path = require("path");

const PHASE_ID = "MVP02_DIAGNOSTIC_SIGNAL_LAYER";
const BASELINE_VERSION = "v0.1";
const BASELINE_ID = `${PHASE_ID}@${BASELINE_VERSION}`;
const UPSTREAM_PHASE_ID = "MVP01_COMBAT_TELEMETRY_FOUNDATION";

const repoRoot = path.resolve(__dirname, "../../..");
const fixtureRoot = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  UPSTREAM_PHASE_ID,
  "v0.1",
  "run-002",
  "raw"
);
const workRoot = path.join(repoRoot, "Saved", "GuideBuddy", "DiagnosticsVerifier", PHASE_ID);
const primaryWorkRun = path.join(workRoot, "run-002-recovered-death");
const insufficientWorkRun = path.join(workRoot, "insufficient-evidence");
const runsRoot = path.join(repoRoot, "aiflow", "contracts", "runs");
const evidenceRoot = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  PHASE_ID,
  BASELINE_VERSION
);
const diagnosisRuntimePath = path.join(repoRoot, "Content", "JavaScript", "GuideBuddy", "diagnosis.js");
const verifierRef = `aiflow/contracts/verifiers/${PHASE_ID}.verifier.yaml`;
const requiredRawFiles = ["combat_events.jsonl", "attempt_summary.json", "diagnosis.json"];

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

function safeRemoveInsideRepo(targetPath) {
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

function verifyReadableZh(diagnosis, label) {
  const readableZh = diagnosis.readable_zh || {};
  const summary = readableZh.summary;
  const practiceSuggestion = readableZh.practice_suggestion;
  const evidence = readableZh.evidence;

  if (readableZh.language !== "zh-CN") {
    fail(`${label} is missing readable_zh.language=zh-CN.`, {
      readable_zh: readableZh
    });
  }

  if (typeof summary !== "string" || !/[\u4e00-\u9fff]/.test(summary)) {
    fail(`${label} is missing a Chinese readable_zh.summary.`, {
      summary
    });
  }

  if (typeof practiceSuggestion !== "string" || !/[\u4e00-\u9fff]/.test(practiceSuggestion)) {
    fail(`${label} is missing a Chinese readable_zh.practice_suggestion.`, {
      practice_suggestion: practiceSuggestion
    });
  }

  if (!Array.isArray(evidence) || evidence.length === 0 || !evidence.some((line) => typeof line === "string" && /[\u4e00-\u9fff]/.test(line))) {
    fail(`${label} is missing Chinese readable_zh.evidence lines.`, {
      evidence
    });
  }

  return {
    summary,
    practice_suggestion: practiceSuggestion
  };
}

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function preparePrimaryFixture() {
  for (const fileName of ["combat_events.jsonl", "attempt_summary.json"]) {
    const sourcePath = path.join(fixtureRoot, fileName);
    if (!fs.existsSync(sourcePath)) {
      fail(`Missing MVP01 fixture file: ${sourcePath}`);
    }
  }

  safeRemoveInsideRepo(primaryWorkRun);
  fs.mkdirSync(primaryWorkRun, { recursive: true });
  copyFile(path.join(fixtureRoot, "combat_events.jsonl"), path.join(primaryWorkRun, "combat_events.jsonl"));
  copyFile(path.join(fixtureRoot, "attempt_summary.json"), path.join(primaryWorkRun, "attempt_summary.json"));
  return primaryWorkRun;
}

function prepareInsufficientEvidenceFixture() {
  safeRemoveInsideRepo(insufficientWorkRun);
  fs.mkdirSync(insufficientWorkRun, { recursive: true });

  const events = [
    {
      schema_version: "guidebuddy.combat_event.v1",
      run_id: "mvp02_insufficient_evidence_fixture",
      seq: 1,
      event_type: "attempt_start",
      time_seconds: 0,
      iso_time: "2026-05-05T00:00:00.000Z",
      map: "SyntheticInsufficientEvidence"
    },
    {
      schema_version: "guidebuddy.combat_event.v1",
      run_id: "mvp02_insufficient_evidence_fixture",
      seq: 2,
      event_type: "attempt_end",
      time_seconds: 2,
      iso_time: "2026-05-05T00:00:02.000Z",
      map: "SyntheticInsufficientEvidence",
      end_reason: "manual_stop"
    }
  ];
  const summary = {
    schema_version: "guidebuddy.attempt_summary.v1",
    run_id: "mvp02_insufficient_evidence_fixture",
    map: "SyntheticInsufficientEvidence",
    start_time: "2026-05-05T00:00:00.000Z",
    end_time: "2026-05-05T00:00:02.000Z",
    duration_seconds: 2,
    end_reason: "manual_stop",
    death_info: null,
    last_events: events,
    damage_summary: {
      hits_taken: 0,
      total_damage_taken: 0,
      hits_dealt: 0,
      total_damage_dealt: 0,
      fatal_damage: null
    },
    event_counts: {
      attempt_start: 1,
      attempt_end: 1
    }
  };

  fs.writeFileSync(path.join(insufficientWorkRun, "combat_events.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(insufficientWorkRun, "attempt_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return insufficientWorkRun;
}

function loadDiagnosisRuntime() {
  if (!fs.existsSync(diagnosisRuntimePath)) {
    fail(`Compiled diagnosis runtime does not exist. Run npm run build:guidebuddy first: ${diagnosisRuntimePath}`);
  }

  delete require.cache[diagnosisRuntimePath];
  const runtime = require(diagnosisRuntimePath);
  if (typeof runtime.generateDiagnosisForRunDirectory !== "function") {
    fail("diagnosis.js does not export generateDiagnosisForRunDirectory.");
  }

  return runtime;
}

function runDiagnosis(runtime, runDirectory) {
  const outputPath = path.join(runDirectory, "diagnosis.json");
  runtime.generateDiagnosisForRunDirectory(runDirectory, outputPath);
  if (!fs.existsSync(outputPath)) {
    fail("Diagnosis runtime did not write diagnosis.json.", {
      run_directory: toDisplayPath(runDirectory)
    });
  }

  return readJson(outputPath, "diagnosis.json");
}

function verifyPrimaryDiagnosis(diagnosis, runDirectory) {
  const events = readJsonl(path.join(runDirectory, "combat_events.jsonl"));
  const eventTypes = new Set(events.map((event) => event.event_type));
  const deterministic = diagnosis.deterministic || {};
  const final = diagnosis.final || {};
  const practiceObjectiveSeed = final.practice_objective_seed || {};
  const evidenceSeqs = deterministic.evidence_event_seqs || [];

  if (diagnosis.schema_version !== "guidebuddy.diagnosis.v1") {
    fail("diagnosis.json has unexpected schema_version.", {
      schema_version: diagnosis.schema_version
    });
  }

  if (final.primary_failure !== "posture_break_into_execution") {
    fail("Expected fixture diagnosis to identify posture_break_into_execution.", {
      primary_failure: final.primary_failure
    });
  }

  if (Number(final.confidence || 0) < 0.8) {
    fail("Fixture diagnosis confidence is too low.", {
      confidence: final.confidence
    });
  }

  if (!Array.isArray(evidenceSeqs) || !evidenceSeqs.includes(1299) || (!evidenceSeqs.includes(1300) && !evidenceSeqs.includes(1301))) {
    fail("Fixture diagnosis did not preserve State.Death and execution evidence seqs.", {
      evidence_event_seqs: evidenceSeqs
    });
  }

  if (!practiceObjectiveSeed.focus || !Array.isArray(practiceObjectiveSeed.measurable_metrics)) {
    fail("practice_objective_seed is missing required fields.", {
      practice_objective_seed: practiceObjectiveSeed
    });
  }

  if (!diagnosis.llm_review || diagnosis.llm_review.enabled !== false) {
    fail("llm_review placeholder must exist and stay disabled for MVP02.", {
      llm_review: diagnosis.llm_review
    });
  }

  const readableZh = verifyReadableZh(diagnosis, "Primary diagnosis");

  return {
    events: events.length,
    event_types: [...eventTypes],
    primary_failure: final.primary_failure,
    confidence: final.confidence,
    evidence_event_seqs: evidenceSeqs,
    practice_focus: practiceObjectiveSeed.focus,
    readable_zh_summary: readableZh.summary
  };
}

function verifyInsufficientEvidenceDiagnosis(diagnosis) {
  const final = diagnosis.final || {};
  if (final.primary_failure !== "insufficient_evidence" || final.status !== "insufficient_evidence") {
    fail("Insufficient evidence fixture should not force a diagnosis.", {
      final
    });
  }

  const readableZh = verifyReadableZh(diagnosis, "Insufficient evidence diagnosis");

  return {
    primary_failure: final.primary_failure,
    status: final.status,
    readable_zh_summary: readableZh.summary
  };
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

function findExistingArchive(sourceRunId) {
  return listEvidenceRunDirectories().find((runDirectory) => readArchivedRunId(runDirectory) === sourceRunId);
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

    if (fs.existsSync(targetPath)) {
      if (filesMatch(sourcePath, targetPath)) {
        reused.push(fileName);
        continue;
      }

      if (fileName === "diagnosis.json") {
        fs.copyFileSync(sourcePath, targetPath);
        copied.push(fileName);
        continue;
      }

      if (fileName !== "diagnosis.json") {
        fail(`Archive target already has different contents for ${fileName}.`, {
          target: toDisplayPath(targetPath)
        });
      }
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

  fs.writeFileSync(filePath, contents, "utf8");
  return true;
}

function renderEvidenceIndex(targetRunDirectory, observed, generatedAt) {
  const runLabel = path.basename(targetRunDirectory);
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.${runLabel}.yaml`);

  return `# ${PHASE_ID} Evidence Index

- Baseline: \`${BASELINE_ID}\`
- Run: \`${PHASE_ID}.${runLabel}\`
- Source MVP01 Fixture: \`${toDisplayPath(fixtureRoot)}/\`
- Archived Raw Root: \`${toDisplayPath(rawDirectory)}/\`
- Generated At: \`${generatedAt}\`

## Evidence

| Type | Path | Description |
|---|---|---|
| Raw events | \`${toDisplayPath(path.join(rawDirectory, "combat_events.jsonl"))}\` | Archived MVP01 gameplay event stream used as MVP02 diagnosis input. |
| Attempt summary | \`${toDisplayPath(path.join(rawDirectory, "attempt_summary.json"))}\` | Archived MVP01 attempt summary. |
| Diagnosis | \`${toDisplayPath(path.join(rawDirectory, "diagnosis.json"))}\` | MVP02 deterministic diagnosis output. |
| Run record | \`${toDisplayPath(runRecordPath)}\` | Accepted verifier run record. |
| Verifier run | \`npm run verify:mvp02\` | Passed automatic MVP02 diagnosis checks. |

## Observed Diagnosis

- Primary failure: \`${observed.primary_failure}\`
- Confidence: ${observed.confidence}
- Practice focus: \`${observed.practice_focus}\`
- 中文速读: ${observed.readable_zh_summary}
- Evidence seqs: \`${observed.evidence_event_seqs.join(", ")}\`
- Events read: ${observed.events}

## Notes

- The source input is copied from accepted MVP01 real gameplay evidence, not authored by hand.
- The verifier also checks an insufficient-evidence fixture to ensure MVP02 does not force unsupported attribution.
- MVP02 keeps \`llm_review.enabled=false\`; real LLM review is reserved for a later optional path.
`;
}

function renderRunRecord(targetRunDirectory, observed, insufficientObserved, generatedAt) {
  const runLabel = path.basename(targetRunDirectory);
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");

  return `id: ${PHASE_ID}.${runLabel}
baseline_id: ${BASELINE_ID}
status: accepted
started_at: ${yamlQuote(generatedAt)}
finished_at: ${yamlQuote(generatedAt)}
environment: "Windows, Node.js verifier, MVP01 archived gameplay fixture"
verifier_ref: ${verifierRef}
stimulus:
${renderYamlList([
  "Copy accepted MVP01 run-002 raw gameplay evidence into a verifier work directory.",
  "Run the compiled GuideBuddy diagnosis runtime to generate diagnosis.json.",
  "Verify deterministic attribution, evidence preservation, practice_objective_seed, readable_zh, and disabled llm_review placeholder.",
  "Run an insufficient-evidence fixture and verify it remains insufficient_evidence."
])}
results:
  - id: DIAGNOSIS_INPUT_PARSE
    status: pass
    evidence: ${toDisplayPath(rawDirectory)}/
  - id: DIAGNOSIS_OUTPUT_SCHEMA
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "diagnosis.json"))}
  - id: DETERMINISTIC_FATAL_ATTRIBUTION
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "diagnosis.json"))}
    observed:
      primary_failure: ${observed.primary_failure}
      confidence: ${observed.confidence}
      evidence_event_seqs:
${renderYamlList(observed.evidence_event_seqs, 8)}
  - id: PRACTICE_OBJECTIVE_SEED
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "diagnosis.json"))}
    observed:
      practice_focus: ${observed.practice_focus}
  - id: READABLE_ZH_SUMMARY
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "diagnosis.json"))}
    observed:
      summary: ${yamlQuote(observed.readable_zh_summary)}
  - id: INSUFFICIENT_EVIDENCE_GUARD
    status: pass
    evidence: ${toDisplayPath(insufficientWorkRun)}/diagnosis.json
    observed:
      primary_failure: ${insufficientObserved.primary_failure}
      status: ${insufficientObserved.status}
      readable_zh_summary: ${yamlQuote(insufficientObserved.readable_zh_summary)}
evidence:
  raw_root: ${toDisplayPath(rawDirectory)}/
  index: ${toDisplayPath(indexPath)}
  verifier_work_root: ${toDisplayPath(workRoot)}/
notes:
${renderYamlList([
  "The accepted MVP02 run uses a copied MVP01 gameplay fixture so the verifier is deterministic and does not require opening Unreal Editor.",
  "The fixture contains State.Death followed by enemy execution signals, allowing MVP02 to verify fatal attribution and evidence preservation.",
  "No real LLM API is used in MVP02."
])}
`;
}

function archiveEvidence(runDirectory, observed, insufficientObserved) {
  const summary = readJson(path.join(runDirectory, "attempt_summary.json"), "attempt_summary.json");
  const sourceRunId = String(summary.run_id || "");
  const existingArchive = sourceRunId ? findExistingArchive(sourceRunId) : undefined;
  const targetRunDirectory = existingArchive || allocateNextEvidenceRunDirectory();
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.${path.basename(targetRunDirectory)}.yaml`);
  const generatedAt = new Date().toISOString();
  const copyResult = copyRawEvidence(runDirectory, rawDirectory);

  fs.mkdirSync(targetRunDirectory, { recursive: true });
  fs.mkdirSync(runsRoot, { recursive: true });

  const indexWritten = writeTextIfChanged(indexPath, renderEvidenceIndex(targetRunDirectory, observed, generatedAt));
  const runRecordWritten = writeTextIfChanged(runRecordPath, renderRunRecord(targetRunDirectory, observed, insufficientObserved, generatedAt));

  return {
    status: existingArchive ? "refreshed" : "created",
    evidence_directory: toDisplayPath(targetRunDirectory),
    raw_directory: toDisplayPath(rawDirectory),
    index_path: toDisplayPath(indexPath),
    run_record_path: toDisplayPath(runRecordPath),
    copied_files: copyResult.copied,
    reused_files: copyResult.reused,
    index_written: indexWritten,
    run_record_written: runRecordWritten
  };
}

const runtime = loadDiagnosisRuntime();
const primaryRunDirectory = preparePrimaryFixture();
const primaryDiagnosis = runDiagnosis(runtime, primaryRunDirectory);
const observed = verifyPrimaryDiagnosis(primaryDiagnosis, primaryRunDirectory);

const insufficientRunDirectory = prepareInsufficientEvidenceFixture();
const insufficientDiagnosis = runDiagnosis(runtime, insufficientRunDirectory);
const insufficientObserved = verifyInsufficientEvidenceDiagnosis(insufficientDiagnosis);

const archive = archiveEvidence(primaryRunDirectory, observed, insufficientObserved);

console.log(JSON.stringify({
  ok: true,
  run_directory: toDisplayPath(primaryRunDirectory),
  primary_failure: observed.primary_failure,
  confidence: observed.confidence,
  insufficient_guard: insufficientObserved,
  archive
}, null, 2));
