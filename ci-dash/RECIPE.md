# CI runs

Based on ci-dash-app from [herdr-plugins](https://github.com/dougcunha/herdr-plugins) by dougcunha (Douglas Cunha), MIT licence, copyright (c) 2026 Douglas Cunha. This copy changes the title, the error messages, GitHub login handling, the square panel style and the runs list. The bundled YAML parser keeps its own ISC licence (see Built from).

CI runs shows the GitHub Actions of the repository in the folder you are working in. A header names the repository. Three tabs sit under it: Runs, Dispatch and Artifacts. Runs is one list of the 30 latest runs, newest first, with a search box and filter chips. Click a run to see its jobs and steps. Dispatch starts a workflow by hand in four steps. Artifacts lists build files and downloads them into the repository folder. It follows the focused terminal, so it changes repository when you change folder.

![CI runs](preview.png)

## What you see

The CI panel follows Crew's existing native interface. It uses a local copy of Crew's `kit.js`: `panel`, `empty`, `button`, `chip`, `iconButton`, `field`, `segmented`, `spinner` and `dot`. No network, workflow, dispatch or polling behavior changes as part of this polish.

- **Frame:** fills its block; `theme().chrome`, a 1px `border` line, radius 10px, clipped contents. Base type is 13px, secondary 12px, metadata 11px, compact labels 10.5px. The same frame applies in a side panel and a pane.
- **Header:** 42px, 16px leading padding and 10px under its trailing controls. A muted 14px CI line icon, **CI runs**, the repository (`owner/repo`) in a flexible truncated 11px column, then 26px icon buttons. Refresh uses an SVG rather than a text glyph. Artifacts also shows the external-folder control. Disabled controls dim and do nothing.
- **Tabs:** a 32px band under the header, with Crew's 22px rounded-6 choices: Runs, Dispatch, Artifacts. The active tab uses the selected neutral surface. Loaded counts are plain dim 10.5px text, not badges nested inside buttons.
- **Filters:** 32px fields with radius 8px, an input-colored border, muted magnifier, 12px input text, plain result count and a clear icon. State and artifact-type choices are compact 22px neutral controls; semantic dots carry the state color. All filter and count behavior stays as described below.
- **Runs list:** one scrolling list, newest first. Rows have 16px side padding, 8px vertical padding and a 4px gap between lines. A 16px status gutter holds a dot or a live 12px spinner, followed by a truncated 13px run title; the run number and age are 11px dim text aligned on the right. The second line is indented 24px and wraps branch, state, duration, event, attempt and workflow/actor metadata. Neutral metadata is plain 10.5px text, with a small branch glyph when relevant. Only semantic states get a restrained 18px-high, radius-4 tint. No decorative event or file-type accent backgrounds.
- **Run detail:** a compact toolbar with an SVG-backed **Runs** back control, **Open**, and **Cancel** or **Rerun**. Text actions use Crew's 28px buttons, with the primary action in `solid` / `solid_foreground`. Below are the 13px run title, number, compact status/branch/duration/event metadata, then the jobs and steps. Jobs remain grouped, with their durations aligned right. Artifacts and update errors remain in their existing places.
- **Dispatch:** the same four-step flow: Workflow, Branch, Inputs, Review. Its compact stepper uses neutral 18px number boxes and a check SVG on completed steps; labels collapse to the current step below 420px. Workflows are radius-8 `surface` cards with neutral 14px play glyphs, 13px names, 11px paths and plain input counts. Branches are 32px rows. Inputs use Crew's 32px fields and neutral choice controls. Required/optional/type labels remain visible. Review keeps the explicit “Nothing starts until you press Dispatch” message and the full inputs table. Footers use 28px Crew buttons; back arrows and row chevrons are SVGs. Warnings have quiet bordered containers and a semantic icon, without colored background washes.
- **Artifacts:** the same workflow grouping and filter controls. Names use 13px type and a muted 14px package glyph; file types, size and age use plain compact metadata. Expired, downloading, downloaded and failed states retain their semantic colors, labels and errors. Download actions and the open-folder control remain available as before.
- **Empty, loading and errors:** Crew's centered empty helper, with a muted context icon or live spinner, 13px title and 11px hint. Error states use the info icon in `blocked`. The footer note retains its message and semantic tone, with 12px side / 8px vertical padding.

All surfaces and text read the existing theme tokens. No fonts, generated images, charts, gradients, glows or decorative animation are introduced. The live spinner remains the only repeating motion in this panel.

## How it behaves

Finding the repository:
- Each render checks the focused terminal. It uses the folder of the focused pane, else the focused tab's first folder, else the first folder in the space, else the last folder seen, else the space's folder. When the folder (or machine) changes, it runs `gh repo view` there, resets all tabs and loads runs. If the `repo` prop is set, that repository is used instead.
- The branch shown as "current" in Dispatch is the branch of that terminal.
- While waiting: "Looking for a GitHub repository…".

Polling and notifications:
- A timer runs every 5 seconds. With the list open, it reloads the list quietly only when some run is not finished and the Runs tab is shown.
- With a run open, it reloads that run and its jobs every tick for the first 12 ticks, then every second tick (10 s) up to tick 60, then every sixth tick (30 s). Finished runs are not polled; the display still repaints each tick so ages and running durations stay current.
- When a run changes from not finished to finished, a notification fires: title `CI <label>: <workflow name>`, body `#<number> · <branch> · <duration>`, level `success` for passed, `error` for failed, `info` for the rest. It fires from the list refresh and from the open run.
- When a run finishes in the open detail, its artifacts are listed once.

Runs and detail:
- Click a row to open the run. `‹ Runs` or the Runs tab goes back.
- `Open` opens the run in the browser (`gh run view --web`).
- `Cancel` (only while the run is not finished) posts to the cancel endpoint, then reloads the run.
- `Rerun` (only when finished) posts to the rerun endpoint, clears the artifact list and holds the "queued" look for up to 20 seconds, ignoring the old attempt that GitHub may still return. Polling restarts from tick 0.
- `⟳` reloads what is on screen: the list, the open run (artifacts re-listed), the Dispatch tab (reset and reloaded) or the Artifacts tab.
- Props `filter` and `status` set the search box and chip once, when the repository first loads.

Dispatch:
- Opening the tab reads every workflow once. Only active workflows whose YAML (read from the default branch) declares `workflow_dispatch` are listed, sorted by name, up to 6 read at once. If none qualify, the message names the default branch and says to add `on: workflow_dispatch`.
- Choosing a workflow loads branches (not tags). Choosing a branch reads the workflow file at that branch, and shows an error if it does not declare `workflow_dispatch` there. With no inputs it goes straight to Review. Click a finished step in the stepper to go back. What was loaded stays.
- Defaults: boolean `false`, number `0`, choice the first option when the default is not an option, other types empty.
- Review checks: at most 25 inputs, required inputs not empty, numbers are numbers, choices are in the options. A failure shows a red banner and nothing is sent.
- `Dispatch` first notes the highest existing run id for this workflow, branch and your login, then sends the request. If GitHub returns the new run id, the run opens at once. If not, the mod looks for a run with a higher id, created at most 60 seconds before the request, once per 5 s tick for up to 18 tries (about 90 s). If it cannot find one, it says the workflow was dispatched and was not dispatched a second time. A 401, 403 or 404 while looking gives up with the message.
- When the run is found, the tab switches to Runs, the list reloads and the run opens.
- Props `workflow` (name or path, case-insensitive substring) and `ref` pre-select; `ref` only applies when `workflow` is also set. They stop at the inputs form and never dispatch.

Artifacts:
- Loading scans each workflow in `.github/workflows` (not deleted), checks its latest 5 runs in order and keeps the first run that has artifacts. Groups sort by newest artifact. If every workflow fails, the error shows; otherwise the failed count shows in the note line.
- Click a row to download. An expired artifact shows `Artifact "<name>" has expired.` in the note line instead. A download in progress ignores clicks.
- Files go to `<repository root>/.ci-dash/artifacts/<run id>/<artifact name>/`. The root comes from `git rev-parse --show-toplevel`, else the focused folder. The name is made safe: `<>:"/\|?*` and control characters become `_`, leading dots become `_`, trailing dots and spaces are removed, empty becomes `artifact`.
- After a download the row shows the folder and the action becomes `Again`. A failure shows the message and `Retry`.
- `↗` opens the last download folder, else `.ci-dash/artifacts`, in the system file manager. If neither exists: "No artifacts downloaded yet. They go to <path>".

Error states (shown as a title and a hint in the body):
- Not a git folder: "This folder is not a git repository." / "Focus a terminal inside a repository that has a GitHub remote, and CI runs follows it."
- No GitHub remote: "This repository has no GitHub remote." / "Add one with git remote add origin <url>, or focus a terminal in another repository."
- Repository not visible: "None of your GitHub logins can see this repository." / "Log in with an account that has access: gh auth login, then press ⟳."
- Not logged in: "GitHub CLI is not logged in." / "Run gh auth login in a terminal, then press ⟳."
- No folder: "No folder to look for a repository in."
- `gh` not installed: "Could not start gh: ... Install it from https://cli.github.com and run gh auth login."
- Other GitHub errors show gh's own text with a hint for 401 (log in again), 403 (token needs Actions permission, or the organization needs SSO), 404 (not found or no access) and 429 (rate limit).
- When the folder changes to one with no GitHub repository, the old repository's runs are cleared and the error shows for the new folder.
- Empty and loading: "Loading runs…", "No workflow runs yet." with "Runs appear here after a workflow executes."

## Built from

`mods/ci-dash/mod.json` (the whole file):

```json
{ "place": "none" }
```

It is not placed anywhere on its own. Put it in a layout block, a new tab or a split pane.

Files in `mods/ci-dash/`: `main.js` (the view), `ui.js` (pills, search box, chips, stepper, spinner), `format.js` (time, size, state helpers), `gh.js` (GitHub access), `dispatch.js` (Dispatch tab), `workflow-inputs.js` (reads `workflow_dispatch` inputs), `yaml.js` and `yaml.LICENSE`, and icons `branch.svg`, `ci.svg`, `close.svg`, `info.svg`, `package.svg`, `play.svg`, `search.svg`, `spinner.svg`. Icons are drawn with `svg("mods/ci-dash/<name>.svg")` and tinted by theme color.

Entry: `export default class CiDash extends View` (from `gpui-kit`), using `v_flex`, `h_flex`, `InputState`, `Input` from `gpui-base`. Timer: `cx.timer.every(5000, ...)`. Async work: `cx.spawn`.

Props, read once in `init` (falls back to `props()` if the argument is empty):

| Prop | Meaning |
|---|---|
| `panel` | `true` for a side panel: square, top and bottom borders only |
| `tab` | `runs` (default), `dispatch` or `artifacts` |
| `repo` | pin `owner/repo` instead of following the folder |
| `workflow`, `ref` | pre-select in Dispatch (never dispatches) |
| `filter` | pre-fill the Runs and Artifacts search boxes |
| `status` | pre-select a chip: `live`, `attention`, `passed`, `other` for runs; `available`, `downloaded`, `expired` for artifacts |
| `type` | pre-select an artifact file type, such as `zip` |

Note: `status` values are the group ids from the code (`live`, `attention`, `passed`, `other`; `available`, `downloaded`, `expired`), not the chip labels.

As a side panel:

```json
{ "id": "ci", "type": "block", "content": { "mod": "ci-dash", "props": { "panel": true } } }
```

Or: `herdr-app do tab.new --name CI --mod ci-dash`, or `herdr-app do pane.split --direction right --mod ci-dash`.

`herdr` functions used: `focused()`, `panes()`, `spaces()` (find the folder, machine and branch), `exec(cmd, args, { cwd, on })` (run programs), `home()` (tell Windows from macOS and Linux), `theme()`, `settings()` (`font_family` for monospace text, default `JetBrains Mono`), `notify({ title, body, level })` and `props()`.

Programs run:
- `gh repo view [owner/repo] --json nameWithOwner,url,isPrivate,defaultBranchRef` (find the repository).
- `gh api --hostname <host> --header "Accept: application/vnd.github+json" <path>` for runs, run, jobs, artifacts, workflows, branches, workflow runs and the login (`user`). Lists use `--paginate --slurp`. Cancel and rerun use `--method POST`. Raw workflow files use `Accept: application/vnd.github.raw+json` on the contents endpoint.
- `gh api --method POST ... repos/<owner>/<repo>/actions/workflows/<id>/dispatches -f ref=<branch> -f inputs[<name>]=<value> -F return_run_details=true`. Inputs use `-f` so each stays a string.
- `gh run view <id> --web -R <host>/<owner>/<repo>` (Open).
- `gh run download <id> --name <artifact> --dir <dir> -R <host>/<owner>/<repo>` (download).
- `git rev-parse --show-toplevel` (repository root).
- `gh auth status` and, for the fallback, `sh -c` (see below).
- `test -d <dir>` (macOS and Linux) or `pwsh -NoProfile -Command Test-Path ...` (Windows), then `open` (home starts with `/Users/`), `xdg-open`, or `explorer.exe` to open the downloads folder.

GitHub login fallback (gh.js). `exec` takes no environment, so for a non-active login the mod runs this one-line shell, which reads that login's token for this one call only:

```js
exec("sh", ["-c", 'GH_TOKEN="$(gh auth token -h "$1" -u "$2")" || exit 4; shift 2; GH_TOKEN="$GH_TOKEN" exec gh "$@"', "gh", host, account, ...args], { cwd, on })
```

- `resolveRepo` first runs `gh repo view` as the active login. If the error matches `Could not resolve to a Repository`, `HTTP 404` or `Not Found`, it reads the logged-in accounts from `gh auth status` (lines `Logged in to <host> account <login>` and `Active account: true`). It tries each account that is not active, in order, and keeps the first that can see the repository as `repo.account`. Every later call for that repository uses it. If none can, it throws a 404 error with the first message.
- The active login is never switched and no token is stored.

Files written: only `<repo root>/.ci-dash/artifacts/<run id>/<artifact name>/`, created by `gh run download`. Nothing else is written.

YAML: `yaml.js` is a minified browser bundle of the `yaml` package 2.8.1 that exports only `parse`. `workflow-inputs.js` imports it and reads `on.workflow_dispatch.inputs` (types `string`, `choice`, `boolean`, `number`, `environment`; an unknown type becomes `string`, with a warning). The `yaml` package is ISC licensed, copyright Eemeli Aro; the licence text is in `yaml.LICENSE` and must stay beside `yaml.js`.

## Watch out

- It reaches the network through `gh`. Every GitHub call is a `gh` call from your machine with your login. It runs programs (`gh`, `git`, `sh`, `test`, `open` or `xdg-open`). It writes files in the repository folder, under `.ci-dash/artifacts`. It stores no credentials. Add `.ci-dash/` to the repository's `.gitignore`, or the downloads show in `git status`.
- The panel runs `gh` against whichever folder is focused. Focusing a terminal in another repository switches the panel to that repository.
- `Dispatch` and `Rerun` and `Cancel` change real runs on GitHub. They need a token that can write to Actions. Dispatch only starts after the final Dispatch click.
- `exec` stops after 30 seconds. A very large artifact download can time out and shows `Retry`.
- The mod runtime has no `Buffer`. Raw workflow files are fetched as text with the raw media type. Do not ask for base64 contents.
- Read props once in `init` and keep them. `props()` called inside a later callback can answer for another copy of the mod.
- Use `-f` for dispatch inputs, not `-F`, or `"true"` and `"12"` turn into JSON types. `exec` has no stdin, so the request body cannot be piped.
- The multi-login fallback uses `sh`, so it works on macOS and Linux and not on Windows. `gh auth token` must support `-h` and `-u` (a recent `gh`).
- Dispatch lists branches, not tags. Only workflows that declare `workflow_dispatch` on the default branch appear. A branch that removes it shows an error at the Branch step.
- The Runs list shows 30 runs only. Artifacts looks at each workflow's 5 latest runs and shows the first run that has artifacts.
- Mouse only, apart from the text boxes. There are no keyboard shortcuts and no `keys.json`.
- A run that finishes while you watch can notify twice: once from the open run, and again when the list refreshes later, because the list still holds the old state. A fresh build may or may not match this.
- The sort order is by start time, not by state. A running run older than a finished one sits below it. Use the Running chip to see running ones only.
- Do not give the mod a size smaller than about 340px wide. The Dispatch stepper shows only the current label below 420px.
- Run titles, branches and actors come from GitHub. Long text is truncated with an ellipsis, not wrapped.

## Done when

- `herdr-app check mods/ci-dash` passes.
- With a terminal focused in a repository that has Actions runs, the header shows "CI runs" and `owner/repo`, and the Runs tab lists up to 30 runs newest first, with pills for branch, status and duration, and no section headers.
- The Running, Failed, Passed and Other chips narrow the list and their counts add up to the All count. Typing in the search box narrows it further and clears with the close icon.
- Both pane and side-panel placement use the same Crew frame: 10px radius, chrome surface and a 1px border on every edge.
- Clicking a run shows its jobs, steps and (when finished) artifacts. `Open` opens the browser. `Cancel` shows only for a running run. `Rerun` shows only for a finished one.
- Starting a run while the panel is open and a watched run finishes raises one notification titled `CI <status>: <workflow>`.
- Dispatch lists only workflows with `workflow_dispatch`, then steps through branch, inputs and review. Nothing starts until `Dispatch` is pressed, and then the new run opens in the Runs tab.
- Artifacts lists artifacts grouped by workflow. Clicking one creates `<repo root>/.ci-dash/artifacts/<run id>/<name>/` and the row shows `downloaded`. `↗` opens that folder.
- A terminal in a folder that is not a git repository shows "This folder is not a git repository." A repository with no remote shows "This repository has no GitHub remote."
- With two `gh` logins where only the non-active one can see the repository, the repository loads and `gh auth status` still shows the same active login.

## Files

- `mods/ci-dash/mod.json`
- `mods/ci-dash/main.js`
- `mods/ci-dash/ui.js`
- `mods/ci-dash/format.js`
- `mods/ci-dash/gh.js`
- `mods/ci-dash/dispatch.js`
- `mods/ci-dash/workflow-inputs.js`
- `mods/ci-dash/yaml.js`
- `mods/ci-dash/yaml.LICENSE`
- `mods/ci-dash/branch.svg`, `ci.svg`, `close.svg`, `info.svg`, `package.svg`, `play.svg`, `search.svg`, `spinner.svg`
- `README.md`
- `RECIPE.md`
- `preview.png`

## Polish provenance

Light-polish process adapted from **unslop** by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), licensed CC BY 4.0. Existing Crew style and all CI behavior are retained.
