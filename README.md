# Herdr mods

Mods and a layout for [Herdr](https://herdr.dev). Each folder is one entry on herdr.dev, with its own
`RECIPE.md` and `preview.png`:

| Folder | What |
|---|---|
| [`crew/`](crew/RECIPE.md) | Layout: agents-first sidebar, panel tab bar, status + Claude quota bar, and the Crew dialogs and menus |
| [`git/`](git/RECIPE.md) | Mod: git panel (graph, changes, branches, stash, commit, pull/push) |
| [`theme-gallery/`](theme-gallery/RECIPE.md) | Mod: every Ghostty theme with live preview |
| [`help-crew/`](help-crew/RECIPE.md) | Mod: keybinds dialog with keycaps, on cmd-/ |

## Install

```sh
git clone https://github.com/h4ckm1n-dev/herdr-mods && cd herdr-mods
./install.sh            # pick from a list
./install.sh --all      # everything + the crew layout
./install.sh git theme-gallery help-crew
./install.sh --list
```

The installer copies each mod into `~/.config/herdr-app/mods/` (or `$HERDR_APP_HOME`), merges its
keybinds into `keys.json` and runs `herdr-app check`. It asks before rebinding a key you already use.
Anything it replaces is saved under `~/.config/herdr-app/backup/<time>/`. To update: `git pull`, run it again.

Mods are copied, not symlinked: Herdr only hot-reloads files under its own home.

Mods marked *crew layout* are blocks of `crew/layouts/crew.json`; the installer offers the layout and
brings the mods it needs. Pick **crew** in Settings > Layout afterwards.

## Needs

- Herdr desktop app, `python3`
- `claude-usage` reads the Claude Code statusline cache (`/tmp/claude/statusline-usage-cache.json`)
- `cost` and `agents-crew` read Claude Code transcripts in `~/.claude/projects`

## Develop

Every Crew mod carries a copy of the shared `kit.js` (canonical copy and design notes live in `crew-kit`).
