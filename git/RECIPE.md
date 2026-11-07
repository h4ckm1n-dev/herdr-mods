# Git

A side panel for the daily git loop, laid out like VS Code's Source Control view with the commit graph kept underneath. The top half stages, unstages and discards files, writes the commit message and syncs with the remote. The bottom half is the commit graph, or the diff of the file you clicked, with Stage/Unstage/Discard buttons on each hunk. In a folder that isn't a repository but holds some, it lists them instead (Manygit).

Forked from github.com/rabeeh-ta/herdr-git-graph (MIT). It replaces Herdr's Changes panel and the original Git Graph panel.

## What you see

The panel is the `graph` block in the side panel (368px, min 280, max 900). It is built with the small UI kit in `kit.js` (type scale and sizes shared by the panel): a rounded-10 bordered card on `background`, 13/12/11/10.5px type, theme colors only. Top to bottom:

1. **Header**, Crew's: 42px, px 16, gap 8, bottom border. The graph glyph (14px, muted), "Git" in 13px semibold (or "Manygit" in a folder of repos), then the branch as a bordered tag (branch icon 11px, name 10.5px muted; hover → `input` border; a detached HEAD shows `detached at <8 chars>` with a commit icon), then a count tag ("3 changes", "12 repos"; the changes count hides under 340px). On the right, the sync control and a chevron icon button, then a 26px refresh icon button. Every control has a tooltip and an accessibility label.
   - Sync control: 26px, 11px text, sync icon (spins while syncing), `↑N` in `ansi2` and `↓N` in `ansi1`, each hidden at 0; "Publish" with a push icon when the branch has no upstream; dim and inert when there is nothing to sync.
   - During a rebase or merge it shows "Rebasing…" or "Merging…" (theme `blocked`) with Continue (accent) and Abort (`blocked`). Continue shows only once no `!` file remains.
2. **Commit box** (px 8, pt 8): a 32px field (rounded 8, `input` border, accent while typing; placeholder `Message (⌘⏎)`) and the kit's primary button at 32px. The button reads "Commit", "Commit all" when nothing is staged, "Committing…" while it runs; it is faded and inert while the message is empty.
3. **Staged changes** group, then **Changes** group (conflicted files first, then unstaged, then untracked), in a list inset 8px. A group header is a Crew section, 28px: the title in 11px muted, then the count (dim) and a chevron on the right. A file row is a Crew row, 28px, rounded 8, hover fill: the status letter in the 16px gutter (11px semibold: `M` `ansi3`, `A` and `U` `ansi2`, `D` and `!` `ansi1`), the name in 12px medium (muted when deleted), the folder in 11px dim. Each group lists at most 500 rows, then "and N more". A clean tree shows Crew's empty state: a check glyph, "No changes", "Edits in this repository show up here".
4. **Divider**, 5px, between the changes and the bottom half.
5. **Bottom half**: the commit graph (a 36px toolbar with All | Current and Remotes, lanes, labels, uncommitted row, columns for description, date, author, commit) or, after clicking a file, that file's diff as a virtual list with 20px rows under a 36px bar (Staged/Changes tag, file name, x icon button). Commit details and a commit's file diff use the same 36px bar. Empty and error states (no folder, not a repository, no commits, loading) are Crew's quiet empty state: glyph, 13px muted sentence, 11px dim hint.
6. **Overlays**: menus are Crew menus (popover, p 4, 30px items, danger items in `blocked`); dialogs use the kit's dialog anatomy (42px header with an Esc key, body p 16 gap 12, kit buttons right-aligned); the branch picker is a 32px field over menu items.

## How it behaves

- **File rows**: clicking a row opens its diff in the bottom half. Hovering shows buttons. A Changes row: discard (↺) and stage (+). A Staged row: unstage (−). A conflicted `!` row: only a + that marks it resolved (stages it) after a "Mark as resolved?" confirm, which warns when the file still holds `<<<<<<<`/`>>>>>>>` markers.
- **Group headers**: hovering shows "all" buttons. Staged: unstage all. Changes: discard all and stage all (not counting conflicted files). Clicking the header collapses the group.
- **Diff**: a Changes row shows `git diff` (worktree against index), a Staged row `git diff --cached`. A file in both groups appears in both, each with its own diff. Binary or unreadable files show "Binary or unreadable file". Escape returns to the graph; ↑/↓ steps through the files in drawn order while a diff is open.
- **Hunks**: only for a plain modified (`M`) text file, never for untracked, added, deleted, renamed or binary. Each `@@` row carries 16px pill buttons 84px wide, 4px apart, starting 8px from the left (Discard tinted `blocked`): "Stage hunk" and "Discard hunk" for a Changes file, "Unstage hunk" for a Staged file. The press position says which button was hit. After a hunk action the diff is read again.
- **Commit**: Commit (or ⌘⏎ in the box) commits a single-line message. With files staged it commits those; with nothing staged it stages everything (untracked included) first. It refuses while any file is unmerged, and refuses (stale) if something was staged since the panel last read the repo. The message is cleared when the panel switches to another repository. Disabled while the message is empty.
- **Sync**: clicking the sync button does a fast-forward-only pull then a push. With no upstream it publishes (`push -u`; a dialog picks the remote if there are several). If the branch has diverged, a dialog offers "Pull with rebase", "Pull with merge" or Cancel; on conflict it stops and does not push. The conflicted files show with `!`, the header shows Rebasing…/Merging… with Continue and Abort.
- **Menu** (right-click on the sync button, or the chevron): Fetch, Pull…, Push…, Stash…, then Apply / Pop / Drop rows for each of the first 10 stashes, and "Fetch all (Manygit)" when a folder of repos is open. A stash row carries the stash's hash; if `stash@{n}` no longer names that commit (a stash was pushed or dropped elsewhere) the action is refused as stale.
- **Branch chip**: opens a popup with a filter, "+ Create branch…" (its dialog has "Check out the new branch" ticked), local branches (current one checked), then remote branches with no local twin. Enter or a click checks out; a remote branch creates a tracking branch. Git's error stays in the popup (a dirty tree is not pre-checked). Up/down/Escape work in the popup.
- **Confirms**: every destructive action asks first: discard (file, group or hunk; for untracked files the wording is "Delete untracked files" with a Delete button; a mix of tracked and untracked is titled "Discard changes and delete files" with a separate counted "Delete N untracked files" list), stash drop, mark resolved, abort rebase/merge, pull. A hunk discard shows the hunk's `@@` header and first changed line. Discard, stash drop, hunk discard and mark resolved use the red (danger) confirm button. All say it can't be undone where it can't.
- **Divider**: drag it to resize (split kept between 0.2 and 0.8 of the body, remembered in `localStorage` key `split`); double-click resets it to 0.5.
- **Refresh**: no polling. The panel reads git again when `watchFolder` reports a change in the repo (local only), when the focus, space or tab changes, after its own actions (`shared("git-graph.changed")`), and on the refresh button. On a remote machine (`on`) the folder watch is not available, so only the last three apply.
- Graph interactions (double-click a label to check it out, right-click menus for branches, tags and commits, the Manygit list, fetch all) are the original Git Graph's, kept as they were.

## Built from

- **Files**: `mod.json` is `{ "place": "none" }`. `main.js` picks a role by `props().role`: none = the graph (a panel, or a pane with `props.folder`), `menu`, `dialog`, `settings`, `branches`. `graph.js` (layout, header, divider, diff, hunks, Manygit), `changes.js` (commit box, groups, sync button and menu), `branches.js`, `menu.js`, `dialog.js`, `settings.js`, `act.js` (runs an action and toasts), `execute.js` (actions and the unmerged-files and stale-HEAD checks), `git.js` (git arguments, parsers, menus, dialog texts), `scm.js` (status groups, ahead/behind, sync plan, stashes, commit values), `hunks.js` (hunk diff args and single-hunk patches), `repos.js` (Manygit), `lanes.js`. Only `main.js`, `graph.js`, `changes.js`, `branches.js`, `menu.js`, `dialog.js`, `settings.js` and `act.js` import `"herdr"`; the rest also run under node for the tests in `tests/` (`npm test`).
- **Art**: `icons/*.svg` (Lucide, `icons/LICENSE-lucide.txt`); `graph.svg` is the top-bar icon.
- **Layout**: add the block `{ "id": "graph", "type": "block", "content": { "mod": "git" } }` to the right-hand panel stack of your layout, next to Files. Replace the shipped Changes block with it if you want one panel for both.
- **Top bar / key**: the mod ships `icons/graph.svg` for a toolbar button. Bind a key to toggle the stack child with id `graph` in your layout's own way.
- **herdr functions**: `exec`, `watchFolder`, `readTextFile`, `spaces`, `panes`, `focused`, `theme`, `settings`, `props`, `shared`, `setShared`, `openOverlay`, `closeOverlay`, `notify`, `home`, `knownAgents`, `updates`; the overlays are `openOverlay({ mod: "git", kind: "popup", props: { role } })`.
- **Programs run** (always `exec(..., { cwd: root, on })`): `git`, and `sh -c` for applying a hunk. Read-only calls go through `READ` (`--no-optional-locks`, `-c core.fsmonitor=false`, `-c diff.autoRefreshIndex=false`). File actions use `--literal-pathspecs` and put paths after `--`; status is parsed from `-z` output.
  - stage `add`; unstage `restore --staged` (no commits yet: `rm --cached`); discard tracked `restore --worktree`, untracked `clean -f`.
  - hunk diffs: `diff --no-ext-diff --no-textconv --no-color --src-prefix=a/ --dst-prefix=b/ -U3` (plus `--cached` for staged; the explicit prefixes keep `diff.noprefix` users working). Hunk apply: `sh -c 'printf %s "$1" | git apply <flags> -'` with the patch in `$1`; flags `--cached`, `--cached --reverse`, `--reverse`, each with `--whitespace=nowarn`.
  - ahead/behind `rev-list --left-right --count`; stashes `stash list --format=%gd%x1f%H%x1f%ct%x1f%s`, and before apply/pop/drop `rev-parse -q --verify stash@{n}^{commit}` must equal the listed hash. Mark resolved: `git --literal-pathspecs add -- <path>`. Smart commit: `diff --cached --quiet` must exit 0.
  - fetch, pull, push run as `env GCM_INTERACTIVE=0 GIT_TERMINAL_PROMPT=0 GIT_ASKPASS= git …` so a credential prompt can't hang.
- **Shared keys kept from the original** (so its settings carry over): `git-graph.columns`, `git-graph.depth`, `git-graph.tags`, `git-graph.fetched`, `git-graph.fetchAll`, `git-graph.changed`.

## Watch out

- Herdr's `exec` has no stdin, so a hunk patch travels in argv. Pass it only as `$1`; the flags are constants, never built from the patch or a path.
- A path may have spaces, unicode or start with `-`: keep `--literal-pathspecs` and `--` on every file action or the wrong file is hit.
- No commits yet: unstage must use `rm --cached`, commit must still work, and ahead/behind must be absent.
- Detached HEAD or no upstream: sync never pushes to a guessed branch (Publish, or disabled).
- If the branch or HEAD changed in a terminal since the panel drew, the action is refused ("changed") rather than applied to the new HEAD.
- Commit with nothing staged runs `add --all` first; it must go through the unmerged-files guard in `executeAction`.
- Lists in Herdr 0.1.12 or later zoom themselves; the graph checks the app version (`updates()`) to know whether its row heights are layout units or pixels.
- Hidden mods stay alive in Herdr, so the panel must not poll; git runs only on the events listed above.
- Herdr's `exec` has a 30 s limit: a slow `pull --rebase` (diverged sync) can be cut off mid-rebase. The header then shows Rebasing… and Abort recovers.
- A repository whose `.git/config` sets filter drivers (or other command-running config) runs them on the panel's `status`/`diff` reads, as any git prompt in that folder would. The panel adds no protection beyond `--no-ext-diff --no-textconv`.
- Not built: line-level staging, conflict resolution (only the `!` marker and Continue/Abort), amend, blame, file history, commit search, editing files.
- Don't edit Herdr's shipped `mods/changes`; Herdr overwrites shipped mods on start. Delete `mods/git-graph` only after `mods/git` passes its checks, and nothing else should reference it.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/git` passes; `herdr-app status` shows `"errors": []`.
- The Git panel opens in the side panel stack and follows the focused terminal's repository.
- In a scratch repo: stage, unstage and discard a file (discard asks first); stage one hunk of a two-hunk file and `git diff --cached` shows only that hunk; commit with ⌘⏎; create and switch branch; stash, list and pop, and Drop asks first.
- Against a local bare remote: pushing and pulling updates `↑N ↓N`. On a diverged branch, sync offers rebase or merge; a clean rebase pushes; a conflicting one stops with `!` files and Abort restores the earlier state.
- In a conflicted repo, Commit with nothing staged refuses.
- A folder that isn't a repo but contains repos shows the Manygit list.
- `npm test` in the mod folder passes.
