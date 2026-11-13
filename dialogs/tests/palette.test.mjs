import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const events = [];
const context = {
  View: class {},
  run: (...args) => events.push(["run", ...args]),
  openOverlay: (spec) => events.push(["open", spec]),
  closeOverlay: (id) => events.push(["close", id]),
  props: () => ({ overlay: "palette" }),
  shared: () => "crew",
  localStorage: { setItem() {} },
};
let source = readFileSync(new URL("../mods/palette-crew/main.js", import.meta.url), "utf8");
source = source.replace(/^import .*;$/gm, "").replace("export default class Palette", "globalThis.Palette = class Palette");
vm.runInNewContext(source, context);
const palette = new context.Palette();

function choose(name, args = {}) {
  events.length = 0;
  palette.recent = [];
  palette.go({ id: name, name, args });
  return JSON.parse(JSON.stringify(events));
}
const settings = choose("app.settings", { section: "updates" });
assert.deepEqual(settings[0], ["close", "palette"]);
assert.deepEqual(settings[1], ["open", {
  mod: "settings-crew", kind: "dialog", frame: "none", width: 1040, height: 585, props: { section: "updates" },
}]);
assert.equal(choose("app.help")[1][1].mod, "help-crew");
assert.equal(choose("mod.clone")[1][1].mod, "prompt-crew");
assert.deepEqual(choose("layout.clone")[1], ["run", "layout.clone", { name: "crew" }]);
assert.deepEqual(choose("tab.new", { folder: "/tmp/project" })[1], ["run", "tab.new", { folder: "/tmp/project" }]);
console.log("Palette routing preserves sections, original actions and close-before-open order.");
