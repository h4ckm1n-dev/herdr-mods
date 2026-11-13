---
title: Style modal dialogs through mods without rebuilding Herdr
author: H4ckm1n
date: 2026-11-13
branch: main
id: l-67db81eb
scope: repo
status: active
src: agent
touches:
  - README.md
  - claude-manager/mods/claude-manager/kit.js
  - claude-manager/mods/claude-manager/main.js
  - claude-manager/mods/claude-manager/manage.py
  - crew/README.md
  - crew/RECIPE.md
  - crew/layouts/crew.json
  - crew/mods/agents-crew/codex_scan.py
  - crew/mods/agents-crew/kit.js
  - crew/mods/agents-crew/main.js
---

## Decided
Apply modal appearance through mods, without rebuilding or replacing Herdr. The user explicitly corrected the rebuild approach. Use the theme accent for dialog outlines, including Herdr originals and terminal previews.

## Tried and ruled out
A native renderer patch would enforce the geometry globally but requires a full build. Personal Settings/palette copies alone miss native command routes. Styling only the shared kit also misses Herdr originals and private mods.

## Watch out
Herdr restores shipped mods and frame files on startup. Crew reapplies a reversible render decorator, backs up originals, and restores unchanged sources when it closes. A later user edit must survive both restore and decorator upgrades. Abrupt termination may leave edits for Herdr to archive at next startup. Native terminal previews must replace the prior outlined preview, reuse its terminal, and clear the saved overlay ID on close. Never replace the installed app for these style-only changes.

In the code: crew/mods/workspace-chrome-crew/dialog_outlines.py and main.js manage the decorator; dialogs/README.md records geometry coverage and lifecycle limits. Tests: python3 -m unittest discover -s dialogs/tests; node dialogs/tests/outline.test.mjs; node dialogs/tests/palette.test.mjs.
