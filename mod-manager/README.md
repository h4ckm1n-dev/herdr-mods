<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/mod-mod-manager.png" width="100%" alt="Kai Finds · OhMyHerdr module: OhMyHerdr Mods">

# OhMyHerdr Mods

[![Maintained by Kai Finds](https://img.shields.io/badge/maintained%20by-Kai%20Finds-00E5FF?style=flat-square&labelColor=0B0F14)](https://github.com/Kai-Finds)

A centered native dialog to enable or disable installed OhMyHerdr mods.

<a id="worth-it-or-skip-it"></a>
<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/worth-it.png" width="100%" alt="Worth it, or skip it?">

**✅ Worth it if**
- you want to switch mods off and on live, without uninstalling them

**❌ Skip it if**
- you want to install mods from a dialog: this one doesn't install
- you tend to reinstall a mod while it's off: the manager then refuses to swap it back until you sort out the two copies

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

The installer skips a disabled mod and says so: enable it, then update. If a replacement
has been edited or reinstalled, the manager refuses to overwrite it and keeps
the original in `disabled-mods`. Resolve the two copies manually first.
If a swap was interrupted with the target missing, enable it to recover.
Mods already open may keep their current view until Herdr reloads it.

Checks: `python3 -m unittest discover -s mod-manager/mods/mod-manager/tests`
and `herdr-app check mod-manager/mods/mod-manager`.

---

<sub><b>Kai Finds</b> · Do more with AI · <a href="https://github.com/Kai-Finds">github.com/Kai-Finds</a> · <a href="https://kaifinds.sabaidev.la">kaifinds.sabaidev.la</a></sub>
