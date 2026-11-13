---
title: "Open images in a Herdr tab with kitty graphics, converting JPEG to PNG first"
author: H4ckm1n
date: 2026-11-13
branch: main
cost: { minutes: 7, tokens: 65440 }
id: l-2cd8b572
scope: repo
status: active
src: agent
touches:
  - fuzzy-files/mods/fuzzy-files/imgview.py
  - fuzzy-files/mods/fuzzy-files/tests/test_imgview.py
---

## Decided
PNG/JPEG picked in the Files panel or Find files open in a Herdr tab running a small stdlib Python viewer, not in nvim and not in the OS viewer. Herdr-app's terminal renders kitty graphics but its decoder only handles PNG (f=100), so JPEG is converted with macOS `sips` first. The script is passed inline (`python3 -I -c <script> <path>`) so it also runs on remote machines. Quitting (`:q`, `q`, Esc) ends the terminal via `hc kill $HC_TERMINAL_ID` after the process is gone, same trick as the nvim tabs, because Herdr keeps a shell after the program exits.

## Tried and ruled out
Opening with the system viewer (`open` / `xdg-open`): leaves Herdr and cannot work for remote spaces. The user wanted an in-Herdr tab closed with `:q`.

## Watch out
Keys can arrive several per read (`:q\r` from a fast type or paste): handle each character, and skip multi-byte escape sequences, or arrows count as Esc. Without `sips` (Linux), JPEG fails with a message; PNG still works. Cell pixel size falls back to 8x16 when TIOCGWINSZ reports none.

In the code: fuzzy-files/mods/fuzzy-files/imgview.py (copy in crew/mods/files-crew/imgview.py, keep identical), IMAGE regex in both main.js, test fuzzy-files/mods/fuzzy-files/tests/test_imgview.py (pty run checks `\x1b_Ga=T,f=100` and `:q`). Herdr PNG-only decoder: herdr-app/src/vt.rs decode_png.
