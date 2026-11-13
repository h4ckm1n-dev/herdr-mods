---
title: Dialogs keep accent switches and end with a keycap footer
author: H4ckm1n
date: 2026-11-13
branch: main
cost: { minutes: 1, tokens: 1553 }
id: l-fd172cd9
scope: repo
status: active
src: agent
---

## Decided
The user chose to keep the switches in the accent color on every enabled row in the mods dialog, matching the Claude manager. The switch alone shows on/off: no repeated On/Off badge, a tag only for "Always on" / "Not installed". Find files and the mods dialog end the same way: a hairline, keycap hints (↵ / ↑↓ / Esc) on the left, one dim fact on the right. In Find files the name comes first and its folder dims after it, so a long path cuts the folder, never the name; matched characters are lit in the accent.

## Tried and ruled out
Neutral grey switches with the accent kept for the selection: the user preferred consistency with the Claude manager. Folder before the name: a long folder pushed the name out of view.

## Watch out
A mod cannot import another mod's JS (a dynamic import of files-crew/file-icon.js failed silently), so copy what you need into the mod. `herdr-app shot` returns the last rendered frame; when the window is hidden it stays frozen, so check `herdr-app status` overlays before concluding an overlay failed.

In the code:
- mod-manager/mods/mod-manager/main.js
- fuzzy-files/mods/fuzzy-files/main.js
- fuzzy-files/mods/fuzzy-files/search.js
