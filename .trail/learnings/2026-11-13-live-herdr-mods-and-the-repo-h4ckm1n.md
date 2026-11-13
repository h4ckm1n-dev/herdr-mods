---
title: "Live Herdr mods and the repo each lead on different files, so never copy one over the other wholesale"
author: H4ckm1n
date: 2026-11-13
branch: main
cost: { minutes: 9, tokens: 110344 }
id: l-bd387cd6
scope: repo
status: active
replaces: l-79e5ba0a
src: agent
touches:
  - install.sh
  - crew/mods/workspace-chrome-crew/dialog_outlines.py
---

## Decided
Mods are edited in the live copy in the Herdr home (Herdr only hot-reloads its own home), but the repo also receives direct edits. Neither side is ahead as a whole: on 2026-11-14 the live copy held unsynced work in some mods while the repo's last commit was newer for others. Carry a change across file by file, on top of the committed version.

## Tried and ruled out
- Running the installer's update over the live home: it replaced 23 live mods and the personal layout with repo versions. Restored from the installer's backup.
- Running the live-to-repo sync and committing the result: it reverted 7 files to older commits, deleted tracked tests and licence files that the live copy lacks, and added a runtime-appended "OhMyHerdr dialog outline" block to 23 main.js files. Reset to the commit and re-applied only the session's edits.

## Watch out
Before committing after a sync, compare each changed file with older commits (a file whose content equals an earlier revision is a regression) and strip the outline block, which Crew appends at runtime and is not source. The sync also writes into the private mod repos next to this one.

In the code: live copy `~/.config/herdr-app/mods`, sync script `../sync.sh` (`--check` lists drift), installer `install.sh --update`, backups `~/.config/herdr-app/backup/<time>/`, outline source `crew/mods/workspace-chrome-crew/dialog_outlines.py`.
