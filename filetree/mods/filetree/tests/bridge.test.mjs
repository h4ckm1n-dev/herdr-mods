import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "herdr-filetree-bridge-"));
const script = join(dir, "bridge.ts"), state = join(dir, "state"), log = join(state, "activity.jsonl");
writeFileSync(script, readFileSync(new URL("../bridge.ts", import.meta.url), "utf8")
  .replace('const DIR = `${HOME}/.local/state/herdr-filetree`;', `const DIR = ${JSON.stringify(state)};`));
function run(event, codex = false) {
  rmSync(log, { force: true });
  const result = spawnSync("bun", [script, ...(codex ? ["--codex"] : [])], {
    input: typeof event === "string" ? event : JSON.stringify({ cwd: "/project", session_id: "test", tool_use_id: "call", ...event }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) : [];
}
try {
  const read = run({ hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "/project/a.ts" } });
  assert.equal(read[0].agent, "claude");
  assert.deepEqual(read[0].paths, ["/project/a.ts"]);
  assert.equal(read[0].kind, "read");
  assert.deepEqual(run({ hook_event_name: "PostToolUseFailure", tool_name: "Write", tool_input: { file_path: "/project/a.ts" } }), []);

  const patch = "*** Begin Patch\n*** Add File: a.ts\n+x\n*** Update File: old.ts\n*** Move to: folder/new.ts\n@@\n-x\n+y\n*** Delete File: gone.ts\n*** End Patch";
  const applied = run({ hook_event_name: "PostToolUse", tool_name: "apply_patch", tool_input: { command: patch }, tool_response: "Success. Updated the following files" }, true);
  assert.equal(applied[0].agent, "codex");
  assert.equal(applied[0].kind, "write");
  assert.deepEqual(applied[0].paths, ["/project/a.ts", "/project/old.ts", "/project/folder/new.ts", "/project/gone.ts"]);
  assert.deepEqual(run({ hook_event_name: "PostToolUse", tool_name: "apply_patch", tool_input: { command: patch }, tool_response: "Error: patch rejected" }, true), []);
  assert.deepEqual(run({ hook_event_name: "PostToolUse", tool_name: "apply_patch", tool_input: { command: patch }, tool_response: { success: false } }, true), []);

  const shell = run({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { cmd: 'rtk proxy cat "a file.ts"', workdir: "/other" }, tool_response: { stdout: "private file contents", exit_code: 0 } }, true);
  assert.deepEqual(shell[0].paths, ["/other/a file.ts"]);
  assert.ok(!JSON.stringify(shell).includes("private file contents"));
  const pre = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "rtk git commit -m test" } }, true);
  assert.deepEqual(pre.map(e => e.kind), ["bash-start", "git"]);
  assert.equal(pre[1].state, "running");
  const failed = run({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "rtk git commit -m test" }, tool_response: { stdout: "", exit_code: 1 } }, true);
  assert.equal(failed.find(e => e.kind === "git").state, "failed");
  assert.deepEqual(run("not json", true), []);
  assert.deepEqual(run({ hook_event_name: "PostToolUse", tool_name: "unrelated" }, true), []);
  console.log("Claude/Codex activity: reads, patches, moves, RTK, failures and malformed input passed.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
