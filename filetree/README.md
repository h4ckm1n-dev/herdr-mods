<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/mod-filetree.png" width="100%" alt="Kai Finds · OhMyHerdr module: filetree">

# filetree

[![Packaged by Kai Finds](https://img.shields.io/badge/packaged%20by-Kai%20Finds-00E5FF?style=flat-square&labelColor=0B0F14)](https://github.com/Kai-Finds)

By [cybertron288](https://github.com/cybertron288/herdr-mods) (MIT, `mods/filetree/LICENSE`); a lightly modified copy.

A file tree for the side panel of any Herdr layout. It follows the focused terminal's
folder and shows git state and what Claude Code and Codex are reading and writing.

<a id="worth-it-or-skip-it"></a>
<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/worth-it.png" width="100%" alt="Worth it, or skip it?">

**✅ Worth it if**
- you want to see which files Claude Code and Codex read and write, live in the tree
- you want a file tree in any layout, not only Crew

**❌ Skip it if**
- you'd rather not add agent hooks: the activity view needs them and Bun (the rest works without)
- Crew's Files panel already covers what you need

## Install

Tell your agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/cybertron288/filetree
```

Or by hand, from a clone of this repo:

```sh
cp -R filetree/mods/* ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/filetree
```

Install [file-icons](https://github.com/cybertron288/herdr-mods/tree/main/file-icons) first:
the tree draws its file and folder icons from `mods/file-icons/icons/`.
This local copy also accepts Crew's Files keyboard-focus requests. The optional Claude hook is not enabled by installing the mod.

Put it in a block of your layout:

```json
{ "id": "files", "type": "block", "content": { "mod": "filetree" } }
```

Or open it beside a terminal: `herdr-app do pane.split --direction right --mod filetree`.

## What you see

- **Header:** the folder name and two tabs: **Tree** and **Recent**. Keys `1` and `2`
  switch tabs.
- **Summary:** the branch, `↑ahead ↓behind`, total `+N −N`, and a bar of modified (yellow),
  new (green) and deleted (red) files with their counts. Outside a repo it says so.
- **Filter box** with the tab's tools beside it:
  - Tree: `↑` up a folder, `⌂` back to the focused pane's folder, `◉` dotfiles, `Σ` dates or
    sizes, `⊟` collapse all.
  - Recent: `⊘` clear the list.
- **Tree:** git colors on every row, `+N −N` on changed files, `?:N M:N D:N` on folders,
  ignored files dimmed. Search covers folders you haven't opened (200 matches).
- **Recent:** files agents read, wrote or committed, newest first, with how long ago.
- **Footer:** the selected path, and the agent's last git action ("✓ committed 3f9a2c1").

## Using it

- Click a file to open it in the project's Neovim tab; Enter previews it in the panel. Click a folder to expand it. Right-click opens a menu: preview, open in the
  default app, reveal in Finder, copy the path, send `@path` to the tab's agent.
- Keys: `j/k` or the arrows, PgUp/PgDn, Home/End, `l/h` open or close, Space toggles,
  `p` preview, `y`/`Y` copy the relative or absolute path, `a` send to the agent, `.`
  dotfiles, `/` filter, Esc clears.
- In Recent, `→` or `l` shows the file in Tree.
- Preview: Markdown rendered, code highlighted. `o` or `↗` opens in the default app.

## Agent activity hooks

Herdr mods can't see Claude Code's tool calls, so `bridge.ts` accepts Claude Code hooks and Codex hooks (`--codex`) and
writes them to `~/.local/state/herdr-filetree/activity.jsonl`. With it, reads shimmer purple,
writes orange and commits green, and the Recent tab fills in. Without it, everything else
works.

Add it to `~/.claude/settings.json` (needs [bun](https://bun.sh)):

```json
"hooks": {
  "PreToolUse":         [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\"", "timeout": 5 }] }],
  "PostToolUse":        [{ "matcher": "Read|Grep|Glob|Write|Edit|MultiEdit|NotebookEdit|Bash", "hooks": [{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\"", "timeout": 5 }] }],
  "PostToolUseFailure": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\"", "timeout": 5 }] }],
  "UserPromptSubmit":   [{ "hooks": [{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\"", "timeout": 5 }] }]
}
```

Merge these into any hooks you already have. Restart Claude Code sessions afterwards.

For Codex, merge these into `~/.codex/hooks.json` (requires Bun):

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "^Bash$", "hooks": [{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\" --codex", "timeout": 5 }] }],
    "PostToolUse": [{ "matcher": "^(Bash|apply_patch)$", "hooks": [{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\" --codex", "timeout": 5 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "bun \"$HOME/.config/herdr-app/mods/filetree/bridge.ts\" --codex", "timeout": 5 }] }]
  }
}
```

Review and trust the exact new definitions in Codex's `/hooks`, then start a new session. Existing hooks must be preserved. The adapter records successful patch paths (including moves), shell reads and git actions; RTK-wrapped shell commands are supported. It records file paths and activity metadata, never file contents or prompts. It does not observe every MCP file operation.

## Settings: `config.json`

| Key | Values | Default |
|---|---|---|
| `activity` | `reads and writes`, `writes`, `reads`, `none` | `reads and writes` |
| `follow` | `true`: open folders and scroll to agent activity | `true` |
| `column` | `date` or `size` at start | `date` |

## Other mods

- Any mod can switch the view with the shared key `filetree.view` (`{ view, n }`, where
  `view` is `tree` or `recent`).
- Any mod can ask for a preview with the shared key `filetree.preview`
  (`{ root, rel, n }`).

---

<sub><b>Kai Finds</b> · Do more with AI · <a href="https://github.com/Kai-Finds">github.com/Kai-Finds</a> · <a href="https://kaifinds.sabaidev.la">kaifinds.sabaidev.la</a></sub>
