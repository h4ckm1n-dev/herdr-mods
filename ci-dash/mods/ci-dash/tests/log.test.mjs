// node tests/log.test.mjs : a failed run's log becomes steps and the text an agent is sent
import assert from "node:assert/strict";
import { failedSteps, failureReport } from "../format.js";

const log = [
  "build\tRun tests\t2026-01-01T10:00:00.1234567Z ##[group]Run npm test",
  "build\tRun tests\t2026-01-01T10:00:01.0000000Z \x1b[31mFAIL\x1b[0m src/a.test.js",
  "build\tRun tests\t2026-01-01T10:00:02.0000000Z   expected 1\tgot 2",
  "build\tRun tests\t2026-01-01T10:00:03.0000000Z ##[error]Process completed with exit code 1.",
  "build\tRun tests\t2026-01-01T10:00:03.5000000Z Cleaning up orphan processes",
  "lint\tRun eslint\t2026-01-01T10:00:04.0000000Z one",
  "lint\tRun eslint\t2026-01-01T10:00:05.0000000Z two",
  "lint\tRun eslint\t2026-01-01T10:00:06.0000000Z three",
  "not a log line",
  "",
].join("\n");

const steps = failedSteps(log, 2);
assert.deepEqual(steps, [
  { job: "build", step: "Run tests", cut: 1, lines: ["  expected 1\tgot 2", "error: Process completed with exit code 1."] },
  { job: "lint", step: "Run eslint", cut: 1, lines: ["two", "three"] },
]);
assert.deepEqual(failedSteps(""), []);
assert.deepEqual(failedSteps("deploy\tUNKNOWN STEP\t2026-01-01T10:00:00Z boom"), [{ job: "deploy", step: "", cut: 0, lines: ["boom"] }]);
assert.equal(failedSteps("j\ts\t2026-01-01T10:00:00Z " + "x".repeat(500))[0].lines[0].length, 300, "a long line is cut");

const run = { run_number: 12, display_title: "fix parser", name: "CI", head_branch: "main", html_url: "https://github.com/o/r/actions/runs/1" };
assert.equal(failureReport(run, steps), [
  'CI run #12 "fix parser" failed on main (CI): https://github.com/o/r/actions/runs/1', "",
  "build › Run tests (last 2 lines):", "  expected 1\tgot 2", "error: Process completed with exit code 1.", "",
  "lint › Run eslint (last 2 lines):", "two", "three", "",
].join("\n"));
console.log("ok");
