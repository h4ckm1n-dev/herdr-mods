# Herdr mods

The Crew collection for [Herdr](https://herdr.dev): one look across the sidebar, tab bar, panels,
dialogs and bottom bar, plus a few standalone mods (git panel, theme gallery, keybinds, cost).

## Install

```sh
git clone <this repo> && cd herdr-mods
./install.sh            # pick from a list
./install.sh --all      # everything + the crew layout
./install.sh git theme-gallery help-crew
./install.sh --list
```

The installer copies each mod into `~/.config/herdr-app/mods/` (or `$HERDR_APP_HOME`), merges its
keybinds into `keys.json` and runs `herdr-app check`. It asks before rebinding a key you already use.
Anything it replaces is saved under `~/.config/herdr-app/backup/<time>/`. To update: `git pull`, run it again.

Mods are copied, not symlinked: Herdr only hot-reloads files under its own home.

Mods marked *crew layout* are blocks of `layouts/crew.json`; the installer offers the layout and
brings the mods it needs. Pick **crew** in Settings > Layout afterwards.

## Needs

- Herdr desktop app, `python3`
- `claude-usage` reads the Claude Code statusline cache (`/tmp/claude/statusline-usage-cache.json`)
- `cost` and `agents-crew` read Claude Code transcripts in `~/.claude/projects`

## Develop

Every Crew mod carries a copy of the shared `kit.js` (canonical copy and design notes live in `crew-kit`).
