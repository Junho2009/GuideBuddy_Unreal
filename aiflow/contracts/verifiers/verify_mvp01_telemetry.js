const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const telemetryRoot = path.join(repoRoot, "Saved", "GuideBuddy", "Telemetry");

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
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

const runDirectory = process.argv[2] ? path.resolve(process.argv[2]) : readLatestRunDirectory();
const eventsPath = path.join(runDirectory, "combat_events.jsonl");
const summaryPath = path.join(runDirectory, "attempt_summary.json");

if (!fs.existsSync(eventsPath)) {
  fail(`Missing combat_events.jsonl: ${eventsPath}`);
}

if (!fs.existsSync(summaryPath)) {
  fail(`Missing attempt_summary.json: ${summaryPath}`);
}

const events = parseJsonl(eventsPath);
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

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

console.log(JSON.stringify({
  ok: true,
  run_directory: runDirectory,
  events: events.length,
  event_types: [...eventTypes],
  summary_run_id: summary.run_id
}, null, 2));
