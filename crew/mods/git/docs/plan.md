# Git Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Herdr side-panel mod `git` (fork of `git-graph`) giving VS Code-style source control — staged/changes groups, per-file and per-hunk stage/unstage/discard, commit, branch picker, stash list, sync with diverged-branch handling — above the existing commit graph.

**Architecture:** Fork `mods/git-graph` → `mods/git`. All new git behavior goes into the fork's existing split: pure, node-testable logic (`git.js` `commandsFor`/`dialogFor`/`doneText`, `execute.js` `executeAction`, plus new `scm.js` and `hunks.js`, none importing `"herdr"`), and UI in `graph.js` + a new `changes.js` view section + a `branches.js` popup role. Every mutation flows through `perform()` in `act.js` (toast + `setShared("git-graph.changed")` refresh), as today.

**Tech Stack:** Herdr mod JS (gpui-kit / gpui-shell, `herdr` module — see `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, `gpui-kit.d.ts`); tests: plain Node 26 `node:assert` scripts against throwaway repos (upstream's style); git CLI.

**Spec:** `~/.config/herdr-app/git-panel.design.md` (moved to `mods/git/docs/design.md` in Task 1). Read it first.

## Global Constraints

- Mod folder `~/.config/herdr-app/mods/git`; overlay `mod:` names and asset paths `mods/git/...`; keep every `shared("git-graph.*")` key name unchanged (settings carry over).
- Modules other than `main.js`, `graph.js`, `changes.js`, `branches.js`, `menu.js`, `dialog.js`, `settings.js`, `update.js`, `act.js` must not import `"herdr"` (they're loaded by node tests).
- Every git call: `exec("git", [...], { cwd: root, on })`; read-only calls prefixed with `READ`.
- Network commands (fetch, pull, push) run as `exec("env", ["GCM_INTERACTIVE=0","GIT_TERMINAL_PROMPT=0","GIT_ASKPASS=","git", ...])`.
- Paths always after `--`; status parsed from `-z` output.
- Every destructive action (discard file/group/hunk, stash drop, pull rebase/merge, abort) opens a confirm dialog via `dialogFor` before running. Untracked discard wording says "Delete".
- Commit with nothing staged = `add --all` then commit, and must hit the existing unmerged-files guard in `executeAction`.
- Commit message single-line; Commit disabled while empty; ⌘⏎ (`cmd-enter`) in the box commits.
- No timer polling. Refresh = `watchFolder` (local), focus/space change, own actions, refresh button.
- Hunk buttons only for status `M` text files; patches go through `exec("sh", ["-c", "printf '%s' \"$1\" | git apply <fixed flags> -", "_", patch])` — flags are code constants, the patch only ever in `$1`.
- `herdr-app check ~/.config/herdr-app/mods/git` passes after every task; `herdr-app status` → `"errors": []`.
- Commit inside `mods/git` (its own git repo, created in Task 1), message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Paths with spaces, unicode, or a leading `-` → every file action and hunk action still targets exactly that file. (Tests in Tasks 3, 4.)
2. Repo with no commits (unborn HEAD) → unstage uses `rm --cached`, commit works, ahead/behind absent, no crash. (Task 3, Task 7.)
3. Detached HEAD / no upstream → sync shows "Publish" or is disabled, never pushes to a guessed branch. (Task 7.)
4. File in both groups (staged and further edited) → staged hunk ops use `--cached` diff, unstaged use worktree diff; neither clobbers the other. (Task 4.)
5. A stale panel (branch/HEAD changed in a terminal since render) → action refused with the existing "changed" message, not applied to the new HEAD. (Task 3 test, reusing `executeAction`'s check.)

---

### Task 1: Fork git-graph into mods/git

**Files:**
- Create: `mods/git/` (copy of `mods/git-graph/`), `mods/git/tests/graph.test.mjs`, `mods/git/tests/action-context.test.mjs` (from the upstream clone at `/private/tmp/claude-501/-Users-h4ckm1n/dfc93395-5e64-45a4-a0b9-4f57d7df6360/scratchpad/gg-src/tests/`; re-clone `https://github.com/rabeeh-ta/herdr-git-graph` if gone), `mods/git/package.json` (`{"type":"module","private":true,"scripts":{"test":"node tests/graph.test.mjs && node tests/action-context.test.mjs"}}`), `mods/git/docs/design.md`, `mods/git/docs/plan.md` (move the two `~/.config/herdr-app/git-panel.*.md` files)
- Modify: every `mods/git-graph/` → `mods/git/` and `mod: "git-graph"` → `mod: "git"` in `mods/git/*.js`; test imports `../mods/git-graph/` → `../`
- Modify: `mods/git/update.js` — `check()` returns without fetching; `available()` returns false.

**Interfaces:** Produces the `mods/git` mod, identical behavior to `git-graph`, plus `npm test` green.

- [ ] Step 1: Copy folder, move docs, `git init` in `mods/git`, `.gitignore` with `node_modules`.
- [ ] Step 2: Rewrite names (grep `git-graph` afterwards: only `shared("git-graph.` keys and the `REPO`/`PROMPT` constants in `update.js` remain).
- [ ] Step 3: Neutralize update check.
- [ ] Step 4: Run `cd mods/git && npm test` → all upstream assertions pass.
- [ ] Step 5: `herdr-app check ~/.config/herdr-app/mods/git` → `check passed`.
- [ ] Step 6: Commit `chore: fork herdr-git-graph as git`.

### Task 2: Status groups and upstream counts (`scm.js`)

**Files:** Create `mods/git/scm.js`, `mods/git/tests/scm.test.mjs`; modify `package.json` test script to also run it.

**Interfaces:**
- Produces `parseGroups(statusZ: string) -> { staged: File[], changes: File[], conflicts: File[] }` where `File = { path, x, y, status: "M"|"A"|"D"|"U"|"!"|"R"|"T", untracked: bool }` — input is `git status --porcelain=v1 -z --no-renames --untracked-files=all` (`STATUS` in git.js). A file with both X and Y set appears in `staged` (status from X) and `changes` (status from Y). Unmerged XY (`DD AU UD UA DU AA UU`) → only `conflicts`, status `!`. Untracked `??` → `changes`, status `U`.
- Produces `parseAheadBehind(stdout: string) -> { ahead: number, behind: number }` from `rev-list --left-right --count HEAD...@{upstream}` (`"2\t1\n"` → `{ahead:2, behind:1}`).
- Produces `repoOperation(gitDir: string, exists: (p) => bool) -> null | "rebase" | "merge"` (`rebase-merge/` or `rebase-apply/` → rebase; `MERGE_HEAD` → merge).

- [ ] Step 1: Tests: `parseGroups` on a real repo with a staged+modified file (`a b.txt`), an untracked `-dash.txt`, a deleted file, a `ñ.txt`, and a merge conflict — assert each lands in the right group(s) with the right status; `parseAheadBehind("2\t1\n")` deepEqual `{ahead:2,behind:1}`; `repoOperation` on a repo mid-conflicting-rebase → `"rebase"`.
- [ ] Step 2: Run `node tests/scm.test.mjs` → FAIL (module missing).
- [ ] Step 3: Implement.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat: status groups and upstream counts`.

### Task 3: File actions (stage / unstage / discard, single and group)

**Files:** Modify `mods/git/git.js` (`commandsFor`, `dialogFor`, `doneText`, `validate`); test in `mods/git/tests/scm.test.mjs`.

**Interfaces:**
- Consumes: `File` from Task 2.
- Produces action types (all `{ type, paths: string[], ... }`, paths validated: non-empty, no NUL):
  - `stage` → `["add", "--", ...paths]`
  - `unstage` → `["restore", "--staged", "--", ...paths]`; when `ctx.head` is null → `["rm", "--cached", "-q", "--", ...paths]`
  - `discard` `{ tracked: string[], untracked: string[] }` → `["restore", "--staged", "--worktree", "--source=HEAD", "--", ...tracked]` (unborn HEAD: `["rm","--cached","-q","--",...]` then `clean`), `["clean", "-f", "--", ...untracked]` — dialog required: title `Discard changes` / `Delete untracked files` when only untracked; body lists up to 5 paths then `and N more`; confirm button `Discard`/`Delete`.
  - `doneText`: `Staged N files`, `Unstaged N files`, `Discarded N files`.

- [ ] Step 1: Tests via `executeAction` on a real repo: stage `a b.txt` → `git diff --cached --name-only` is `a b.txt`; unstage it → empty; stage `-dash.txt` works (leading dash); discard tracked restores content; discard untracked deletes the file; unstage in a repo with no commits works; `dialogFor({type:"discard",...})` non-null; a stale `ctx.head` returns `{ok:false, stale:true}`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → PASS (upstream tests still pass).
- [ ] Step 5: Commit `feat: stage, unstage, discard actions`.

### Task 4: Hunk staging (`hunks.js`)

**Files:** Create `mods/git/hunks.js`; modify `git.js` / `execute.js`; test `mods/git/tests/hunks.test.mjs`.

**Interfaces:**
- Produces `parseHunks(diffText: string) -> { head: string, hunks: { header: string, body: string[] }[] }` — `head` is everything before the first `@@` (diff/index/---/+++ lines).
- Produces `patchFor(diffText: string, i: number) -> string` = `head` + hunk i + trailing `\n`.
- Produces `HUNK_DIFF = { unstaged: [...READ,"--literal-pathspecs","diff","--no-ext-diff","--no-textconv","--no-color","-U3","--"], staged: [...READ,"--literal-pathspecs","diff","--cached","--no-ext-diff","--no-textconv","--no-color","-U3","--"] }` (path appended).
- Produces action types `stageHunk` / `unstageHunk` / `discardHunk` `{ type, path, patch }`. `executeAction` runs them as `exec("sh", ["-c", "printf '%s' \"$1\" | git apply <FLAGS> -", "_", patch], {cwd, on})` with FLAGS: stage `--cached`, unstage `--cached --reverse`, discard `--reverse`. `discardHunk` requires a dialog (`Discard this change?`). Validation: patch starts with `diff --git ` and contains exactly one `@@`.

- [ ] Step 1: Tests on a real repo: a 40-line file edited at line 2 and line 38 (two hunks); `parseHunks` → 2 hunks; `stageHunk` hunk 0 → `git diff --cached` contains the line-2 change and not the line-38 one; `unstageHunk` (from the `--cached` diff) → cached diff empty; `discardHunk` hunk 1 → worktree no longer has the line-38 change but keeps line 2; same flow on a file named `my file -x.txt`; a file staged then further edited: staging the remaining worktree hunk leaves the earlier staged hunk intact.
- [ ] Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS.
- [ ] Step 5: Commit `feat: hunk stage, unstage, discard`.

### Task 5: Stash list and actions

**Files:** Modify `scm.js`, `git.js`; tests in `scm.test.mjs`.

**Interfaces:**
- Produces `STASH_LIST = [...READ, "stash", "list", "--format=%gd%x1f%s%x1f%ct"]` and `parseStashes(stdout) -> { ref: "stash@{n}", message, time }[]`.
- Produces actions `stashApply` / `stashPop` / `stashDrop` `{ type, ref }` (ref must match `/^stash@\{\d+\}$/`) → `["stash","apply"|"pop"|"drop", ref]`. `stashDrop` requires a dialog (`Drop stash?`, shows its message). Existing `stash` action unchanged.

- [ ] Step 1: Tests: create two stashes; `parseStashes` returns 2 newest-first; `stashPop` of `stash@{1}` restores its file and leaves 1 stash; `stashDrop` with ref `stash@{0}; rm -rf` is rejected by validation.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat: stash list, apply, pop, drop`.

### Task 6: Smart commit

**Files:** Modify `scm.js`; tests in `scm.test.mjs`.

**Interfaces:**
- Produces `commitValues(groups, message: string) -> { message, all: boolean } | null` — null when message trims empty or there's nothing to commit; `all: true` when `staged` is empty and `changes`/`conflicts` non-empty. Feeds the existing `commit` action.

- [ ] Step 1: Tests: staged-only → `all:false`; nothing staged + untracked file → `all:true` and after `executeAction` the untracked file is committed; with a conflict present and nothing staged → `executeAction` returns `ok:false` with the unresolved-conflicts message; empty message → null.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat: smart commit values`.

### Task 7: Sync (pull/push/publish/diverged/abort/continue)

**Files:** Modify `scm.js`, `git.js`, `execute.js`; test `mods/git/tests/sync.test.mjs` (bare remote + second clone to diverge).

**Interfaces:**
- Produces `syncPlan(st: { branch: string|null, upstream: string|null, ahead, behind, remotes: string[] }) -> { kind: "none"|"publish"|"push"|"pull"|"pullPush"|"diverged", label: string }` — detached (`branch` null) → `none`; no upstream + remotes → `publish` (label `Publish`); `ahead>0 && behind>0` → `diverged`.
- Produces actions: `sync` (pull `--ff-only` then push, no dialog), `publish` → `["push","-u",remote,branch]` (remote = `origin` if present else first; dialog to pick when >1), `pullRebase` → `["pull","--rebase"]` then `["push"]`, `pullMerge` → `["pull","--no-rebase","--no-edit"]` then `["push"]` (both via one dialog `Your branch and <upstream> have diverged` with buttons `Pull with rebase` / `Pull with merge` / `Cancel`), `abortOperation {op}` → `rebase --abort` | `merge --abort` (dialog), `continueOperation {op}` → `["-c","core.editor=true","rebase","--continue"]` | `["commit","--no-edit"]`.
- `executeAction`: network commands (`fetch`, `pull*`, `push`) wrapped with the env prefix from Global Constraints; a failed pull step stops before push and returns `{ ok:false, message, conflict: repoOperation(...) !== null }`.

- [ ] Step 1: Tests: clean ahead-only → `sync` pushes (remote ref equals local); behind-only → fast-forwards; diverged non-conflicting → `syncPlan` says `diverged`, `pullRebase` leaves linear history and pushes; diverged conflicting → `pullRebase` returns `conflict:true`, no push happened (remote unchanged), `repoOperation` = `rebase`, `abortOperation` restores the pre-sync HEAD; same with `pullMerge` + `merge`; `publish` on a new branch sets upstream; detached HEAD → `syncPlan.kind === "none"`; unborn repo → `none`.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat: sync with diverged handling`.

### Task 8: Changes view + diff in panel (UI)

**Files:** Create `mods/git/changes.js` (renders header, commit box, groups); modify `mods/git/graph.js` (layout: changes on top, divider, bottom = graph or diff), `mods/git/act.js` (remove `showChanges`), `mods/git/icons/` (add `minus.svg`, `discard.svg`, `sync.svg` — Lucide, same license file).

**Interfaces:**
- Consumes: `parseGroups`, `parseAheadBehind`, `repoOperation`, `syncPlan`, `commitValues`, `parseHunks`, `patchFor`, `HUNK_DIFF`, all action types above, `perform`/`openDialog`.
- Produces in `graph.js`: `this.split` (0.2–0.8, default 0.5, `localStorage("split")`), `this.diffFile = { path, group: "staged"|"changes" } | null`.
- Behavior (from spec "Layout"): header chip + sync button (`↻`, `↑N` `ansi2`, `↓N` `ansi1`, `Publish`, `Rebasing…/Merging…` with Abort/Continue when `repoOperation` non-null); commit `Input` with placeholder `Message (⌘⏎ to commit)`, `cmd-enter` commits; groups `Staged Changes` / `Changes` (conflicts first with `!` `ansi1`), collapsible, hover buttons (`−` unstage; `↺` discard, `+` stage), header "all" buttons; status colors M `ansi3`, A/U `ansi2`, D `ansi1`; row click → `diffFile`, bottom half shows `HUNK_DIFF[group]` output via existing `diffRows`/virtual list with per-`@@` buttons (only when status `M`); `Esc`/✕ clears `diffFile`; ↑/↓ moves selection across both groups while a diff is open. Sync button right-click / chevron opens a menu (existing `menu.js` role) with: Fetch, Pull, Push, Stash…, then one row per `parseStashes` entry with Apply / Pop / Drop as sub-items (or three items per stash if `menu.js` has no submenus), plus Fetch all on Manygit. Remove the "Open Changes" link. Refresh hooks: existing watch + `setShared("git-graph.changed")`; for `on` (remote) also refresh on space/tab change; no intervals.

- [ ] Step 1: Implement `changes.js` + wiring in `graph.js`.
- [ ] Step 2: `herdr-app check mods/git` → passes; `npm test` still green.
- [ ] Step 3: Temporarily point `layouts/crew.json` `graph` block at `git` (Task 10 finalizes) and verify by hand in a scratch repo (`/tmp` repo with a bare remote): stage/unstage/discard file; stage one hunk of two (`git diff --cached` confirms); ⌘⏎ commit; discard shows confirm; ↑↓ counts after commit; diverged sync dialog; conflict shows `!` + Abort works. Screenshot via `herdr-app` (AGENTS.md "Seeing the window") for the record.
- [ ] Step 4: Commit `feat: changes view and in-panel diff`.

### Task 9: Branch picker popup

**Files:** Create `mods/git/branches.js` (role `"branches"`); modify `main.js` (route role), `graph.js` (chip click opens it), `git.js` (no new actions — reuses `checkout`, `checkoutRemote`, `createBranch`).

**Interfaces:**
- Consumes: `parseRefs` (git.js), existing actions.
- Produces popup `openOverlay({ mod: "git", kind: "popup", at: "pointer", width: 300, height: 360, props: { role: "branches", ctx } })`: filter `Input`, row `+ Create branch…` (opens existing `createBranch` dialog at HEAD), local branches (current checked), then remotes without a local twin; Enter/click = checkout; git's error shown inline in `ansi1`, popup stays open.

- [ ] Step 1: Implement. Step 2: `herdr-app check` passes. Step 3: by hand: filter, switch, create, dirty-tree checkout shows git's error.
- [ ] Step 4: Commit `feat: branch picker`.

### Task 10: Wire into the crew layout, retire Changes and git-graph

**Files:** Modify `~/.config/herdr-app/layouts/crew.json` (`panel-body`: `graph` block mod → `git`; remove `changes` block), `~/.config/herdr-app/mods/tabs-crew/main.js` (drop `"changes"` from enabled list via filter, remove its button; Git icon → `mods/git/icons/graph.svg`), delete `~/.config/herdr-app/mods/git-graph/`; update `mods/git/RECIPE.md` from the design (Herdr's RECIPE format, AGENTS.md "Layouts and mods other people made").

- [ ] Step 1: Edits; `ls ~/.config/herdr-app/*.error` → none; `herdr-app status` → `"errors": []`, `"layout": "crew"`.
- [ ] Step 2: `herdr-app check` for `mods/git` and `mods/tabs-crew` pass.
- [ ] Step 3: By hand: top bar shows Files, Crew, Git (icon-only); ⌘G toggles Git; a non-repo folder holding repos shows Manygit.
- [ ] Step 4: Commit in `mods/git` `docs: recipe`; note the layout/tabs-crew edits in the final report (those files aren't in a repo).
