import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../main.js", import.meta.url), "utf8")
  .replace(/^import .*;.*$/gm, "").replace("export default class", "class");
let request, focused = 0;
const FileTree = new Function("View", "shared", `${source}\nreturn FileTree;`)(class {}, () => request);
const tree = new FileTree(), stop = new Error("stop before native rendering");
tree.handle = { focus() { focused++; } };
tree.sync = () => { throw stop; };
const render = () => assert.throws(() => tree.render({ timer: { after(_ms, fn) { fn(); } } }), e => e === stop);
const now = Date.now();
request = { mod: "filetree", at: now };
render(); render();
assert.equal(focused, 1, "one request focuses the tree once");
request = { mod: "git", at: now + 1 };
render();
assert.equal(focused, 1, "another panel's request is ignored");
tree.focusAt = 0;
request = { mod: "filetree", at: now - 5000 };
render();
assert.equal(focused, 1, "expired requests do not steal focus");
request = { mod: "filetree", at: Date.now() };
render();
assert.equal(focused, 2, "a fresh request focuses the tree again");
console.log("Crew focus requests: fresh, repeated, unrelated and expired cases passed.");
