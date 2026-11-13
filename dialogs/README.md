# Centered Herdr dialogs, without rebuilding

[![Maintained by Kai Finds](https://img.shields.io/badge/maintained%20by-Kai%20Finds-00E5FF?style=flat-square&labelColor=0B0F14)](https://github.com/Kai-Finds)

Personal copies of the original Herdr 0.1.13 Settings, command palette,
Add a machine and text prompt. The UI and actions are retained; each opens
as a centered 1040×585 dialog (16:9) with a theme-accent outline.
Settings and the palette scroll within the fixed height.

Install `settings-crew palette-crew machine-add-crew prompt-crew` by name with the
repository installer: `--all` leaves them out, since they take over Herdr's own
screens and keys. Once installed and on, Crew's sidebar footer opens these copies
(Herdr's own otherwise);
⌘, opens Settings and ⌘⇧P opens the palette. The installer asks before
replacing conflicting keybindings. The palette routes Settings/Help to the
personal dialogs and preserves requested Settings sections.

The existing OhMyHerdr picker, Git action dialogs and worktree dialogs use
the same geometry; the vendored kit gives its dialogs the accent outline.
The original context menus retain their pointer placement.

## Worth it, or skip it?

**✅ Worth it if**
- you want Herdr's Settings, palette, Add machine and prompt centered, without rebuilding Herdr

**❌ Skip it if**
- you run a Herdr newer than 0.1.13 and want its latest screens: these are copies of 0.1.13
- you work in small windows or at high zoom: 1040×585 can clip

## Coverage boundary

The binary is unchanged. Crew applies a small render decorator to installed mod
and frame entry points: when rendered in an overlay, the root receives an accent
border. This covers direct `app.settings`/`app.palette`, native name/confirmation
prompts, Welcome, What's New, Feedback and personal dialog mods too. Pointer menus,
sort popups, title bars and frameless full-screen screens are excluded.
Original files are saved under `backup/dialog-outlines` before modification.
Crew restores unedited originals when it closes and reapplies the decorator on
startup, after Herdr restores its shipped files. Subsequent user edits are never
restored over. An abrupt app termination can leave decorated shipped files for
Herdr to archive as personal copies on its next start.

Direct native commands still use the engine's original geometry. Terminal/layout
dialogs receive an accent border on their layout root; the native terminal peek
reopens the same terminal in that outlined layout without starting another session.
The 1040×585 size follows the existing OhMyHerdr convention; very small windows
or high zoom can clip it. Global proportional fitting needs native support.

Sources are copied from the locally installed Herdr 0.1.13 and retain their
Apache-2.0 license; see LICENSE. Test palette routing with:

```sh
node dialogs/tests/palette.test.mjs
```

---

<sub><b>Kai Finds</b> · Do more with AI · <a href="https://github.com/Kai-Finds">github.com/Kai-Finds</a> · <a href="https://kaifinds.sabaidev.la">kaifinds.sabaidev.la</a></sub>
