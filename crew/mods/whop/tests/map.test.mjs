import test from "node:test";
import assert from "node:assert/strict";
import { toDisplay, reduce, compact } from "../map.js";
import { bizA, bizB } from "./fixtures.mjs";

test("totals across businesses: snapshots take last point, flows sum", () => {
  assert.deepEqual(toDisplay([bizA, bizB]), { mrr: "$49", net: "$45", netNegative: false, members: "2", visits: "10.2k" });
});
test("empty points (Whop's 'nothing yet') count as 0", () => {
  assert.equal(reduce({ data: { points: [] } }, "sum"), 0);
  assert.equal(reduce(null, "last"), 0);
});
test("negative net revenue is flagged", () => {
  assert.equal(toDisplay([bizB]).netNegative, true);
  assert.equal(toDisplay([bizB]).net, "$−5");
});
test("compact formatting", () => {
  assert.equal(compact(950), "950");
  assert.equal(compact(12500), "12.5k");
  assert.equal(compact(1.2e6), "1.2M");
  assert.equal(compact(NaN), "—");
});
test("garbage in does not throw", () => {
  assert.deepEqual(toDisplay(null), { mrr: "$0", net: "$0", netNegative: false, members: "0", visits: "0" });
});
