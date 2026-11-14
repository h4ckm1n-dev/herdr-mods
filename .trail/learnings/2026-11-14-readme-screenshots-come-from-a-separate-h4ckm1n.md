---
title: "README screenshots come from a separate demo Herdr with real Haiku agents, made-up data, and a macOS window capture that keeps the transparency"
author: H4ckm1n
date: 2026-11-14
branch: ux-pass
cost: { minutes: 35, tokens: 202209 }
id: l-4c949bb1
scope: repo
status: active
src: agent
touches:
  - mod-manager/mods/mod-manager/catalog.json
  - mods.tsv
  - README.md
  - crew/README.md
  - dialogs/mods/machine-add-crew/main.js
  - dialogs/mods/palette-crew/main.js
  - dialogs/mods/prompt-crew/main.js
  - dialogs/mods/settings-crew/main.js
  - filetree/mods/filetree/main.js
  - session-recap/mods/session-recap/main.js
---

## Decided
The user chose, for README screenshots: the patched Herdr build with its transparency, every mod of the repo switched on (the opt-in dialogs and filetree too), real Claude Code agents on Haiku working in fictional acme projects, made-up cost history and skills for Cost and Claude Manager, and a macOS capture of the window alone so the PNG keeps the real translucency. The user brings the demo window to the front themselves.

## Tried and ruled out
- The app's own screenshot command: it does not show what is behind the window, so the transparency is lost, and it returns the last drawn frame while the window is hidden.
- Capturing the screen area with the wallpaper behind: shows the user's desktop or another app.
- The user's real spaces and real ~/.claude data: project names and the skills list would end up in the README.
- No agents at all: the Agents list and the hero would not show Needs you / Working / Done.
- Bringing the demo window to the front by command: it takes the keyboard, and what the user types elsewhere would land in a demo terminal.

## Watch out
- Start the demo from a clean environment. Launched from inside a Claude Code session, its agents inherit the child-session marker and save no transcript, so the Agents list and Session recap stay empty.
- Start the core first without the demo Claude folder (agents then use the real login), then the app with it (the mods read the made-up data).
- Run the installer for the demo home with the Claude folder variable pointing nowhere, or `-y` wraps the user's real statusline.
- Herdr only draws a window that is on screen; Haiku agents finish in under two minutes, so start the "working" ones right before capturing.
- The user's global hooks write graft/ and .ignore into the demo projects: exclude them in each demo repo.
- The per-module hero images are designed montages with captions, not captures.

In the code: demo home `~/.config/herdr-app-demo`, core session `HC_SESSION=herdr-demo`, app id `HERDR_APP_ID=herdr-demo`, demo projects `~/acme/{api,web,web-checkout,docs,mobile}`, demo Claude folder `~/acme/.claude-demo` via `CLAUDE_CONFIG_DIR`, capture `screencapture -x -o -l <window id>`, window 1280x820 (2560x1640 px), agents `claude --model haiku` through `herdr-app do space.new|tab.new --argv --task`.
