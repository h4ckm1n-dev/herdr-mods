# Crew · layout

The Herdr window, rebuilt around your coding agents. One layout and 13 mods that replace the
sidebar, the tab bar, the pane headers, the side panels, the bottom bar, the menus and the dialogs.
Each piece also stands alone, but together they make one window where agents come first.

[← The whole system](../README.md) · [Recipe](RECIPE.md)

![Crew](preview.png)

## The window, region by region

```
┌──────────────┬────────────────────────────────────────────┬──────────────┐
│ brand row    │ tab bar  · tabs · + · [Files] [Git] [Cost] │              │
├──────────────┼────────────────────────────────────────────┤              │
│ Agents       │ pane header                                │  side panel  │
│  Working     │                                            │  Files       │
│  Needs you   │            your terminals                  │  Git         │
│  Done · Idle │                                            │  Cost        │
├──────────────┤                                            │              │
│ Spaces       │                                            │              │
├──────────────┼────────────────────────────────────────────┴──────────────┤
│ footer       │ bottom bar · machine · branch · n working   quotas 5h · 7d │
└──────────────┴───────────────────────────────────────────────────────────┘
```

| Region | Mod | Size |
|---|---|---|
| Brand row, sidebar footer | `workspace-chrome-crew` | 46px · 69px |
| Agents | `agents-crew` | half the sidebar |
| Spaces | `spaces-crew` | the other half |
| Tab bar | `tabs-crew` | 42px |
| Pane headers | `pane-crew` | 30px |
| Side panel stack | `files-crew` · `git` · `cost` | 368px, 280–900, resizable |
| Bottom bar | `workspace-status-crew` · `claude-usage` | 28px |
| Menus and dialogs | `menu-crew` · `new-menu-crew` · `worktree-crew` · `picker-crew` | overlays |

The sidebar is 268px. Drag its edge, or use the brand row's toggle, to fold it to a 44px rail.

## Components

### Agents · `agents-crew`

<img src="sidebar.png" align="right" width="200" alt="Agents and spaces">

Every Claude Code and Codex session, in four groups: **Working**, **Needs you**, **Done** and
**Idle**.

- A row shows a spinner while the agent works, its icon (Claude in coral, Codex in cyan), its name,
  and the time since its last state change.
- Under it: the last thing the agent did, its context fill as a 4px bar, and its running
  sub-agents with progress bars.
- A thin bar on the left edge carries the color of the agent's space.
- A Codex card at the bottom shows Codex's 5h / 7d quota.
- Click a row to jump to that agent's terminal, in any space. **⌘⇧A** gives the list the keyboard
  (arrows, Enter).

It reads your own transcripts on disk with `scan.py` and `codex_scan.py`: `~/.claude/projects` and
`~/.codex/sessions`.

### Spaces · `spaces-crew`

- Each space has a stable colored avatar. Two lines per row: the name and its agent count, then the
  repo, the branch and ↑↓ against its upstream.
- Worktrees sit nested under their checkout. Spaces are grouped by machine when you have more than
  one, with a **New space there** row.
- **Space colors:** right-click a space and pick one of 8 swatches. Its avatar and its agents' bars
  take that color everywhere.
- **⌘⇧S** gives the list the keyboard.

<br clear="right">

### Brand row and footer · `workspace-chrome-crew`

The Herdr mark, search, and the sidebar toggle at the top. Settings and Add machine at the bottom.
The brand row drags the window.

### Tab bar · `tabs-crew`

- Your tabs, a **+** that opens the New tab or agent menu, and one button per side panel on the right: Files, Git, Cost.
- **⌘E**, **⌘G** and **⌘⇧U** open those panels and give them the keyboard. The same key again closes the panel.
- **⌘J** jumps to the next agent waiting on you, in any space.

### Pane headers · `pane-crew`

A 30px header on each pane: the program's icon and name, the title, the folder, then split, zoom
and close.

### Files · `files-crew`

The focused pane's folder as a lazy tree, with read-only previews. It follows the terminal you are in.

### Git · `git`

Source Control and a commit graph in one panel. It's also a module of its own: [Git](../git/README.md).

### Cost · `cost`

<img src="cost.png" align="right" width="220" alt="Cost panel">

What your sessions would cost at API prices, from the same transcripts:

- **Today** against a daily budget, with the last hour and your hourly pace. The budget is
  `DAILY_BUDGET` at the top of `cost/main.js`, $150 by default.
- **Priciest today:** the session, with its sub-agents, that cost the most.
- **Last 7 days** as columns, Codex as a thin row under them.
- **By model**, with the share of input read from cache. Low means full-price re-reads.
- **Sub-agents'** share and **top projects**.

Codex is priced at OpenAI's API rates, even if you run it on a ChatGPT plan. `cost.py` does the
reading; the panel refreshes every minute while it is visible.

<br clear="right">

### Bottom bar · `workspace-status-crew` and `claude-usage`

![Bottom bar](bottom-bar.png)

- **Left:** the machine, the branch, `n working` with a spinner, `n needs you`, and a `Commands ⌘⇧P` button.
- **Right:** your Claude Code and Codex 5h and 7d quotas side by side. Grey until 50%, amber after, red past 90%, with the time to reset in the tooltip.

`limits.py` reads them every 30 seconds:
- **Claude:** from the cache your Claude Code statusline writes (`/tmp/claude/statusline-usage-cache.json`).
- **Codex:** from the latest rate limits it logged in `~/.codex/sessions`.

With neither, the block stays empty.

### Menus and dialogs

| Mod | What it draws |
|---|---|
| `menu-crew` | The tab, space and terminal context menus, with the space color swatches |
| `new-menu-crew` | The **+** menu: a new terminal, or any agent you have installed |
| `worktree-crew` | New, open and remove worktree dialogs |
| `picker-crew` | **⌘P**, go to a tab: spaces that need you first, typing filters |

All share one look: `popover` background, a 42px header with an `Esc` keycap, 30px items, and
shortcuts drawn as keycaps.

## Agent states

| State | Looks like | Means |
|---|---|---|
| Working | spinner in the theme's `working` color | the agent is busy |
| Needs you | `blocked` dot, in the Needs you group | it is waiting on your answer |
| Done | `done` dot | it finished while you weren't looking |
| Idle | `dim` dot | nothing going on |

Coral is kept for a live Claude, so it always means "Claude is working right now".

## Install

```sh
./install.sh --all        # the layout and every mod it needs
```

Then pick **crew** in Settings › Layout. Install all of its mods together: the layout names each
one, and a missing mod leaves an empty block.

## Keys

| Key | What it does |
|---|---|
| <kbd>⌘</kbd><kbd>J</kbd> | Next agent waiting on you |
| <kbd>⌘</kbd><kbd>P</kbd> | Go to a tab |
| <kbd>⌘</kbd><kbd>E</kbd> · <kbd>⌘</kbd><kbd>G</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>U</kbd> | Files · Git · Cost |
| <kbd>⌘</kbd><kbd>⇧</kbd><kbd>A</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>S</kbd> | Keyboard to Agents · Spaces |

The panel and sidebar keys live in the `layout:crew` section of `keys.json`, so they only apply
while the Crew layout shows. ⌘J and ⌘P are global.

## Customize

- **Daily budget:** `DAILY_BUDGET` in `cost/main.js`.
- **Colors:** Crew uses theme colors only. Change the theme (or try [Theme Gallery](../theme-gallery/README.md)) and every piece follows.
- **The design kit:** `kit.js` is the same in every mod. Change one copy, then copy it to the others, or the looks drift.

## Requirements

- The Herdr desktop app and `python3`.
- Claude Code and/or Codex for the agent rows, Cost and the quota bar.
- For Claude's quota meters: a Claude Code statusline that writes `/tmp/claude/statusline-usage-cache.json`.
- `git` for the Git panel.
