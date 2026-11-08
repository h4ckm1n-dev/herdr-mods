<div align="center">

<img src="hero.png" width="100%" alt="Every Herdr shortcut. One sheet. The Keybinds dialog: a filter field and every shortcut in two columns, drawn as keycaps.">

<br>

**Every Herdr shortcut on one sheet, drawn as real keycaps.**<br>
Actions read as plain words, keys as keycaps, and typing filters by either. It reads your keys.json every time, so a key you just rebound shows at once.

```sh
./install.sh help-crew
```

<sub><a href="../README.md">All modules</a> · <a href="RECIPE.md">Recipe, to rebuild it with your agent</a></sub>

</div>

## What it does

- **Two balanced columns**, grouped as Spaces, Tabs, Panes, Agents, Terminal, Layout, Mods and App.
- **Each row:** the action in words, the section when it isn't global (`terminal`, `layout:crew`),
  then the keys as keycaps. A chord's second stroke follows the word `then`.
- **Typing filters** on the action, the raw key (`cmd-alt-[`) or the drawn key (`⌥⌘[`).
- **Always current.** It reads your `keys.json` every time it draws, so a key you just rebound shows at once.
- **Esc** or **⌘/** again closes it.

## Install

```sh
./install.sh help-crew
```

It binds **⌘/** and **⌘⇧/** to the sheet, replacing Herdr's own help in any layout.

## Requirements

The Herdr desktop app.
