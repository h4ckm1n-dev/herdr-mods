# Build Herdr with window opacity and blur

[![Maintained by Kai Finds](https://img.shields.io/badge/maintained%20by-Kai%20Finds-00E5FF?style=flat-square&labelColor=0B0F14)](https://github.com/Kai-Finds)

The patch is based on cunderw's [herdr-app #191](https://github.com/herdrdev/herdr-app/pull/191)
(`window_opacity` / `window_blur`), Apache-2.0 like Herdr; it changes Herdr's files.

## Worth it, or skip it?

**✅ Worth it if**
- you want a translucent, blurred Herdr window and don't mind building it yourself

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
`a547b16ccb5e8811b2dd8b3b901d31df8f05e55a` (Herdr 0.1.15), applies the bundled
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

In the patched app, open **Settings > Appearance > Window** for Opacity and Blur.
Opacity starts at 100%; blur takes effect below 100%.

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

`window-opacity.patch` is exactly the committed diff from official base
`a547b16ccb5e8811b2dd8b3b901d31df8f05e55a` to
`a2d61819f9659175a354b3f14df1aaf85d414b78` in the supplied
`herdr-app-pr191` checkout. It includes the native renderer changes, settings,
Settings controls, guide updates and regression tests. Uncommitted edits in
that checkout are excluded. Herdr and this patch use Apache-2.0; see [LICENSE](LICENSE).

Builder smoke tests (mocked compilation and signing):

```sh
python3 -m unittest discover -s native/window-opacity/tests
```

---

<sub><b>Kai Finds</b> · Do more with AI · <a href="https://github.com/Kai-Finds">github.com/Kai-Finds</a> · <a href="https://kaifinds.sabaidev.la">kaifinds.sabaidev.la</a></sub>
