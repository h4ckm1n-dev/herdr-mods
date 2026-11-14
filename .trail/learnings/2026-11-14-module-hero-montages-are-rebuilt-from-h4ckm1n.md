---
title: "Module hero montages are rebuilt from the old image's header plus a fresh capture, and dialogs are laid back over a clean window"
author: H4ckm1n
date: 2026-11-14
branch: main
cost: { minutes: 1, tokens: 1981 }
id: l-a60d0a9b
scope: repo
status: active
src: agent
touches:
  - crew/hero.png
  - git/hero.png
  - help-crew/hero.png
  - claude-manager/hero.png
  - theme-gallery/hero.png
  - docs/picker.png
  - docs/keybinds.png
  - docs/claude-manager.png
  - docs/theme-gallery.png
---

## Decided
The per-module hero images are montages, not captures. They are rebuilt by keeping the old image's header untouched (title, keycaps), replacing the window below it with a fresh capture, and redrawing the callouts: a pill with a dot and an outline around what it names. A dialog capture whose background shows something staged is fixed by cutting the dialog out and laying it over a clean capture of the same window taken in the same minute.

## Tried and ruled out
- Re-shooting every dialog over a clean background: it needs live agents again, and the Claude quota was at 95%.
- Rebuilding the whole montage from scratch: the headline font is not on the machine, so the header would not match.
- Restoring the montages from git between attempts is not a dropped approach: each rebuild must start from the original header.

## Watch out
- A prompt typed into a demo agent stays readable behind every dialog captured afterwards, and in the Agents list as the agent's last activity. Give demo agents natural tasks only, and clear the terminal first.
- A toast (a quota warning fired for real) can sit over the window's corner in one capture.
- Geist ships here as a static Regular with no modifier glyphs: the callout text is thickened with a stroke, and the command key comes from the system font.
- The theme gallery montage uses a light theme, so it needs its own capture.

In the code: montages `crew/hero.png`, `git/hero.png`, `help-crew/hero.png`, `claude-manager/hero.png`, `theme-gallery/hero.png`; dialog shots `docs/picker.png`, `docs/keybinds.png`, `docs/claude-manager.png`, `docs/theme-gallery.png`; tools in `~/acme/.demo-tools` (`montage.py`, `clean.py`, `process.py`), raw captures in `~/acme/.demo-tools/raw` (`c-*.png` are the recomposed ones), dialog rectangle `(240, 234, 2320, 1402)` in a 2560x1640 capture, montage canvas 2000x1679 with the window at x 116, y 456, width 1768.
