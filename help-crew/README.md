# Keybinds · mod

Every Herdr shortcut on one 16:9 sheet. Keys are drawn as real keycaps (`⌥` `⌘` `[`), actions read
as plain words ("Select space 1", "Delete word", not `\u0017`), and typing filters the list.

[← The whole system](../README.md) · [Recipe](RECIPE.md)

![Keybinds](preview.png)

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
