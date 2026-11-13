---
title: "Edit the mods in the live Herdr copy, not in the repo, and never run the installer over it"
author: H4ckm1n
date: 2026-11-13
branch: main
cost: { minutes: 15, tokens: 103815 }
id: l-79e5ba0a
scope: repo
status: active
src: agent
touches:
  - install.sh
---

## Decided
On this machine the live copy in the Herdr home is the working copy: mods are edited there (Herdr only hot-reloads its own home), then copied into the repo, then committed. The repo is usually behind the live copy.

## Tried and ruled out
Editing the repo copies and running the installer's update to push them live. It replaced 23 live mods and the personal layout (filetree, CI and Ops panels) with older repo versions. Everything was restored from the installer's backup and the edits were re-applied on the live files.

## Watch out
The installer is for other people's machines and fresh homes. Here it downgrades unsynced live work; the backup folder it prints is the way back. Repo-side edits to a mod are overwritten by the next live-to-repo sync unless the live copy has them too.

In the code: live copy `~/.config/herdr-app/mods`, sync script `../sync.sh` (`--check` lists drift), installer `install.sh --update`, backups `~/.config/herdr-app/backup/<time>/`.
