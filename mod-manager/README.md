# OhMyHerdr Mods

A centered native dialog to enable or disable installed OhMyHerdr mods.

Install with `./install.sh mod-manager`, then open with **⌘⇧M** or
`herdr-app do mod.open '{"name":"mod-manager"}'`.
Search, click a row to switch, or use ↑/↓ and Enter. Escape closes the dialog.
The manager itself stays enabled so you can always restore other mods.

Disabling moves the original folder to `<Herdr home>/disabled-mods/<name>`.
Crew replacements use a copy of the installed native Herdr equivalent;
other mods show a disabled placeholder that opens this manager.
This stops the original mod from loading without changing layouts, shortcuts,
settings or terminal sessions. Files another program runs from the folder stay
in place (catalog `keep`): with claude-usage off, Claude Code's statusline still
works. Enabling restores the original folder.
The list covers the installer catalog plus Filetree and CI Dash; uninstalled
mods are shown but cannot be switched. This dialog does not install mods.

Do not reinstall/update a disabled mod before enabling it. If a replacement
has been edited or reinstalled, the manager refuses to overwrite it and keeps
the original in `disabled-mods`. Resolve the two copies manually first.
If a swap was interrupted with the target missing, enable it to recover.
Mods already open may keep their current view until Herdr reloads it.

Checks: `python3 -m unittest discover -s mod-manager/mods/mod-manager/tests`
and `herdr-app check mod-manager/mods/mod-manager`.
