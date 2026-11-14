// node help-crew/mods/help-crew/tests/binds.test.mjs
import assert from "node:assert/strict";
import { entries, label, groupOf, runnable } from "../binds.js";

const b = (section, keys, action) => ({ section, keys, action });
const bound = [
  b("global", "cmd-t", "tab.new"),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => b("global", `cmd-${n}`, `tab.select:${n}`)),
  b("global", "cmd-/", "mod.open:help-crew"), b("global", "cmd-shift-/", "mod.open:help-crew"),
  b("global", "cmd-d", "pane.split:right"),
  b("layout:OhMyHerdr", "cmd-g", "tabs-crew.graph"),
  b("terminal", "alt-left", "send:\u001bb"),
  b("global", "cmd-alt-o", "mod.open:ops-actions"),
];
const all = entries(bound), by = (action) => all.find((e) => e.action === action);

assert.equal(label("tab.new"), "New tab");
assert.equal(label("pane.split:right"), "Split pane right");
assert.equal(label("app.zoom_in"), "Zoom in");
assert.equal(label("tabs-crew.graph"), "Git panel");
assert.equal(label("mod.open:ops-actions"), "Open ops actions");
assert.equal(label("whop.sync"), "Whop: sync");
assert.equal(groupOf("tabs-crew.graph"), "Mods");
assert.equal(groupOf("send:x"), "Terminal");

// nine numbered bindings fold into one line, its key a range
assert.equal(all.filter((e) => e.action.startsWith("tab.select")).length, 1);
assert.deepEqual(by("tab.select:1–9").keys, ["cmd-1–9"]);
assert.equal(by("tab.select:1–9").label, "Select tab 1–9");
// one action, two keys: one line
assert.deepEqual(by("mod.open:help-crew").keys, ["cmd-/", "cmd-shift-/"]);
assert.equal(by("tabs-crew.graph").where, "OhMyHerdr layout");
assert.equal(all[0].group, "Tabs"); // group order, not file order
assert.equal(all.at(-1).group, "Mods");

const known = [{ name: "pane.split", args: [{ name: "direction", required: true }] }, { name: "tab.new", args: [{ name: "name", required: false }] },
  { name: "tab.rename", args: [{ name: "id", required: true }] }, { name: "app.reset", args: [] }, { name: "app.quit", args: [] },
  { name: "tab.close", args: [{ name: "id", required: false }] }, { name: "terminal.copy", args: [] }];
// the action goes to run() as keys.json writes it: Herdr parses name:value itself
assert.equal(runnable(by("pane.split:right"), known), "pane.split:right");
assert.equal(runnable(by("tab.new"), known), "tab.new");
assert.equal(runnable(by("mod.open:help-crew"), known), "mod.open:help-crew");
assert.equal(runnable(by("tabs-crew.graph"), known), "tabs-crew.graph");
assert.equal(runnable(by("tab.select:1\u20139"), known), null);
assert.equal(runnable(by("send:\u001bb"), known), null);
assert.equal(runnable({ action: "tab.rename" }, known), null); // needs an argument a key press supplies
assert.equal(runnable({ action: "terminal.copy:x" }, known), null); // a value for a command that takes none
// a click on the sheet is a look: nothing that closes, quits or resets runs from it
for (const a of ["app.reset", "app.quit", "tab.close", "pane.close", "space.close", "window.close", "terminal.kill", "app.update", "app.hide"])
  assert.equal(runnable({ action: a }, known), null, a);
console.log("binds ok");
