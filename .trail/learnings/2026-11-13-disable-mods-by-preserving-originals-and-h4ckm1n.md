---
title: Disable mods by preserving originals and swapping reversible replacements
author: H4ckm1n
date: 2026-11-13
branch: main
id: l-1918b72f
scope: repo
status: active
src: agent
touches:
  - README.md
  - claude-manager/mods/claude-manager/kit.js
  - claude-manager/mods/claude-manager/manage.py
  - crew/README.md
  - crew/RECIPE.md
  - crew/layouts/crew.json
  - crew/mods/agents-crew/codex_scan.py
  - crew/mods/agents-crew/kit.js
  - crew/mods/agents-crew/main.js
  - crew/mods/claude-usage/kit.js
---

## Decided
Herdr has no native enable/disable switch. The manager moves each original mod to disabled-mods and swaps in the installed native equivalent, or a disabled placeholder. It preserves layouts, keys and terminal sessions. The manager cannot disable itself.

## Tried and ruled out
Deleting mod folders or merely removing keybindings would leave broken layout references or let original code keep loading. Editing native Herdr core is unnecessary for this mod-level feature.

## Watch out
Enable before updating a disabled mod. Replacement edits must be resolved manually; restoring must never overwrite them. The installer refuses to update archived mods. An already open view may persist until hot reload.

In the code: mod-manager/mods/mod-manager/manage.py owns the reversible folder swaps, flock and digest checks. install.py guards disabled-mods before copying. Catalog coverage and roundtrip/failure tests live under mod-manager/mods/mod-manager/tests/.
