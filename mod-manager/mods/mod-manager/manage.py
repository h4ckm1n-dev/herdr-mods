"""Disable personal OhMyHerdr mods without deleting their code or changing layouts."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

MARK = ".ohmyherdr-disabled.json"
IGNORED = {MARK, "gpui-kit.d.ts", "herdr.d.ts", "jsconfig.json", ".DS_Store", "__pycache__"}


def digest(folder):
    result = {}
    for p in sorted(folder.rglob("*")):
        if any(part in IGNORED for part in p.relative_to(folder).parts):
            continue
        if p.is_symlink():
            raise ValueError(f"Symlink refused: {p}")
        if p.is_file():
            result[str(p.relative_to(folder))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return result


def listing(home, catalog):
    return [{**entry, "on": not (home / "disabled-mods" / entry["id"]).exists(),
             "installed": (home / "mods" / entry["id"] / "main.js").is_file()
                          or (home / "disabled-mods" / entry["id"]).exists()}
            for entry in catalog]


def toggle(home, catalog, name, enabled):
    entry = next((e for e in catalog if e["id"] == name), None)
    if not entry or name == "mod-manager":
        raise ValueError("Unknown or protected mod")
    target, saved = home / "mods" / name, home / "disabled-mods" / name
    if target.is_symlink() or saved.is_symlink():
        raise ValueError("Symlinked mods cannot be switched")
    if enabled:
        if not saved.is_dir():
            return
        if target.exists():
            marker = json.loads((target / MARK).read_text())
            if marker != digest(target):
                raise ValueError("Replacement was edited or reinstalled; original kept in disabled-mods")
        # Keep both versions until the original is back in place.
        with tempfile.TemporaryDirectory(prefix=".mod-manager-", dir=home / "mods") as temp:
            previous = Path(temp) / "previous"
            if target.exists():
                target.rename(previous)
            try:
                saved.rename(target)
            except BaseException:
                if previous.exists():
                    previous.rename(target)
                raise
        return
    if saved.exists():
        if not target.exists() or (target / MARK).is_file():
            return
        raise ValueError("Original already saved; resolve the reinstalled mod before switching")
    if not (target / "main.js").is_file():
        raise ValueError("Mod is not installed")
    digest(target)  # Refuse links before moving any user files.
    fallback = home / "mods" / entry.get("fallback", "")
    with tempfile.TemporaryDirectory(prefix=".mod-manager-", dir=home / "mods") as temp:
        stage = Path(temp) / "replacement"
        if entry.get("fallback") and (fallback / "main.js").is_file():
            digest(fallback)
            shutil.copytree(fallback, stage)
        else:
            stage.mkdir()
            (stage / "mod.json").write_text((target / "mod.json").read_text() if (target / "mod.json").exists() else "{}")
            (stage / "main.js").write_text(
                'import {View, div} from "gpui-kit";\n'
                'import {theme, run} from "herdr";\n'
                'export default class Disabled extends View {\n'
                'render() { const t = theme(); return div().id("disabled-mod").size_full().p(12)'
                '.bg(t.chrome).text_color(t.muted).text_size(12).cursor_pointer()'
                '.accessibility_label("Mod disabled. Open OhMyHerdr Mods")'
                '.on_click(() => run("mod.open", {name:"mod-manager"}))'
                '.child("Mod disabled · OhMyHerdr Mods"); } }\n')
        # "keep": files something outside Herdr runs from the mod's folder (Claude Code's statusline
        # wrapper), so they stay in place while the mod is off
        for f in entry.get("keep", []):
            if (target / f).is_file():
                shutil.copy2(target / f, stage / f)
        (stage / MARK).write_text(json.dumps(digest(stage)))
        target.rename(saved)
        try:
            stage.rename(target)
        except BaseException:
            saved.rename(target)
            raise


def main():
    home = Path(sys.argv[1]).resolve()
    catalog = json.loads(Path(__file__).with_name("catalog.json").read_text())
    store = home / "disabled-mods"
    store.mkdir(exist_ok=True)
    with (store / ".lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if sys.argv[2] == "set" and len(sys.argv) == 5 and sys.argv[4] in ("on", "off"):
            toggle(home, catalog, sys.argv[3], sys.argv[4] == "on")
        elif sys.argv[2:] != ["list"]:
            raise ValueError("Expected list or set <mod> on|off")
        print(json.dumps(listing(home, catalog)))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
