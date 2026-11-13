import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileIcon } from "../file-icon.js";
import ICONS from "../icons.js";

const icon = (path, dir = false, open = false, dark = true) => fileIcon(path, dir, open, dark);
assert.match(icon("index.ts"), /typescript\.svg$/);
assert.match(icon("PACKAGE.JSON"), /nodejs\.svg$/);
assert.match(icon("unknown-extension.xyzzy"), /\/file\.svg$/);
assert.match(icon("unknown-folder", true), /\/folder\.svg$/);
assert.match(icon("src", true, true), /folder-src-open\.svg$/);
assert.equal(icon("app.spec.ts"), `mods/files-crew/icons/${ICONS.fileExtensions["spec.ts"]}.svg`);
assert.equal(icon("project/.github/workflows", true), icon(".github/workflows", true));
assert.equal(icon("__tests__", true), icon("tests", true));
for (const [name, id] of Object.entries(ICONS.light.fileNames)) {
  assert.equal(icon(name, false, false, false), `mods/files-crew/icons/${id}.svg`);
}
for (const tables of [ICONS, ICONS.light]) {
  for (const table of ["fileNames", "fileExtensions", "folderNames"]) {
    for (const id of Object.values(tables[table])) {
      assert.ok(existsSync(new URL(`../icons/${id}.svg`, import.meta.url)), id);
      if (table === "folderNames") {
        const open = id.endsWith("_light") ? `${id.slice(0, -6)}-open_light` : `${id}-open`;
        assert.ok(existsSync(new URL(`../icons/${open}.svg`, import.meta.url)), open);
      }
    }
  }
}
console.log("Icon matching, light overrides and every referenced SVG passed.");
