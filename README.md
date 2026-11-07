<div align="center">

# Crew for Herdr

**See every coding agent you run, in one calm window.**

A layout and mods for [Herdr](https://herdr.dev) that put your Claude Code and Codex agents first.
You see who is working, who needs you, what each one just did and how much of your Claude and Codex quota is
left, without switching tabs.

![Crew: agents sidebar, spaces, terminals, side panels and the quota bar](crew/preview.png)

```sh
git clone https://github.com/h4ckm1n-dev/herdr-mods && cd herdr-mods && ./install.sh
```

Pick what you want from the list. You can try one mod or install the whole look.

</div>

---

## What's inside

<table>
<tr>
<td width="50%" valign="top">

### [Crew](crew/RECIPE.md) · layout

The whole window, redrawn around agents:

- **Agents first.** Working, Needs you, Done and Idle groups. A spinner shows while an agent works. Each agent shows its last action, its context fill, and running sub-agents with progress.
- **⌘J** jumps to the next agent waiting on you, in any space.
- **Spaces** with stable colored avatars and worktrees nested under their repo.
- **A panel tab bar:** Files (⌘E), Git (⌘G) and Cost (⌘⇧U): Claude Code and Codex spend at API prices.
- **A bottom bar** with the machine, the branch, `2 working · 1 needs you`, and your **Claude Code and Codex 5h / 7d quotas** side by side.
- Menus, dialogs and the ⌘P tab picker in one consistent style.

</td>
<td width="50%" valign="top">

![Git panel](git/preview.png)

### [Git](git/RECIPE.md) · mod

VS Code's Source Control view and a commit graph in one panel. Stage files or single hunks, commit
with ⌘⏎, pull and push, switch branches, stash. Every destructive action asks first. Open a folder
that holds several repos and it lists them all with their sync state.

</td>
</tr>
<tr>
<td width="50%" valign="top">

![Theme Gallery](theme-gallery/preview.png)

### [Theme Gallery](theme-gallery/RECIPE.md) · mod

**⌘⇧T**: Herdr's themes plus the whole Ghostty collection (800+). Arrow keys recolor the whole app
live, Enter keeps the theme, Esc puts your old one back. A preview card shows light themes even while
you're in dark mode.

</td>
<td width="50%" valign="top">

![Keybinds](help-crew/preview.png)

### [Keybinds](help-crew/RECIPE.md) · mod

**⌘/**: every Herdr shortcut on one 16:9 sheet, drawn as real keycaps (`⌥` `⌘` `[`) and written in
plain words ("Delete word", not `\u0017`). Type to filter.

</td>
</tr>
</table>

## Install

```sh
./install.sh                          # choose from a numbered list
./install.sh git theme-gallery        # just these
./install.sh --all                    # everything, with the Crew layout
./install.sh --list                   # what's available
```

**What the installer does:**
- Copies each mod into `~/.config/herdr-app/mods/` (or `$HERDR_APP_HOME`) and checks each one with `herdr-app check`.
- Merges the keybinds. It **asks before rebinding a key you already use**, and keeps your key if you say no or don't answer.
- **Backs up whatever it replaces** to `~/.config/herdr-app/backup/<time>/`.
- When a mod belongs to the Crew layout, offers that layout and brings the mods it needs. Pick **crew** in Settings › Layout.

**Update:** `git pull && ./install.sh`. Mods that haven't changed are left as they are.

Prefer the Herdr way? Ask the agent inside Herdr to add a folder, for example
`add https://github.com/h4ckm1n-dev/herdr-mods/tree/main/git`.

<details>
<summary><b>Why copy, not symlink?</b></summary>

Herdr reloads mods live, but only for files inside its own home folder: its file watcher ignores
paths outside it. A symlinked mod loads, then never updates while you edit it.

</details>

## Keys

| Key | What it does | From |
|---|---|---|
| <kbd>⌘</kbd><kbd>J</kbd> | Next agent waiting on you | Crew |
| <kbd>⌘</kbd><kbd>P</kbd> | Go to a tab | Crew |
| <kbd>⌘</kbd><kbd>E</kbd> · <kbd>⌘</kbd><kbd>G</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>U</kbd> | Files · Git · Cost panel | Crew |
| <kbd>⌘</kbd><kbd>⇧</kbd><kbd>A</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>S</kbd> | Keyboard to Agents · Spaces | Crew |
| <kbd>⌘</kbd><kbd>⇧</kbd><kbd>T</kbd> | Theme Gallery | Theme Gallery |
| <kbd>⌘</kbd><kbd>/</kbd> | Every keybind | Keybinds |

## Safe by design

- **Local only.** Nothing here calls a server. Agent rows and spend come from your own Claude Code and Codex transcripts on disk (`~/.claude/projects`). The quota bar reads the cache your Claude Code statusline already writes and the rate limits Codex logs in `~/.codex/sessions`.
- **No surprise git.** The Git panel won't automatically read a repo whose own config can launch a program: filter drivers, ssh, credential or askpass helpers, upload-pack and similar settings. Such a repo shows as *not read* until you open it. Fetch never prompts for credentials and never runs auto-gc.
- **Asks first.** Discard, drop, abort and reset each ask for confirmation, and the installer asks before changing your keys.

## Needs

- The Herdr desktop app and `python3`. The Git mod also needs `git`.
- For the agent rows and the quota bar: Claude Code and/or Codex. Claude's quota meters need a Claude Code statusline that caches usage to `/tmp/claude/statusline-usage-cache.json`; Codex's come from its own session logs.

## Rebuild it, remix it

Every folder has a `RECIPE.md`: a precise brief another agent can build the mod from in an empty
folder. It covers sizes, colors, behavior, the gotchas, and the checks that prove a build works. Fork
a recipe, change one line, and ask your agent to build your own version.

The Crew mods share one small design kit: theme colors only, a 36px text indent, spinners for live
work, keycaps for shortcuts, no gradients. So they work in any Herdr theme, light or dark.

## Contributing

Issues and PRs welcome. Keep a change to one mod, run `herdr-app check` on it, and update its
`RECIPE.md` when what you see or how it behaves changes.

---

<div align="center">

If Crew makes your agents easier to follow, a ⭐ helps other Herdr users find it.

MIT · made by [h4ckm1n-dev](https://github.com/h4ckm1n-dev) · not affiliated with Herdr

</div>
