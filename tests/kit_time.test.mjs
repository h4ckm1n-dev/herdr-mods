// The kit's time formatters, checked without Herdr: node tests/kit_time.test.mjs
// (kit.js imports gpui-kit, so the three functions are cut out of the source and run alone.)
import fs from "node:fs";
import assert from "node:assert/strict";
const src = fs.readFileSync(new URL("../crew/mods/agents-crew/kit.js", import.meta.url), "utf8");
const code = src.slice(src.indexOf("export const clock"), src.indexOf("export const plural")).replace(/export /g, "");
const f = new Function(`${code}; return { ago, agoWords, took };`)();
const now = Date.UTC(2026, 10, 14, 12);
assert.equal(f.ago(now - 30e3, now), "now");
assert.equal(f.ago(now - 12 * 60e3, now), "12m");
assert.equal(f.ago((now - 3 * 3600e3) / 1000, now), "3h"); // unix seconds
assert.equal(f.ago(new Date(now - 5 * 86400e3).toISOString(), now), "5d");
assert.equal(f.ago(now - 40 * 86400e3, now), "Oct 5");
assert.equal(f.ago(now - 400 * 86400e3, now), "Oct 2025");
assert.equal(f.ago(null), "");
assert.equal(f.agoWords(now - 30e3, now), "just now");
assert.equal(f.agoWords(now - 12 * 60e3, now), "12m ago");
assert.equal(f.agoWords(now - 40 * 86400e3, now), "Oct 5");
assert.equal(f.took(now - 252e3, now), "4m 12s");
assert.equal(f.took("2026-11-14T10:00:00Z", "2026-11-14T11:04:00Z"), "1h 04m");
assert.equal(f.took(now, now - 1), "");
console.log("kit time ok");
