const fs = require("fs");
const path = require("path");

const PHASE_ID = "MVP03_LLM_COACHING_LOOP";
const BASELINE_VERSION = "v0.1";
const BASELINE_ID = `${PHASE_ID}@${BASELINE_VERSION}`;
const UPSTREAM_PHASE_ID = "MVP02_DIAGNOSTIC_SIGNAL_LAYER";
const ACCEPTED_GENERATED_AT = "2026-05-05T12:00:00.000Z";

const repoRoot = path.resolve(__dirname, "../../..");
const fixtureRoot = path.join(
  repoRoot,
  "aiflow",
  "contracts",
  "evidence",
  UPSTREAM_PHASE_ID,
  "v0.1",
  "run-001",
  "raw"
);
const workRoot = path.join(repoRoot, "Saved", "GuideBuddy", "CoachingVerifier", PHASE_ID);
const primaryWorkRun = path.join(workRoot, "run-001-posture-break");
const insufficientWorkRun = path.join(workRoot, "insufficient-evidence");
const runsRoot = path.join(repoRoot, "aiflow", "contracts", "runs");
const evidenceRoot = path.join(repoRoot, "aiflow", "contracts", "evidence", PHASE_ID, BASELINE_VERSION);
const coachingRuntimePath = path.join(repoRoot, "Content", "JavaScript", "GuideBuddy", "coaching.js");
const verifierRef = `aiflow/contracts/verifiers/${PHASE_ID}.verifier.yaml`;
const requiredRawFiles = ["attempt_summary.json", "diagnosis.json", "coaching.json"];

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

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function preparePrimaryFixture() {
  for (const fileName of ["attempt_summary.json", "diagnosis.json"]) {
    const sourcePath = path.join(fixtureRoot, fileName);
    if (!fs.existsSync(sourcePath)) {
      fail(`Missing MVP02 fixture file: ${sourcePath}`);
    }
  }

  safeRemoveInsideWorkRoot(primaryWorkRun);
  fs.mkdirSync(primaryWorkRun, { recursive: true });
  copyFile(path.join(fixtureRoot, "attempt_summary.json"), path.join(primaryWorkRun, "attempt_summary.json"));
  copyFile(path.join(fixtureRoot, "diagnosis.json"), path.join(primaryWorkRun, "diagnosis.json"));
  return primaryWorkRun;
}

function prepareInsufficientEvidenceFixture() {
  safeRemoveInsideWorkRoot(insufficientWorkRun);
  fs.mkdirSync(insufficientWorkRun, { recursive: true });

  const summary = {
    schema_version: "guidebuddy.attempt_summary.v1",
    run_id: "mvp03_insufficient_evidence_fixture",
    map: "SyntheticInsufficientEvidence",
    start_time: "2026-05-05T00:00:00.000Z",
    end_time: "2026-05-05T00:00:02.000Z",
    duration_seconds: 2,
    end_reason: "manual_stop",
    death_info: null,
    last_events: [],
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
  const diagnosis = {
    schema_version: "guidebuddy.diagnosis.v1",
    run_id: "mvp03_insufficient_evidence_fixture",
    generated_at: "2026-05-05T00:00:02.000Z",
    source_files: {
      run_directory: insufficientWorkRun
    },
    deterministic: {
      status: "insufficient_evidence",
      primary_failure: "insufficient_evidence",
      category: "unknown",
      confidence: 0,
      evidence_event_seqs: [],
      signals: []
    },
    llm_review: {
      enabled: false,
      status: "not_configured"
    },
    final: {
      status: "insufficient_evidence",
      primary_failure: "insufficient_evidence",
      confidence: 0,
      summary: "No terminal death or obvious failure was found.",
      practice_objective_seed: {
        focus: "avoid_insufficient_evidence",
        target_error: "insufficient_evidence",
        evidence_event_seqs: [],
        candidate_drill_focuses: ["collect_more_failure_evidence"],
        measurable_metrics: [
          { id: "diagnosable_failure_windows", unit: "count", direction: "higher_is_better" }
        ]
      }
    }
  };

  fs.writeFileSync(path.join(insufficientWorkRun, "attempt_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(insufficientWorkRun, "diagnosis.json"), `${JSON.stringify(diagnosis, null, 2)}\n`, "utf8");
  return insufficientWorkRun;
}

function loadCoachingRuntime() {
  if (!fs.existsSync(coachingRuntimePath)) {
    fail(`Compiled coaching runtime does not exist. Run npm run build:guidebuddy first: ${coachingRuntimePath}`);
  }

  delete require.cache[coachingRuntimePath];
  const runtime = require(coachingRuntimePath);
  if (typeof runtime.generateCoachingForRunDirectory !== "function") {
    fail("coaching.js does not export generateCoachingForRunDirectory.");
  }

  return runtime;
}

function runCoaching(runtime, runDirectory, sourceKind) {
  const outputPath = path.join(runDirectory, "coaching.json");
  runtime.generateCoachingForRunDirectory(runDirectory, outputPath, {
    generatedAt: ACCEPTED_GENERATED_AT,
    playerLevel: "novice",
    provider: "local_rule_template",
    sourceKind
  });

  if (!fs.existsSync(outputPath)) {
    fail("Coaching runtime did not write coaching.json.", {
      run_directory: toDisplayPath(runDirectory)
    });
  }

  return readJson(outputPath, "coaching.json");
}

function hasChineseText(value) {
  return typeof value === "string" && /[\u4e00-\u9fff]/.test(value);
}

function verifyPrimaryCoaching(coaching, diagnosis) {
  const final = coaching.final || {};
  const reviewCard = coaching.review_card || {};
  const practiceObjective = coaching.practice_objective || {};
  const drillSpec = coaching.drill_spec_candidate || {};
  const inputSummary = coaching.llm_input_summary || {};
  const provider = coaching.provider || {};
  const diagnosisFinal = diagnosis.final || {};

  if (coaching.schema_version !== "guidebuddy.coaching.v1") {
    fail("coaching.json has unexpected schema_version.", {
      schema_version: coaching.schema_version
    });
  }

  if (provider.llm_api_called !== false || provider.kind !== "local_rule_template") {
    fail("MVP03 verifier expects the replaceable local provider and no real LLM API call.", {
      provider
    });
  }

  if (final.primary_failure !== diagnosisFinal.primary_failure) {
    fail("Coaching output drifted from deterministic diagnosis primary_failure.", {
      coaching_primary_failure: final.primary_failure,
      diagnosis_primary_failure: diagnosisFinal.primary_failure
    });
  }

  if (final.main_issue_count !== 1) {
    fail("Coaching must focus on exactly one main issue for the accepted fixture.", {
      final
    });
  }

  for (const field of ["diagnosis_sentence", "evidence_line", "next_action", "success_condition"]) {
    if (!hasChineseText(reviewCard[field])) {
      fail(`review_card.${field} must be a Chinese player-readable string.`, {
        review_card: reviewCard
      });
    }
  }

  if (!String(reviewCard.evidence_line || "").includes("#")) {
    fail("review_card.evidence_line should cite at least one event reference.", {
      evidence_line: reviewCard.evidence_line
    });
  }

  if (!practiceObjective.id || !Array.isArray(practiceObjective.measurable_metrics) || practiceObjective.measurable_metrics.length === 0) {
    fail("practice_objective is missing machine-readable objective fields.", {
      practice_objective: practiceObjective
    });
  }

  verifyDrillSpecCandidate(drillSpec);
  verifyHighSignalInputSummary(inputSummary, diagnosis);

  return {
    primary_failure: final.primary_failure,
    advice_focus: final.advice_focus,
    drill_template_id: final.drill_template_id,
    review_next_action: reviewCard.next_action,
    practice_objective_id: practiceObjective.id,
    generated_at: coaching.generated_at
  };
}

function verifyInsufficientCoaching(coaching) {
  const final = coaching.final || {};
  const drillSpec = coaching.drill_spec_candidate || {};
  if (final.status !== "insufficient_evidence" || final.main_issue_count !== 0) {
    fail("Insufficient-evidence coaching should remain cautious and avoid a false issue.", {
      final
    });
  }

  if (drillSpec.template_id !== "telemetry_capture_repeat") {
    fail("Insufficient-evidence coaching should only request another diagnosable capture.", {
      drill_spec_candidate: drillSpec
    });
  }

  return {
    status: final.status,
    drill_template_id: drillSpec.template_id
  };
}

function verifyDrillSpecCandidate(drillSpec) {
  const validation = drillSpec.validation || {};
  const allowedTemplateIds = Array.isArray(validation.allowed_template_ids) ? validation.allowed_template_ids : [];
  const allowedParameterNames = Array.isArray(validation.allowed_parameter_names) ? validation.allowed_parameter_names : [];
  const parameters = drillSpec.parameters || {};

  if (drillSpec.schema_version !== "guidebuddy.drill_spec_candidate.v1") {
    fail("drill_spec_candidate has unexpected schema_version.", {
      drill_spec_candidate: drillSpec
    });
  }

  if (!allowedTemplateIds.includes(drillSpec.template_id) || validation.template_whitelist_passed !== true) {
    fail("drill_spec_candidate uses a template outside the whitelist.", {
      drill_spec_candidate: drillSpec
    });
  }

  const extraParams = Object.keys(parameters).filter((name) => !allowedParameterNames.includes(name));
  if (extraParams.length > 0 || validation.parameter_whitelist_passed !== true) {
    fail("drill_spec_candidate includes parameters outside the whitelist.", {
      extra_parameters: extraParams,
      drill_spec_candidate: drillSpec
    });
  }

  if (drillSpec.safety?.llm_may_not_create_unreal_assets !== true) {
    fail("drill_spec_candidate must preserve the MVP03 safety boundary.", {
      drill_spec_candidate: drillSpec
    });
  }
}

function verifyHighSignalInputSummary(inputSummary, diagnosis) {
  const text = JSON.stringify(inputSummary);
  const diagnosisEvidenceSeqs = new Set(diagnosis.deterministic?.evidence_event_seqs || []);
  const summaryEvidenceSeqs = inputSummary.evidence?.event_seqs || [];
  const signals = inputSummary.evidence?.signals || [];

  if (text.includes("last_events") || text.includes("combat_events_jsonl") || text.includes("combat_events.jsonl")) {
    fail("llm_input_summary must not carry the raw event log or file-level event stream.", {
      llm_input_summary: inputSummary
    });
  }

  if (!Array.isArray(signals) || signals.length === 0 || signals.length > 6) {
    fail("llm_input_summary should keep a small high-signal evidence slice.", {
      signals
    });
  }

  const outsideEvidence = summaryEvidenceSeqs.filter((seq) => !diagnosisEvidenceSeqs.has(seq));
  if (outsideEvidence.length > 0) {
    fail("llm_input_summary invented evidence seqs not present in diagnosis.json.", {
      outside_evidence: outsideEvidence
    });
  }
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
  const diagnosisPath = path.join(runDirectory, "raw", "diagnosis.json");
  if (!fs.existsSync(diagnosisPath)) {
    return "";
  }

  const diagnosis = readJson(diagnosisPath, "archived diagnosis.json");
  return String(diagnosis.run_id || "");
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

    if (fs.existsSync(targetPath) && filesMatch(sourcePath, targetPath)) {
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

  fs.writeFileSync(filePath, contents, "utf8");
  return true;
}

function renderEvidenceIndex(targetRunDirectory, observed, insufficientObserved) {
  const runLabel = path.basename(targetRunDirectory);
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.${runLabel}.yaml`);

  return `# ${PHASE_ID} Evidence Index

- Baseline: \`${BASELINE_ID}\`
- Run: \`${PHASE_ID}.${runLabel}\`
- Source MVP02 Fixture: \`${toDisplayPath(fixtureRoot)}/\`
- Archived Raw Root: \`${toDisplayPath(rawDirectory)}/\`
- Generated At: \`${ACCEPTED_GENERATED_AT}\`

## Evidence

| Type | Path | Description |
|---|---|---|
| Attempt summary | \`${toDisplayPath(path.join(rawDirectory, "attempt_summary.json"))}\` | Archived MVP02 attempt summary used as MVP03 context. |
| Diagnosis | \`${toDisplayPath(path.join(rawDirectory, "diagnosis.json"))}\` | Archived MVP02 deterministic diagnosis input. |
| Coaching | \`${toDisplayPath(path.join(rawDirectory, "coaching.json"))}\` | MVP03 coaching output, practice objective, and Drill Spec candidate. |
| Run record | \`${toDisplayPath(runRecordPath)}\` | Accepted verifier run record. |
| Verifier run | \`npm run verify:mvp03\` | Passed automatic MVP03 coaching checks. |

## Observed Coaching

- Primary failure: \`${observed.primary_failure}\`
- Advice focus: \`${observed.advice_focus}\`
- Practice objective: \`${observed.practice_objective_id}\`
- Drill template: \`${observed.drill_template_id}\`
- Player action: ${observed.review_next_action}
- Insufficient-evidence guard: \`${insufficientObserved.status}\` -> \`${insufficientObserved.drill_template_id}\`

## Notes

- The generator uses a replaceable local provider; no real LLM API is called in MVP03.
- \`llm_input_summary\` carries a small evidence slice from \`diagnosis.json\`, not the raw combat event stream.
- \`drill_spec_candidate\` only references the template and parameter whitelist for MVP04 validation.
`;
}

function renderRunRecord(targetRunDirectory, observed, insufficientObserved) {
  const runLabel = path.basename(targetRunDirectory);
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");

  return `id: ${PHASE_ID}.${runLabel}
baseline_id: ${BASELINE_ID}
status: accepted
started_at: ${yamlQuote(ACCEPTED_GENERATED_AT)}
finished_at: ${yamlQuote(ACCEPTED_GENERATED_AT)}
environment: "Windows, Node.js verifier, MVP02 archived diagnosis fixture"
verifier_ref: ${verifierRef}
stimulus:
${renderYamlList([
  "Copy accepted MVP02 run-001 attempt_summary.json and diagnosis.json into a verifier work directory.",
  "Run the compiled GuideBuddy coaching runtime to generate coaching.json.",
  "Verify player-readable review card, high-signal LLM input summary, practice_objective, and whitelist-safe drill_spec_candidate.",
  "Run an insufficient-evidence fixture and verify the generator stays cautious."
])}
results:
  - id: COACHING_INPUT_PARSE
    status: pass
    evidence: ${toDisplayPath(rawDirectory)}/
  - id: COACHING_OUTPUT_SCHEMA
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "coaching.json"))}
  - id: HIGH_SIGNAL_LLM_INPUT_SUMMARY
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "coaching.json"))}
  - id: SINGLE_ISSUE_REVIEW_CARD
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "coaching.json"))}
    observed:
      primary_failure: ${observed.primary_failure}
      next_action: ${yamlQuote(observed.review_next_action)}
  - id: PRACTICE_OBJECTIVE
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "coaching.json"))}
    observed:
      practice_objective_id: ${observed.practice_objective_id}
  - id: DRILL_SPEC_CANDIDATE_WHITELIST
    status: pass
    evidence: ${toDisplayPath(path.join(rawDirectory, "coaching.json"))}
    observed:
      drill_template_id: ${observed.drill_template_id}
  - id: INSUFFICIENT_EVIDENCE_COACHING_GUARD
    status: pass
    evidence: ${toDisplayPath(insufficientWorkRun)}/coaching.json
    observed:
      status: ${insufficientObserved.status}
      drill_template_id: ${insufficientObserved.drill_template_id}
evidence:
  raw_root: ${toDisplayPath(rawDirectory)}/
  index: ${toDisplayPath(indexPath)}
  verifier_work_root: ${toDisplayPath(workRoot)}/
notes:
${renderYamlList([
  "MVP03 keeps the LLM boundary replaceable by using a local deterministic provider for accepted verification.",
  "The accepted fixture inherits MVP02 posture_break_into_execution diagnosis and turns it into one short player action.",
  "No Unreal asset, Blueprint, console command, or free-form scene instruction is emitted by the Drill Spec candidate."
])}
`;
}

function archiveEvidence(runDirectory, observed, insufficientObserved) {
  const diagnosis = readJson(path.join(runDirectory, "diagnosis.json"), "diagnosis.json");
  const sourceRunId = String(diagnosis.run_id || "");
  const existingArchive = sourceRunId ? findExistingArchive(sourceRunId) : undefined;
  const targetRunDirectory = existingArchive || allocateNextEvidenceRunDirectory();
  const rawDirectory = path.join(targetRunDirectory, "raw");
  const indexPath = path.join(targetRunDirectory, "index.md");
  const runRecordPath = path.join(runsRoot, `${PHASE_ID}.${path.basename(targetRunDirectory)}.yaml`);
  const copyResult = copyRawEvidence(runDirectory, rawDirectory);

  fs.mkdirSync(targetRunDirectory, { recursive: true });
  fs.mkdirSync(runsRoot, { recursive: true });

  const indexWritten = writeTextIfChanged(indexPath, renderEvidenceIndex(targetRunDirectory, observed, insufficientObserved));
  const runRecordWritten = writeTextIfChanged(runRecordPath, renderRunRecord(targetRunDirectory, observed, insufficientObserved));

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

const runtime = loadCoachingRuntime();
const primaryRunDirectory = preparePrimaryFixture();
const primaryDiagnosis = readJson(path.join(primaryRunDirectory, "diagnosis.json"), "diagnosis.json");
const primaryCoaching = runCoaching(runtime, primaryRunDirectory, "verifier");
const observed = verifyPrimaryCoaching(primaryCoaching, primaryDiagnosis);

const insufficientRunDirectory = prepareInsufficientEvidenceFixture();
const insufficientCoaching = runCoaching(runtime, insufficientRunDirectory, "verifier");
const insufficientObserved = verifyInsufficientCoaching(insufficientCoaching);

const archive = archiveEvidence(primaryRunDirectory, observed, insufficientObserved);

console.log(JSON.stringify({
  ok: true,
  run_directory: toDisplayPath(primaryRunDirectory),
  primary_failure: observed.primary_failure,
  advice_focus: observed.advice_focus,
  drill_template_id: observed.drill_template_id,
  insufficient_guard: insufficientObserved,
  archive
}, null, 2));
