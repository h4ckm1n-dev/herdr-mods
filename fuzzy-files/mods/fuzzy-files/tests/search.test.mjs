import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const source = readFileSync(new URL("../search.js", import.meta.url), "utf8");
const { fuzzy, rank, context, openArgs, QUIT_CLOSES_TAB, hits, thousands, tilde } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

assert(fuzzy("mf", "src/main-file.js") !== null, "subsequence match");
assert.equal(fuzzy("xyz", "src/main.js"), null);
assert(fuzzy("MAIN", "src/main.js") !== null, "case insensitive");
assert.equal(rank(["long/path/xmain.js", "main.js", "other.txt"], "main")[0], "main.js");
assert.deepEqual(rank(["b", "a"], ""), ["b", "a"]);
assert.deepEqual(rank(["a b", "ab"], "a b"), ["a b"], "spaces are literal, not shell syntax");

const spaces = [{ id: "remote/s", active: true, machine: "remote", folder: "/fallback", tabs: [{ id: "remote/t", active: true }] }];
const focus = { space: "remote/s", tab: "remote/t", pane: "remote/p", cwd: "/stale" };
const panes = [{ pane: "remote/p", tab: "remote/t", cwd: "/project/sub" }, { pane: "p2", tab: "other", cwd: "/wrong" }];
const loc = context(focus, spaces, panes);
assert.deepEqual(loc, { space: "remote/s", on: "remote", root: "/project/sub" });
assert.equal(context({ ...focus, pane: "mod", cwd: null }, spaces, panes).root, "/project/sub");
assert.equal(context({ ...focus, pane: null, terminal: "other/t", cwd: "/wrong" }, spaces, []).root, "/fallback");
assert.equal(context(null, [], []).root, undefined);
const path = "-notes ' $(touch nope)\n.md";
assert.deepEqual(openArgs(loc, path).argv, ["nvim", "--cmd", QUIT_CLOSES_TAB, "--", path], "a path is one literal argument, after the quit-closes-tab autocmd");
assert.equal(openArgs(loc, path).space, "remote/s");
assert.equal(openArgs(loc, path).folder, "/project/sub");

// Neovim receives the exact filename in its new tab, including shell metacharacters.
const temp = mkdtempSync(join(tmpdir(), "fuzzy-nvim-"));
try {
  mkdirSync(join(temp, "data"));
  const file = join(temp, "data", path);
  writeFileSync(file, "finder integration fixture\n");
  const out = execFileSync("nvim", ["--headless", "-u", "NONE", "-i", "NONE", "-n", "-c",
    "lua if vim.uv.fs_realpath(vim.api.nvim_buf_get_name(0)) ~= vim.uv.fs_realpath(vim.fn.argv(0)) or vim.api.nvim_buf_get_lines(0, 0, 1, false)[1] ~= 'finder integration fixture' then vim.cmd('cquit 1') end",
    "-c", "qa!", ...openArgs(loc, file).argv.slice(1)],
    // no HC_TERMINAL_ID: the autocmd must load cleanly but not end the terminal running the tests
    { cwd: temp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HC_TERMINAL_ID: "" } });
  assert.equal(out, "");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
assert.deepEqual(hits("mjs", "src/main.js"), [4, 9, 10], "hits walk like fuzzy()");
assert.deepEqual(hits("zz", "src/main.js"), []);
assert.equal(thousands(1644), "1,644");
assert.equal(thousands(50000), "50,000");
assert.equal(tilde("/Users/ann/Documents/app"), "~/Documents/app");
assert.equal(tilde("/home/ann"), "~");
assert.equal(tilde("/srv/app"), "/srv/app");
process.stdout.write("Fuzzy ranking, tab/machine context, literal argv and headless Neovim passed.\n");
