# Git panel — design

One side panel in Herdr that does the daily git loop the way VS Code's Source
Control view does: see what changed, stage it (whole files or chunks), commit,
sync, switch branches, stash — with the commit graph always visible underneath.
It replaces both Herdr's **Changes** panel and the third-party **Git Graph**
panel in the operator's `crew` layout.

## Why

The operator uses two panels today (Changes for the working tree, Git Graph for
history and branch/ref actions) and switches between them. Neither does
per-file or per-chunk staging, so real commits still need a terminal or VS Code.
Goal: never leave Herdr for routine git work.

## Goals

- Stage / unstage / discard per file and per group ("all").
- Stage / unstage / discard per **hunk** from the diff (used occasionally; whole
  files are the common case).
- Commit what's staged; ⌘⏎ in the message box commits.
- See a file's diff.
- Branches: see current, switch, create.
- Stash: create, list, apply, pop, drop.
- Push / pull / fetch, with ↑ahead ↓behind counts.
- Commit graph always visible.

## Non-goals

- Line-level (sub-hunk) staging.
- Merge-conflict resolution UI (show conflicted files with a `!` status; resolving
  happens in an editor/terminal).
- Blame, file history, commit search, PRs, GitLens-style annotations.
- Amend, interactive rebase, cherry-pick UI beyond what Git Graph's menus already have.
- Editing files.

## Anti-goals (would be failure even if it "works")

- Losing work: any discard, stash drop, reset, or non-fast-forward pull without
  an explicit confirm dialog.
- Staging unresolved conflicts silently (Git Graph's existing guard must hold).
- Hanging on a credential prompt (fetch/pull/push must run non-interactive, as
  Git Graph's fetch already does: `GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=0 GIT_ASKPASS=`).
- Polling so hard the panel costs CPU while hidden (Herdr keeps hidden mods alive).

## Layout (decided: "B — Changes over Graph", diff in panel)

Side panel, default 368px wide (existing `panel` column in `layouts/crew.json`,
min 280, max 900). Top to bottom:

1. **Header**: branch chip (`⎇ main`, Git Graph's existing chip style). Click →
   branch picker popup: filter box, local branches then remotes, "Create branch…"
   at top; pick = run checkout and show git's error inline if it refuses
   (e.g. dirty tree) — no pre-check. *(Claude's call)* Right side: **sync button** `↻ ↑2 ↓1`
   (counts hidden when 0; no upstream → "Publish"). Click = pull (`--ff-only`)
   then push. Its menu (right-click or a chevron): Fetch, Pull, Push, Stash…,
   Stash list (apply / pop / drop), Fetch all (Manygit only).
2. **Commit box**: message input + Commit button. Commit = `git commit -m` of the
   index. If nothing is staged but there are changes, Commit stages all first,
   **untracked included** (`add -A`, as Herdr's Changes does today; VS Code's
   "smart commit") — through Git Graph's existing commit path so its
   unresolved-conflict guard applies. Message is single-line (`-m`); Commit is
   disabled while the message is empty. *(Claude's calls)*
3. **Staged Changes** group, then **Changes** group (unstaged + untracked `U`;
   conflicted `!` listed first). Each file row: name, dim folder, status letter
   colored (M amber, A/U green, D red). Hover shows buttons: Changes rows
   ↺ discard, + stage; Staged rows − unstage. Group headers: count + "all"
   versions (Stage all, Unstage all, Discard all). Groups collapse.
4. **Draggable divider**.
5. **Bottom half**: Git Graph's history (lanes, labels, right-click menus,
   uncommitted row) unchanged. When a file is selected in (3), this half shows
   that file's **diff** instead; ✕ / Esc returns to the graph. In the diff, each
   `@@` header has buttons: unstaged file → "Stage hunk", "Discard hunk" (confirm);
   staged file → "Unstage hunk". ↑/↓ moves between files while the diff is open.

Folder that isn't a repo but contains repos → Git Graph's existing **Manygit**
list (kept as-is).

## How it's built (builder's starting point)

- **Base**: fork `~/.config/herdr-app/mods/git-graph` (third-party, MIT,
  github.com/rabeeh-ta/herdr-git-graph) into `mods/git`. Rewrite internal
  `mods/git-graph/…` asset paths and the `git-graph.<command>` names; keep
  `shared("git-graph.*")` keys so settings carry over. Disable its release
  update check (`update.js`) so upstream releases don't prompt to overwrite the fork.
- **Reuse** from Git Graph: `exec` wrapper with `READ` flags, status parsing
  (`git.js` already returns `staged`/`untracked` per file), diff rendering
  (`diffRows`, virtual list), dialogs/menus (`dialog.js`, `menu.js`, `execute.js`),
  confirm-first action pattern, folder watching (`watchFolder` refresh, ≤ every 1.5s).
- **Reference only**: Herdr's shipped `mods/changes/main.js` (commit box Input
  pattern). Don't edit it — Herdr overwrites shipped mods on start.
- **Git commands** (all via `exec("git", …, { cwd: root, on })`, so remote
  machines work):
  - stage `add -- <path>`; unstage `restore --staged -- <path>` (no HEAD: `rm --cached`);
    discard tracked `restore -- <path>` (staged+unstaged: `restore --staged --worktree`),
    untracked → `clean -f -- <path>` (confirm wording must say "delete").
  - hunks: build a single-hunk patch from the diff and apply with
    `exec("sh", ["-c", "printf '%s' \"$1\" | git apply --cached [--reverse] --unidiff-zero -", "_", patch])`
    — Herdr's `exec` has no stdin, so the patch rides in argv (works over `on`).
    Discard hunk = `git apply --reverse` on the worktree.
  - ahead/behind: `rev-list --left-right --count @{upstream}...HEAD`.
  - pull `pull --ff-only`; push `push` (no upstream → `push -u origin <branch>`);
    all network commands non-interactive (see anti-goals).
  - **diverged sync (decided by the operator: offer to combine)**: when
    `--ff-only` fails because the branch diverged (ahead > 0 and behind > 0),
    open a confirm dialog: "Pull with rebase" (`pull --rebase`) / "Pull with
    merge" (`pull --no-rebase`) / Cancel. On success, push. On conflict, stop
    (no push), show a toast, refresh: conflicted files appear with `!` at the
    top of Changes; the header shows "Rebasing…/Merging…" with Abort
    (`rebase --abort` / `merge --abort`, confirm) and Continue (`rebase
    --continue` / `commit --no-edit`) once no `!` files remain. Resolving the
    conflicts themselves stays a non-goal (editor/terminal).
  - stash list `stash list --format=%gd%x1f%s%x1f%ct`; apply/pop/drop by `stash@{n}`.
- **Logging**: Herdr mods have no logger; errors surface via `notify` toasts and
  inline `ansi1` text, as Git Graph does.

### Hunk scope *(Claude's calls)*

- "Stage / Unstage / Discard hunk" only on plain modified text files. Untracked,
  added, deleted, renamed, binary or mode-only files: whole-file actions only.
- The diff pane shows the **unstaged** diff (`git diff`) for a Changes row and
  the **staged** diff (`git diff --cached`) for a Staged row, not the combined
  `diff HEAD`. A file in both groups appears in both, each with its own diff.
- After every hunk operation, re-read the diff and rebuild patches; a failed
  `git apply` shows a toast with git's message and re-reads.

### Refresh *(Claude's calls)*

- Local repos: `watchFolder`-driven refresh, as Git Graph does.
- Remote machines (`on` set): `watchFolder` is local-only, so refresh after each
  of our own actions, when the panel's space/tab focus changes, and on the
  header's refresh button. No timer polling.

## Wiring

- `layouts/crew.json` `panel-body` stack: replace `graph` block's mod
  `git-graph` → `git`; **remove the `changes` block**.
- `mods/tabs-crew/main.js`: drop `"changes"` from the enabled panels and its
  button; Git button icon → `mods/git/icons/graph.svg`. Buttons stay icon-only.
- `keys.json` `layout:crew`: `cmd-g` → `tabs-crew.graph` (unchanged id).
- Delete `mods/git-graph/` once `mods/git` passes checks.

## Done when

- `herdr-app check mods/git` and `mods/tabs-crew` pass; `herdr-app status` → `errors: []`.
- Top bar shows Files, Crew, Git (no Changes); ⌘G toggles Git.
- In a scratch repo: stage/unstage/discard a file; stage one hunk of a two-hunk
  file and `git diff --cached` shows only that hunk; commit with ⌘⏎; create +
  switch branch; stash, list, pop; push/pull against a local bare remote with
  ↑↓ counts updating; discard and stash drop each show a confirm.
- Diverged branch vs bare remote: sync offers rebase/merge; a clean rebase
  then pushes; a conflicting one stops with `!` files, and Abort restores the
  pre-sync state.
- Conflicted repo: Commit refuses to stage all.
- No timer polling: git runs only on watch events, focus changes, and the person's own actions.

## Left to the builder

Exact pixel sizes/colors (follow Git Graph's existing tokens), divider default
split (suggest 50/50, remembered per mod via `localStorage`), keyboard shortcuts
beyond ⌘⏎/Esc/↑↓, module split inside `mods/git/`, and whether to write
`RECIPE.md` (Herdr convention) from this doc at the end.
