---
title: "Published mods carry no feature that only works on the author's machine"
author: H4ckm1n
date: 2026-11-14
branch: main
cost: { minutes: 19, tokens: 552515 }
id: l-97d7038d
scope: repo
status: active
src: agent
touches:
  - claude-manager/README.md
  - claude-manager/RECIPE.md
  - claude-manager/mods/claude-manager/main.js
  - claude-manager/mods/claude-manager/manage.py
  - claude-manager/mods/claude-manager/tests/test_manage.py
  - theme-gallery/README.md
  - theme-gallery/RECIPE.md
  - theme-gallery/mods/theme-gallery/main.js
  - ci-dash/RECIPE.md
  - ci-dash/mods/ci-dash/gh.js
---

## Decided
The user removed a badge in the mods dialog that compared each installed mod with the repo it came from. The mods are published for other people, who install a copy and have no repo beside it, so a feature that needs both is dead weight for them. Tooling for keeping the author's live copy and the repo in step stays outside the published mods.

## Tried and ruled out
A drift badge per mod ("repo is newer" / "not in the repo"), keys to update from the repo or save to it, and the installer recording the repo's path in the Herdr home. It worked on the author's machine and was removed the same day, with its tests and docs.

## Watch out
Before adding a feature to a published mod, ask what it does for someone who only ran the installer. For the author's own sync needs, use the script next to the repo.

In the code: the dialog is `mod-manager/mods/mod-manager`; the author's drift check is `../sync.sh --check`; the removed pieces were `drift`, `pull`, `push` in `manage.py` and `ohmyherdr.json` written by `install.py`.
