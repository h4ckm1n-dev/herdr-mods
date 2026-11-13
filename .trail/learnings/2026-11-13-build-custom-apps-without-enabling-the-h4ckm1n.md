---
title: Build custom apps without enabling the official replacement updater
author: H4ckm1n
date: 2026-11-13
branch: main
id: l-5121ac19
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
Build the opacity/blur variant as an ordinary source build and package the bundle locally. Pin the official base and carry the committed feature diff so the build does not drift with upstream master.

## Tried and ruled out
Reusing the upstream release packager would enable the official updater, which could replace the custom app and remove the patch. The normal upstream macOS installer also writes directly over the installed app; this builder leaves installation to the user.

## Watch out
HERDR_RELEASES_URL also opts source builds into updater checks at runtime. Leave it unset when launching the custom app. A new pinned base requires revalidating the patch and native behavior.

In the code: native/window-opacity/build.sh unsets HERDR_APP_RELEASE during compilation. The supplied Herdr checkout's src/update.rs checks compile-time HERDR_APP_RELEASE or runtime HERDR_RELEASES_URL; scripts/package sets HERDR_APP_RELEASE=1. Base a547b16ccb5e8811b2dd8b3b901d31df8f05e55a and feature a2d61819f9659175a354b3f14df1aaf85d414b78.
