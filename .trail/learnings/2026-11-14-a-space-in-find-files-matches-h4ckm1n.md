---
title: "A space in Find files matches any separator, and the two git RECIPE files are not copies of each other"
author: H4ckm1n
date: 2026-11-14
branch: main
cost: { minutes: 23, tokens: 233247 }
id: l-f886b26c
scope: repo
status: active
src: agent
touches:
  - git/RECIPE.md
  - git/mods/git/RECIPE.md
  - fuzzy-files/mods/fuzzy-files/search.js
  - install.py
  - dialogs/mods/settings-crew/main.js
  - crew/mods/agents-crew/scan.py
  - crew/mods/worktree-crew/main.js
  - crew/mods/picker-crew/main.js
---

## Decided
In Find files a typed space stands for any separator (space, /, ., -, _), as in fzf: "src main" finds src/main.js. A test already required that "a b" must not match "ab", so spaces are not simply dropped; the separator a space matched stays unlit.
The installer answers yes by default when the key it would take is bound to the Herdr action the mod clones (mod.json cloned_from: help → app.help, frame-settings → app.settings, frame-palette → app.palette, else mod.open:<name>). It never adds a mod's key back when that action is already bound to another key in the section.

## Tried and ruled out
Stripping all whitespace from the query: it broke the literal-space test. Overwriting git/RECIPE.md with git/mods/git/RECIPE.md: the top one alone documents the Manygit config-trust check and the no-prompt network env, the mod one alone the keyboard and author-machine paths (crew-kit). Carry sections across by hand.

## Watch out
On 2026-11-14 the live copy was behind the repo commit for claude-usage/limits.py, cost/cost.py (Codex guardian_review skip) and fuzzy-files (QUIT_CLOSES_TAB). A diff that won't patch onto live usually means live is older there, not newer.

In the code: fuzzy-files/mods/fuzzy-files/search.js (find, SEP), install.py (NATIVE, replaces, before), git/RECIPE.md vs git/mods/git/RECIPE.md.
