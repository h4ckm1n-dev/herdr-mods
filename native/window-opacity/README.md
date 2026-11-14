<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/mod-window-opacity.png" width="100%" alt="Kai Finds · OhMyHerdr module: Window opacity and blur">

# Build Herdr with window opacity and blur

[![Maintained by Kai Finds](https://img.shields.io/badge/maintained%20by-Kai%20Finds-00E5FF?style=flat-square&labelColor=0B0F14)](https://github.com/Kai-Finds)

The patch is [herdr-app #1007](https://github.com/herdrdev/herdr-app/pull/1007),
which builds on cunderw's [#191](https://github.com/herdrdev/herdr-app/pull/191).
It adds a `window_opacity` key to the layout. It is Apache-2.0 like Herdr and
changes Herdr's files.

<a id="worth-it-or-skip-it"></a>
<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/worth-it.png" width="100%" alt="Worth it, or skip it?">

**✅ Worth it if**
- you want a see-through Herdr window (blur optional) and don't mind building it yourself

**❌ Skip it if**
- you want the official signed, notarized Herdr that updates itself
- you don't have Rust, Zig 0.16.0, the Xcode Command Line Tools and some spare disk space and time

Run this on your own Mac from the OhMyHerdr checkout:

```sh
./native/window-opacity/build.sh
```

Requires Git, Python 3, Xcode Command Line Tools (`xcode-select --install`),
Rust via rustup (`rustup toolchain install 1.95.0 --profile minimal`), and
Zig **0.16.0** on PATH. Install the tools yourself; the script does not install
packages or ask for administrator access. The first build downloads source,
submodules and Cargo dependencies and needs substantial disk space and time.

The script fetches the official `https://github.com/herdrdev/herdr-app.git` at
`b67715e8985e6097f83f8120fc9b9e52e6596f50` (Herdr master after 0.1.15), applies the bundled
patch, builds with the locked dependencies, and packages an ad hoc signed app:

```text
.build/herdr-opacity/Herdr.app
```

After a successful build, it runs the existing `install.sh --all` to install
OhMyHerdr's mods, the Crew layout and their keybindings into
`~/.config/herdr-app` (or `HERDR_APP_HOME`), creating that folder if needed.
The installer backs up replaced files, asks before replacing conflicting
keybindings, and offers the existing Claude quota integration. It does not
automatically answer yes to those prompts. Pick **OhMyHerdr** in **Settings > Layout**.
If building or signing fails, mod installation does not run. If mod installation
fails, the command reports failure and the built app remains available to retry.

It leaves installed app bundles and running sessions alone.
Quit Herdr yourself, back up your installed `Herdr.app`, then replace that bundle
with the generated app in Finder. Use the same location as your existing app
so your CLI symlink continues to work. This is a local custom build, without
the official developer signature or notarization. To undo it, quit Herdr and
restore your backed-up app.

In the patched app, the layout sets the look. The OhMyHerdr layout ships with
`"window_opacity": 0.65` at its root, so the desktop shows through the whole
window and dialogs take an accent outline. Change that value to adjust it; 1
is an ordinary opaque window. Add `"window_blur": true` next to it to frost what
shows through (that key comes from Herdr itself, #702). An official Herdr
ignores `window_opacity`, so the layout stays opaque there.

Ordinary source builds do not enable Herdr's official app updater. Do not set
`HERDR_RELEASES_URL` when launching this app: upstream uses that variable to
enable its updater even in source builds. An external package manager or a
manual official reinstall can still replace your custom app. This builder is
pinned, so rerunning it does **not** upgrade to the latest Herdr release.

Build sources and Cargo artifacts remain under `.build/herdr-opacity/source`
for incremental rebuilds. Changed source is rejected rather than reset.
Previous generated bundles are kept under `previous.*`. Move the build folder
aside to start fresh; deleting it later removes only build output.

## Patch provenance

`window-opacity.patch` is exactly the diff from official base
`b67715e8985e6097f83f8120fc9b9e52e6596f50` to
`149796f48e005cdd21e7b3d07f74c5c353998a9a`, the head of herdr-app #1007. It
includes the native renderer changes, the layout key, guide updates and
regression tests. Herdr and this patch use Apache-2.0; see [LICENSE](LICENSE).

Builder smoke tests (mocked compilation and signing):

```sh
python3 -m unittest discover -s native/window-opacity/tests
```

---

<sub><b>Kai Finds</b> · Do more with AI · <a href="https://github.com/Kai-Finds">github.com/Kai-Finds</a> · <a href="https://kaifinds.sabaidev.la">kaifinds.sabaidev.la</a></sub>
