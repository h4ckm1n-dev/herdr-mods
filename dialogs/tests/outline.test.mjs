import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const helper = fileURLToPath(new URL("../../crew/mods/workspace-chrome-crew/dialog_outlines.py", import.meta.url));
const code = `import importlib.util, sys
spec = importlib.util.spec_from_file_location("outlines", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(module.outlined("export default class Dialog extends View { render() { return element; } open(spec) { return openOverlay(spec); } }"))`;
const source = execFileSync("python3", ["-c", code, helper], { encoding: "utf8" })
  .replace(/^import .*;$/gm, "")
  .replace("export default class Dialog", "globalThis.Dialog = class Dialog");
let props = {};
const calls = [];
const element = {
  rounded(value) { calls.push(["rounded", value]); return this; },
  border_1() { calls.push(["border", 1]); return this; },
  border_color(value) { calls.push(["color", value]); return this; },
};
const opened = [], closed = [], shared = {};
const context = { _omhShared: (key) => shared[key], _omhSetShared: (key, value) => { shared[key] = value; }, _omhHostOpenOverlay: (spec) => { opened.push(spec); return "new-overlay"; }, _omhCloseOverlay: (id) => closed.push(id), View: class {}, element, _omhModalProps: () => props, _omhModalTheme: () => ({ accent: "#abcdef" }) };
vm.runInNewContext(source, context);
const dialog = new context.Dialog();
assert.equal(dialog.render(), element);
assert.equal(calls.length, 0, "ordinary panels keep their original appearance");
props = { overlay: "original-confirm" };
dialog.render();
assert.deepEqual(calls, [["rounded", 8], ["border", 1], ["color", "#abcdef"]]);
for (const extra of [{ menu: {} }, { sortMenu: true }, { part: "bar" }, { kind: "screen" }, { role: "menu" }, { role: "settings" }]) {
  calls.length = 0;
  props = { overlay: "popup", ...extra };
  dialog.render();
  assert.equal(calls.length, 0, "menus and title bars retain their styling");
}
console.log("Dialog outlines follow the theme without changing panels, menus or full-screen views.");

const layoutSpec = { kind: "dialog", width: 640, layout: { type: "column", children: [{ content: { terminal: "t1" } }] } };
assert.equal(dialog.open(layoutSpec), "new-overlay");
assert.equal(opened[0].frame, "none");
assert.equal(opened[0].layout.border.color, "accent");
assert.equal(opened[0].layout.children[0].content.terminal, "t1");
assert.equal(layoutSpec.frame, undefined, "the caller’s spec remains unchanged");
const popupSpec = { kind: "popup", width: 200 };
dialog.open(popupSpec);
assert.equal(opened[1], popupSpec, "pointer popups retain their frame");

const peekSource = execFileSync("python3", ["-c", code.replaceAll("class Dialog", "class Peek"), helper], { encoding: "utf8" })
  .replace(/^import .*;$/gm, "")
  .replace("export default class Peek", "globalThis.Peek = class Peek");
const peekContext = { ...context };
vm.runInNewContext(peekSource, peekContext);
props = { overlay: "terminal-peek", terminal: "t42" };
new peekContext.Peek().init();
assert.equal(closed.at(-1), "terminal-peek");
assert.equal(opened.at(-1).layout.border.color, "accent");
assert.equal(opened.at(-1).layout.children[1].content.terminal, "t42");
new peekContext.Peek().init();
assert.ok(closed.includes("new-overlay"), "repeated native peeks replace the previous preview");
const count = opened.length;
props = { overlay: "outlined-peek", terminal: "t42", _omhOutlinedTerminal: true };
new peekContext.Peek().init();
assert.equal(opened.length, count, "outlined terminal peeks never recursively reopen");
props.overlay = "new-overlay";
new peekContext.Peek().close();
assert.equal(shared["ohmyherdr.peek"], null, "closing the preview clears its replacement id");
console.log("Terminal/layout dialogs retain their terminal and receive a complete accent frame.");
