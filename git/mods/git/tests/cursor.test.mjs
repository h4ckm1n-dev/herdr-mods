import assert from "node:assert/strict";
import { changeItems, follow, windowTop, changeKeys, hintsFor, discardOf } from "../cursor.js";

const f = (path, status = "M", extra = {}) => ({ path, status, untracked: false, ...extra });
const groups = { staged: [f("a.js")], changes: [f("b.js"), f("new.txt", "U", { untracked: true })], conflicts: [f("c.js", "!")] };

// Headers, then each group's files in drawn order (conflicts first in Changes); folded groups keep only their header.
const items = changeItems(groups, { staged: false, changes: false });
assert.deepEqual(items.map((i) => i.id), ["h:staged", "f:staged:a.js", "h:changes", "f:changes:c.js", "f:changes:b.js", "f:changes:new.txt"]);
assert.deepEqual(changeItems(groups, { staged: true, changes: false }).map((i) => i.id), ["h:staged", "h:changes", "f:changes:c.js", "f:changes:b.js", "f:changes:new.txt"]);
assert.deepEqual(changeItems({ staged: [], changes: [], conflicts: [] }, {}), []);
assert.equal(changeItems({ staged: [f("1"), f("2"), f("3")], changes: [], conflicts: [] }, {}, 2).length, 3);
console.log("change items passed");

// The cursor follows its item; gone, the one after it; else the same place, clamped.
const ids = items.map((i) => i.id);
assert.equal(follow(ids, { id: "f:changes:b.js", index: 0 }), 4);
assert.equal(follow(ids, { id: "f:changes:gone", next: "f:changes:new.txt", index: 1 }), 5);
assert.equal(follow(ids, { id: "x", next: "y", index: 9 }), 5);
assert.equal(follow(ids, {}), 0);
assert.equal(follow([], { id: "x" }), -1);
// Staging b.js: it leaves Changes, the cursor lands on the next file there.
const after = changeItems({ staged: [f("a.js"), f("b.js")], changes: [f("new.txt", "U", { untracked: true })], conflicts: [f("c.js", "!")] }, {}).map((i) => i.id);
assert.equal(after[follow(after, { id: "f:changes:b.js", next: "f:changes:new.txt", index: 4 })], "f:changes:new.txt");
console.log("cursor follow passed");

// The window scrolls only as far as the cursor needs.
assert.equal(windowTop(0, 3, 10), 0);
assert.equal(windowTop(0, 12, 10), 3);
assert.equal(windowTop(5, 2, 10), 2);
assert.equal(windowTop(3, 8, 10), 3);
assert.equal(windowTop(4, 0, Infinity), 0);
assert.equal(windowTop(4, 6, undefined), 0);
console.log("window passed");

// Keys mirror the hover buttons: staged → unstage; conflicted → resolve (asks); changes → stage, discard (asks).
const keys = (id) => changeKeys(items.find((i) => i.id === id)).map((k) => [k.key, k.action.type]);
assert.deepEqual(keys("f:staged:a.js"), [["u", "unstage"]]);
assert.deepEqual(keys("f:changes:c.js"), [["s", "resolve"]]);
assert.deepEqual(keys("f:changes:b.js"), [["s", "stage"], ["d", "discard"]]);
assert.deepEqual(keys("h:staged"), [["u", "unstage"]]);
assert.deepEqual(keys("h:changes"), [["s", "stage"], ["d", "discard"]]);
// "all" leaves conflicted files out, as the header's buttons do.
assert.deepEqual(changeKeys(items.find((i) => i.id === "h:changes"))[0].action.paths, ["b.js", "new.txt"]);
assert.deepEqual(changeKeys({ id: "h:changes", group: "changes", files: [f("c.js", "!")] }), []);
assert.deepEqual(discardOf([f("b.js"), f("n", "U", { untracked: true })]), { type: "discard", tracked: ["b.js"], untracked: ["n"] });
assert.deepEqual(changeKeys(undefined), []);
console.log("change keys passed");

// Hints list only what works now.
const labels = (o) => hintsFor(o).map(([k]) => k);
assert.deepEqual(labels({ typing: true }), ["⌘↵", "Esc"]);
assert.deepEqual(labels({ region: "changes", item: items[1], other: "graph" }), ["↑↓", "↵", "u", "Space", "c", "m", "Tab", "Esc"]);
assert.deepEqual(labels({ region: "changes" }), ["↑↓", "c", "m", "Esc"]);
assert.deepEqual(hintsFor({ region: "graph", other: "changes", inner: true }).at(-1), ["Esc", "close"]);
assert.deepEqual(hintsFor({ region: "diff", other: "changes" }).map(([k]) => k), ["↑↓", "Tab", "Esc"]);
assert.deepEqual(hintsFor({ region: "diff", other: "changes", hunks: "stage" }).map(([k]) => k), ["↑↓", "n p", "s", "d", "Tab", "Esc"]);
assert.deepEqual(hintsFor({ region: "diff", hunks: "unstage" }).map(([k, w]) => `${k} ${w}`), ["↑↓ file", "n p hunk", "s unstage", "Esc terminal"]);
assert.deepEqual(hintsFor({}), [["Esc", "terminal"]]);
console.log("hints passed");
