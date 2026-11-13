<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/mod-fuzzy-files.png" width="100%" alt="Kai Finds · OhMyHerdr module: Find files">

# Find files

[![Maintained by Kai Finds](https://img.shields.io/badge/maintained%20by-Kai%20Finds-00E5FF?style=flat-square&labelColor=0B0F14)](https://github.com/Kai-Finds)

**⌘⇧F** opens a centered fuzzy file finder in the active tab's working folder.
Type a partial filename or path; matches need not be consecutive.
Use ↑/↓, Ctrl-N/Ctrl-P or Page Up/Down, then Enter (or click) to open a file
in a **new Neovim tab in the original space**; PNG and JPEG files open in an
image tab instead (kitty graphics; JPEG needs macOS `sips`), `:q` closes it.
Escape closes the finder.

<a id="worth-it-or-skip-it"></a>
<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/worth-it.png" width="100%" alt="Worth it, or skip it?">

**✅ Worth it if**
- you want fuzzy filename search with no fzf or ripgrep to install
- you open files in Neovim

**❌ Skip it if**
- you don't use Neovim: Enter opens files there
- your tree holds more than 50,000 files: the search stops at that cap

Rows show FileTree's file-type icons when `files-crew` is installed (its icon
set is reused, not copied), a plain file glyph otherwise.

Install: `./install.sh fuzzy-files`. Requires Python 3 and Neovim on the
target machine; Git is used when available. No fzf or ripgrep dependency.

The focused pane's folder is preferred, then another terminal in the same tab,
then the space's folder. The folder and space are captured when opening the
finder, so changing focus cannot send a file to another project or machine.
Remote spaces run the scan and Neovim remotely using the same context.

Git folders include tracked and untracked files, respect Git ignore rules and
exclude deleted files. Plain folders include hidden files but skip `.git`,
`.hg`, `.svn`, `node_modules`, `.venv`, `venv` and `__pycache__` directories.
Directory symlinks are not followed. At most 50,000 files are searchable;
the footer states when that limit is reached. Reopen to refresh the file list.
Neovim opens in its own tab; quitting it (`:q`) closes the tab.

Checks:

```sh
python3 -m unittest discover -s fuzzy-files/mods/fuzzy-files/tests
node fuzzy-files/mods/fuzzy-files/tests/search.test.mjs
herdr-app check fuzzy-files/mods/fuzzy-files
```

---

<sub><b>Kai Finds</b> · Do more with AI · <a href="https://github.com/Kai-Finds">github.com/Kai-Finds</a> · <a href="https://kaifinds.sabaidev.la">kaifinds.sabaidev.la</a></sub>
