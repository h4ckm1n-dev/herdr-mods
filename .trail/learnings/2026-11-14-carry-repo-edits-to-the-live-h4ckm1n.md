---
title: "Carry repo edits to the live Herdr mods as per-file patches, then re-run the dialog outline script"
author: H4ckm1n
date: 2026-11-14
branch: main
cost: { minutes: 12, tokens: 188013 }
id: l-5b3af805
scope: repo
status: active
src: agent
touches:
  - crew/mods/workspace-chrome-crew/dialog_outlines.py
---

## Decided
When a change is made in the repo first, it reaches the live Herdr home as a patch per file: the diff of that file (before the edit to after) applied to the live file. Neither side is overwritten, so unsynced work on either side survives.

## Tried and ruled out
Applying the diff straight to a live main.js: hunks touching an openOverlay call fail, because Crew rewrites those calls and appends an outline block at runtime. Copying the repo file over the live one would drop live-only work.

## Watch out
Patch the live file's plain form (outline block cut, the renamed overlay calls restored), write it back, then run the outline script once so the block returns. A mod folder that exists twice in the repo (git) maps to one live folder: apply it once. `herdr-app shot` stays on the last frame while the window is hidden, so three identical screenshots mean nothing was verified.

In the code: outline script `crew/mods/workspace-chrome-crew/dialog_outlines.py <herdr home>`, marker `// OhMyHerdr dialog outline`, renamed call `_omhOpenOverlay(`, live copy `~/.config/herdr-app/mods`.
