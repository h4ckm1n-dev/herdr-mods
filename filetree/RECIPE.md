# filetree

Local integration: the view accepts fresh `crew.panel-focus` requests for `filetree`, deferring focus until after render so Crew's Files shortcut works. The `file-icons` dependency is installed separately in this checkout. Claude and Codex activity use the same bridge; Codex adds `--codex` and observes Bash and apply_patch. Registration and exact-definition trust are separate from copying the mod.

An IDE-style file tree for the side panel of any Herdr layout, by cybertron288, based on claude-code-filetree by Kurt Buhler (MIT). It follows the folder of the focused terminal and shows the files in it with git colors, line counts and a branch summary. You can filter across folders you have not opened, preview a file in place, and send a path to your agent. With an optional Claude Code hook, the files Claude reads, writes and commits light up in the tree as it works, and a Recent tab lists them.

![filetree](preview.png)

## What you see

The existing Crew side-panel frame: radius 10, a quiet theme chrome background, a one-pixel border, and an accent border while the tree holds keyboard focus. Fonts come from the user's settings; the scale is Crew's 13px title, 12px body, and 11px metadata. `kit.js` is an unchanged local copy of the house kit because native mods cannot import across folders.

- Header: 42px, 16px left padding, 8px gaps, 26px icon buttons. The title is Files, followed by the truncated root folder and Tree/Recent icon tabs with named tooltips and keys 1/2. A preview instead shows the path, Material icon, Back, Open externally, Copy and Send to agent controls.
- Git summary: real branch, ahead/behind, line totals, and the existing four-pixel modified/new/deleted share bar. Semantic colors retain their meanings. Counts and upstream are quiet 11px metadata; outside a repo it reads No git repository.
- Filter: 32px input on the theme background with an accent focus border. Adjacent 26px line-icon controls move up/home, toggle dotfiles, switch dates/sizes, and collapse folders. Recent offers Clear instead. Each control has its original tooltip and action.
- Virtual rows: 28px, 8px gaps and side padding, 16px indentation per depth. Material file/folder icons remain full-color. Names use 12px text; dates, sizes, git letters and counts use 11px metadata. The selected row uses the theme selection surface. Ignored files are dimmed; changes keep their semantic git colors. Recent shows the original read/write/commit activity and age.
- Preview: Markdown renders with 16px padding; code retains its read-only syntax-highlighted editor. Loading/error/empty messages remain bounded to the panel. The footer retains the selected path and real agent git activity.

UI polish follows the unslop method by Damir Sokolovsky (@heydamir), CC BY 4.0, in light polish mode. It keeps Crew's design charter, data, chart, behavior, semantic live motion, and Material assets; no decorative charts or generated content are added.

## How it behaves

**Which folder.** The folder of the focused terminal pane (the first terminal in the same tab if a mod pane is focused). It switches when focus moves to another folder. The tree opens folders lazily and remembers, per folder, which subfolders were open and which row was selected. `↑` pins the parent folder and stops following; `⌂` follows again. It works on remote machines too (the same shell commands run there), but the folder watch, "Open in default app" and "Reveal" are local only. File clicks use the project's Neovim server on the shown machine; Enter previews locally or remotely.

**Tree view.** Folders first, then files, natural sort, case-insensitive (`file2` before `file10`). `.git` is never listed. Each folder lists at most 2000 entries. Dotfiles show by default; `◉` or `.` toggles. The setting, the date or size choice and the active tab are remembered between sessions.

**Clicks.** A file click selects it and opens it in the project's Neovim tab, reusing its server when one answers. Folder clicks open or close the folder. A second click on the same row within 450ms is ignored so it does not open a duplicate editor or toggle the folder twice. Right-click selects and opens the menu: Preview (files), Open in default app (files, local), Reveal in Finder (or "Show in folder" off macOS; local), Copy relative path, Copy absolute path, Send to agent. Copying shows a 2s toast "Copied". In Recent, clicking a file opens Neovim; clicking a folder or pressing `→` shows it in the Tree tab.

**Keys** (when the list has focus). `j`/`k` or up/down move; PgUp/PgDn move 10; Home/End jump. `l` or right opens a folder; `h` or left closes it, or moves to the parent. Enter previews a file or toggles a folder. Space toggles a folder or previews a file. `p` previews. `y` copies the relative path, `Y` the absolute one. `a` sends `@path ` to the agent. `.` toggles dotfiles. `/` focuses the filter. `1` and `2` switch tab. Esc clears the filter, then the selection. In a preview: Esc, left or `h` goes back; `o` opens it in the default app. In the filter box: up/down move through results, Enter jumps, Esc clears then returns focus to the list.

**Filter.** Typing searches the whole folder, not just open folders, using a one-time index (depth 12, or 5 at the home folder or `/`; skips `.git`, `node_modules`, `target`, `.venv`, `__pycache__`, `dist`, `.next`, plus `Library`, `AppData`, `.Trash` at home; at most 20,000 folders and 40,000 files). Matches by path, file-name hits first, 200 at most, shown as a tree of just the matches and their parents. Enter (or clicking a folder) clears the filter and opens the tree at the chosen file. In Recent, the filter narrows the list instead.

**Preview.** Enter, Space, `p`, or the menu. Text over 400,000 characters is cut with "… (file truncated)". Binary files say "Binary file · no text preview". Markdown (`.md`, `.markdown`, `.mdx`) is rendered; other files are highlighted by extension (a few mapped: `ts`, `tsx`, `jsx`, `mjs` to js; `toml`, `yml` to yaml; `vue`, `svelte` to html; `sh`, `zsh` to bash). Syntax colors: keyword `t.ansi5`, string `t.ansi2`, comment `t.dim`, function `t.ansi4`, type `t.ansi3`, number `t.ansi1`, constant `t.ansi6`.

**What refreshes and when.** The tree and git status reload every 10s, and at once when the folder watch reports a change (ignoring `.git` itself). Only one reload runs at a time; one more is queued if a change arrives during it. A reload re-lists the root and every open folder, then runs git. Sizes are measured with `du -sk`, two at a time, for visible folders only, while `Σ` is on. The Recent list's ages refresh every 30s while it is shown.

**Claude activity** (needs the hook below; without it everything else works). Reads highlight purple (`t.ansi5`), writes orange (`t.ansi3`), git commits green (`t.ansi2`). On an event the file's row gets a 13% tint of its color, the icon and name pulse (opacity 0.35 to 1 over 900ms) for 2.7s, then the name stays tinted for 45s in total before it fades. A closed folder over a lit file glows in the color during the 2.7s, name only. With `follow` on and the Tree tab shown, the tree opens the parents and scrolls the last lit file to the center (up to 12 files; up to 60 for a search that reads many files). Bash commands that are not read-only are timed: the files the folder watch saw change between start and end are lit orange (ignored files and `.git` skipped). Mentioning `@path` in a prompt selects that file and reveals it. Git actions (commit, push, pull, merge, rebase, stash, reset and so on, `gh pr create` and similar) set the footer chip, running for up to 10 minutes and the result for 45s, and flash the branch row in the action's tone for 2.7s; a commit also lights its files green. Only events whose working folder is inside the shown repo count. Recent keeps the last 120 events (trimmed to 80), newest first, one row per file, kept between sessions.

## Built from

**Files.** `mods/filetree/` and `mods/file-icons/` (icons are loaded from `mods/file-icons/icons/` at runtime, so both folders must be installed).

**mod.json** of filetree: `{ "place": "none", "overlay": { "width": 210, "height": 206 } }`. `place: "none"` means it is put in a layout block by name: `{ "id": "files", "type": "block", "content": { "mod": "filetree" } }`, or opened with `pane.split --mod filetree`. file-icons has `{ "place": "none" }` and is only the icon store (it is also a working Files panel).

**One view, one popup.** `main.js` default-exports a `View`. The same class renders the popup menu when opened with `props().menu` set (via `openOverlay({ mod: "filetree", kind: "popup", width: 210, height: 28 * rows + 10, props: { menu } })`, 7 rows for files, 5 for folders); the menu closes with `closeOverlay(props().overlay)`. No other `props` roles.

**config.json** (read once at start from `<appHome>/mods/filetree/config.json`; an invalid file shows a warning toast and uses defaults):

| Key | Values | Default |
|---|---|---|
| `activity` | `reads and writes`, `writes`, `reads`, `none` | `reads and writes` |
| `follow` | `true` opens folders and scrolls to agent activity | `true` |
| `column` | `date` or `size` at start (until the user toggles `Σ`) | `date` |

**Shared state.** Reads `filetree.view` (`{ view: "tree" | "recent", n }`): another mod sets it and the tree switches tab when `n` is new. Reads `filetree.preview` (`{ root, rel, n }`): shows that file if `root` is the shown folder. Writes `filetree.preview` from the Preview menu item (`setShared`). Browser storage keys: `prefs` (`showHidden`, `showSize`, `view`) and `history`.

**herdr imports:** `spaces`, `panes`, `agents`, `terminals`, `focused`, `exec`, `readTextFile`, `watchFolder`, `theme`, `settings`, `window`, `layout`, `home`, `appHome`, `props`, `run`, `notify`, `openOverlay`, `closeOverlay`, `shared`, `setShared`. Commands run: `pane.focus {terminal}` and `terminal.paste` (Send to agent). `layout()` is walked for the first node with `content.tab` and `content.pane` to read `radius` and `header.height`. `settings().font_family` and `settings().dark` set the preview font and the icon set (light themes check the Material light table first).

**gpui-kit and gpui-base:** `View, div, svg, image`; `v_flex, h_flex, Editor, EditorState, InputState, Input, Scrollbar, v_virtual_list, VirtualListScrollHandle, TextView`.

**Programs it runs** (through `exec`):
- `git` in the shown folder, read-only: `git --no-optional-locks -c core.fsmonitor=false -c diff.autoRefreshIndex=false` with `rev-parse --show-toplevel --show-prefix`, `status --porcelain=v1 -z -b --no-renames --untracked-files=normal --ignored=traditional -- .`, `rev-parse --verify -q HEAD`, and `diff HEAD --numstat -z --no-renames -- .`. Ignored paths are capped at 5000.
- `sh -c` scripts: list a folder with one `stat` call (GNU `stat -c '%F/%s/%Y/%n'` or BSD `stat -f '%HT/%z/%m/%N'`), build the search index with `find`, `mkdir -p` the activity folder, `du -sk` for folder sizes.
- `open`, `open -R`, `xdg-open`, `explorer.exe`, or PowerShell `Invoke-Item` to open or reveal a file.
- File clicks probe `nvim --server <socket> --remote-expr` on the shown machine. A live server receives the file and its terminal is focused; otherwise a stale socket is removed with `rm -f`, and `terminal.open` starts a Neovim tab with `--listen`. The socket hash uses the machine and project folder, matching Crew's existing editor. A two-second startup guard prevents duplicate launches. Neovim's `VimLeave` cleanup waits for it to exit before `hc kill` closes its terminal/tab. Opening errors show a toast and fall back to preview.
- On Windows (local), PowerShell `Get-ChildItem` replaces the shell scripts for listing and indexing; `du` sizes are off.

**Files read outside its folder:** the project folder being shown (listing, previews), `<home>/.local/state/herdr-filetree/activity.jsonl` (watched with `watchFolder`; each change re-reads the file and takes events newer than the last one seen), and its own `config.json`.

**Optional Claude Code hook, `mods/filetree/bridge.ts`.** A Bun script (`#!/usr/bin/env bun`) run by Claude Code hooks. It reads the hook JSON from stdin and appends one JSON line per event to `~/.local/state/herdr-filetree/activity.jsonl` (`{ at, cwd, session, id, kind, paths, ... }`); when the file passes 256 KB it keeps the last 400 lines. Events: `read` (Read; Grep and Glob with their hit files; paths a read-only Bash command touches: `rg grep find fd cat head tail bat less more ls eza tree wc sed awk jq`), `write` (Write, Edit, MultiEdit, NotebookEdit, on success), `mention` (`@path` in a prompt), `bash-start` and `bash-end` (non-read-only Bash), and `git` (state `running`, `done` or `failed`, with `actions` of verb, label, tone; for a finished commit it also runs `git log -1` and `git show --name-only` to add the hash, subject and files). Git verbs map to tones: commit green, push teal, pull/fetch/checkout/switch/branch/clone blue, merge/rebase/cherry-pick/tag purple, stash/mv orange, add/init green, reset/restore/revert/rm red; `gh` pr create/merge/checkout/comment/review, repo clone, release create and issue create are covered. Read-only git commands are ignored. It always exits 0.

Register it in `~/.claude/settings.json`, merged with any hooks already there (bun is needed, restart Claude Code sessions afterwards). Each entry is `{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\"", "timeout": 5 }`:

- `PreToolUse`, matcher `Bash`
- `PostToolUse`, matcher `Read|Grep|Glob|Write|Edit|MultiEdit|NotebookEdit|Bash`
- `PostToolUseFailure`, matcher `Bash`
- `UserPromptSubmit`, no matcher

**Icon art.** 1,180 SVGs in `mods/file-icons/icons/`, picked by `mods/filetree/icons.js` (a generated table, byte-identical to `mods/file-icons/icons.js`, from Material Icon Theme 5.40.0). Matching follows VS Code: lower-case names; a path rule (`.github/workflows`) beats a name, a name beats an extension, the longest extension wins (`spec.ts` over `ts`); open folders use `<id>-open`. Own 12px glyphs in `mods/filetree/`: `chevron-right.svg`, `chevron-down.svg`, `chevron-left.svg`, `folder.svg`, `clock.svg`, `git-branch.svg`, `git-compare.svg`, `search.svg`, `file.svg` (`git-compare` and `file` are not used by the code). Icons are Material Icon Theme by Material Extensions, MIT licence: keep `LICENSE-material-icon-theme.txt` in both folders. The tree is a port of claude-code-filetree (MIT, Kurt Buhler); the hook's command parsing is a trimmed port of its `hooks/git.ts`.

## Watch out

- **It runs programs and reads outside its folder.** It runs `git`, `sh`, `find`, `stat`, `du`, `mkdir`, and `open` or `xdg-open` (PowerShell on Windows), and reads the shown project's files plus `~/.local/state/herdr-filetree/activity.jsonl`. It does not use the network. The git calls are read-only and avoid writing under `.git`; this matters, because a write there would trip the folder watch and loop the refresh. Tell the person before adding it. The hook, if registered, runs `bun` and `git` on every matching Claude tool call.
- **Virtual list rows cannot hold handlers.** `v_virtual_list` gives the list one `on_item_click(rel)` and `on_item_secondary_click(rel)`. Rows only set an `id`. A second press on the same row inside 450ms is ignored to suppress duplicate opens.
- **Mods cannot import across folders.** That is why `icons.js` is copied into `mods/filetree/`; keep it identical to the file-icons one. Only the SVGs are read by path (`mods/file-icons/icons/<id>.svg`), so removing file-icons leaves blank icons.
- **No `Intl`.** The runtime has none, so the natural sort is a small hand-written comparer (digit runs compared as numbers) and dates are formatted by hand with a month-name table.
- **`render()` cannot call `cx.notify`.** The `filetree.preview` request is handled inside `render()`, so `show(rel, cx, true)` skips the notify there. Handle `filetree.view` in render the same way, by changing state only.
- **Redraws are throttled.** A one-second timer redraws only when a highlight changes state (bright, tinted, gone), when a chip expires, while sizes are being measured, or every 30s in Recent. Do not redraw every second.
- **Hide `.git` and prune big folders**, or the index and listings grow without bound. Limits: 2000 entries per folder, 200 search hits, 20,000 folders and 40,000 files indexed, 5000 ignored paths, 60 paths per hook event, 400,000 characters of preview, folder nesting 40 deep.
- **Search index is stale-safe only by reset.** It is dropped when the watch sees a change (and no filter is active) and when the folder changes. Typing while it rebuilds uses the newest query only.
- **Folder watch is local only.** Remote folders refresh by the 10s timer; there is no activity highlighting for paths outside the shown folder.
- **Send to agent goes through the clipboard.** It writes `@path ` (quoted if it has spaces; relative to the agent's folder when inside it), focuses the agent's terminal, runs `terminal.paste`, and restores the old clipboard after 600ms. With no agent in the tab it shows a "No agent in this tab" warning toast.
- **Window width matters.** Tab labels need 300px, the date column needs more than 250px. Test narrow (about 220px) and wide (400px).
- **Do not add a Changed tab or a Settings screen**; the code has two views only, Tree and Recent. `1` and `2` are the only tab keys.
- **Colors come from the theme.** Writes are `ansi3` (orange) and modified is `ansi11` (yellow) so they never look alike. Use the theme's `ansi11` and `ansi14` when present, else `ansi3` and `ansi6`.

## Done when

- `herdr-app check mods/filetree` passes (and `herdr-app check mods/file-icons`).
- Put in a layout block, it shows the folder name, the Tree and Recent tabs, a summary line, a filter box with five tool buttons, and a list of rows 26px high with Material Icon Theme icons.
- In a git repo with changes, the summary shows the branch, `+N −N` totals and a colored bar with a legend; changed files show a status letter and line counts in the git colors; folders show `?:N M:N D:N`. Outside a repo it says "no git repo".
- Moving focus to a terminal in another folder changes the tree to that folder.
- Clicking a folder opens it; a file click opens Neovim, reusing the project's editor; Enter previews the selected file, and Esc goes back. Markdown renders, code is highlighted.
- Typing in the filter finds a file inside an unopened folder; Enter opens the tree at it.
- `Σ` swaps dates for sizes; `.` or `◉` hides dotfiles; both survive a restart.
- Right-click shows the menu with Preview, Copy relative path, Copy absolute path and Send to agent (plus Open and Reveal on a local folder); Send to agent types `@path ` into the tab's agent.
- With the hook registered and Claude reading a file, that row pulses purple and the tree opens to it; a write pulses orange; a `git commit` lights the branch row and files green and shows "✓ committed" with the hash in the footer. Recent lists them with `R`, `W` and `C` pills.
- Setting `"activity": "none"` stops the file highlights. File clicks open Neovim; Enter, Space and `p` preview. Right-click still offers the system default app.
- Without the hook, the mod still works and Recent says "Files agents read and write here show up in this list".

## Files

- `RECIPE.md`: this brief.
- `README.md`: the human install guide.
- `preview.png`: screenshot.
- `mods/filetree/`: `main.js`, `icons.js`, `bridge.ts`, `mod.json`, `config.json`, `chevron-right.svg`, `chevron-down.svg`, `chevron-left.svg`, `folder.svg`, `clock.svg`, `git-branch.svg`, `git-compare.svg`, `search.svg`, `file.svg`, `LICENSE-material-icon-theme.txt`.
- `mods/file-icons/`: `main.js`, `icons.js`, `mod.json`, `chevron-right.svg`, `chevron-down.svg`, `icons/` (1,180 SVGs), `LICENSE-material-icon-theme.txt`.

## Local Codex bridge

Register `bridge.ts --codex` for PreToolUse (Bash), PostToolUse (Bash|apply_patch), and UserPromptSubmit, as shown in README.md. Preserve other hooks. Trust the three exact definitions through the native runtime before use. Patch add/update/delete/move headers become write paths only after successful calls; failed shell calls remain failed git actions. RTK wrappers are unwrapped for read/git classification. Both agents append to the existing bounded activity log with an `agent` field. Tests replay both event formats into an isolated temporary log.
