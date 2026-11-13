import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../main.js", import.meta.url), "utf8")
  .replace(/^import .*;.*$/gm, "").replace("export default class", "class");

function setup({ on = null, available = false, failOpen = false } = {}) {
  const calls = [], actions = [], errors = [], previews = [], tasks = [], timers = [];
  const exec = async (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { code: cmd === "nvim" && available ? 0 : 1 }; };
  const run = (name, args) => { if (failOpen && name === "terminal.open") throw new Error("cannot open terminal"); actions.push({ name, args }); };
  const terminals = () => [{ address: on ? `${on}/t7` : "t7", argv: ["nvim", "--listen", calls[0]?.args[1]] }];
  const FileTree = new Function("View", "exec", "run", "terminals", "notify", `${source}\nreturn FileTree;`)(class {}, exec, run, terminals, e => errors.push(e));
  const tree = new FileTree();
  tree.root = "/project's folder"; tree.on = on;
  tree.handle = { focus() {} };
  tree.show = rel => previews.push(rel);
  const cx = { notify() {}, stop_propagation() {}, spawn(fn) { tasks.push(fn(cx)); }, timer: { after(_ms, fn) { timers.push(fn); } } };
  const flush = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  return { tree, cx, calls, actions, errors, previews, timers, flush };
}

for (const flat of [false, true]) {
  const f = setup(), edited = [];
  f.tree.rows = () => [{ rel: "src/a.js", e: { dir: false }, flat }];
  f.tree.openFile = rel => edited.push(rel);
  f.tree.press("src/a.js", f.cx);
  f.tree.press("src/a.js", f.cx);
  assert.deepEqual(edited, ["src/a.js"], "single file click opens nvim; a double click does not open it twice");
  f.tree.key({ key: "enter" }, f.cx);
  assert.deepEqual(f.previews, ["src/a.js"], "Enter previews files in Tree and Recent");
  if (flat) {
    f.tree.view = "recent";
    f.tree.jump(f.cx);
    assert.deepEqual(f.previews, ["src/a.js", "src/a.js"], "submitting the Recent filter also previews");
  }
}

{
  const f = setup(), toggled = [];
  f.tree.rows = () => [{ rel: "src", e: { dir: true } }];
  f.tree.toggle = rel => toggled.push(rel);
  f.tree.press("src", f.cx); f.tree.press("src", f.cx);
  assert.deepEqual(toggled, ["src"], "double-clicking a folder preserves the single toggle");
  assert.equal(f.calls.length, 0);
  f.tree.hits = ["src"];
  let jumps = 0;
  f.tree.jump = () => jumps++;
  f.tree.key({ key: "enter" }, f.cx);
  assert.equal(jumps, 1, "Enter in search results still reveals the selection");
}

{
  const f = setup({ on: "remote", available: true });
  f.tree.openFile("quoted's file.ts", f.cx);
  await f.flush();
  assert.equal(f.calls[0].opts.on, "remote");
  assert.equal(f.calls[0].args[3], "execute('drop ' .. fnameescape('/project''s folder/quoted''s file.ts'))");
  assert.deepEqual(f.actions, [{ name: "pane.focus", args: { terminal: "remote/t7" } }], "existing project nvim is reused and focused");
}

{
  const f = setup({ on: "remote" });
  f.tree.openFile("first.ts", f.cx); f.tree.openFile("first.ts", f.cx);
  await f.flush();
  const opened = f.actions.filter(a => a.name === "terminal.open");
  assert.equal(opened.length, 1, "concurrent clicks start one project nvim");
  assert.equal(f.calls.find(c => c.cmd === "rm").opts.on, "remote");
  assert.equal(opened[0].args.folder, "/project's folder");
  assert.equal(opened[0].args.place, "tab");
  assert.equal(opened[0].args.argv.at(-1), "/project's folder/first.ts");
  assert.match(opened[0].args.argv[4], /autocmd VimLeave.*hc kill/);
  assert.equal(f.timers.length, 1, "startup guard expires after launch");
}

{
  const f = setup({ failOpen: true });
  f.tree.openFile("a.ts", f.cx);
  await f.flush();
  assert.equal(f.errors[0].title, "Could not open Neovim");
  assert.deepEqual(f.previews, ["a.ts"], "opening failure falls back to preview");
}

console.log("File opening passed: click/Enter, folders, remote reuse, quoting, startup guard and preview fallback.");
