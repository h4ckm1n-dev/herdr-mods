# Session recap

Which files a Claude Code session read and wrote, over time. Press **⌘⇧H**, or right-click an agent in
Crew's agents list to open its session.

- **Left:** your newest 80 sessions, newest first, with their project and age. Type to filter.
- **Right:** one row per file, grouped by folder, in the order the session first touched them. A short dim
  tick is a read, a tall accent tick is a write; the counts are at the end of the row (`3r 2w`).
- **The clock** above the track shows when things happened. A pause longer than two minutes is squeezed to
  two minutes, so a session left open overnight still shows its work spread out.
- **Sub-agents** count: what they read and wrote is on the same rows.

It works on finished sessions too: everything comes from the transcripts Claude Code keeps in
`~/.claude/projects`. Nothing is recorded by the mod and nothing is written.

## Limits

- Only Claude Code's own Read, Edit and Write tools name their file. A file changed from a shell command
  (`sed`, a script, `git checkout`) doesn't appear, and the transcript doesn't record which files a
  command touched. So shell commands get one row of their own, at the top: a tick for when each ran, and
  their count.
- Claude Code sessions only; Codex sessions aren't listed.
- A call counts when it was made, whether or not it succeeded.

## Install

`./install.sh session-recap`

## Needs

The Herdr desktop app, `python3` and Claude Code.

## Check

`python3 -I mods/session-recap/tests/test_recap.py` prints `ok`: a made-up transcript comes back as
folders, files and ticks, the squeezed pause included.
