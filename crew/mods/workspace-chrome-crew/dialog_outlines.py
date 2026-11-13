"""Add a reversible accent outline to dialog render roots; never change their actions."""
import hashlib
import json
from pathlib import Path
import re
import sys

MARK = "// OhMyHerdr dialog outline"
SKIP = {"toast", "menu", "new-menu", "menu-crew", "new-menu-crew", "workspace-chrome-crew"}


def outlined(source):
    if MARK in source:
        source = source.split("\n" + MARK, 1)[0].replace("_omhOpenOverlay(", "openOverlay(")
    match = re.search(r"export default class (\w+) extends View", source)
    if not match:
        raise ValueError("Unsupported mod export; source preserved")
    name = match[1]
    source = re.sub(r"(?<![\w.])openOverlay\(", "_omhOpenOverlay(", source)
    terminal = ""
    if name == "Peek":
        terminal = f'''
const _omhInit = {name}.prototype.init;
{name}.prototype.init = function (...args) {{
  if (_omhInit) _omhInit.apply(this, args);
  const p = _omhModalProps();
  if (!p?.overlay || !p.terminal || p._omhOutlinedTerminal) return;
  const previous = _omhShared("ohmyherdr.peek");
  if (previous) _omhCloseOverlay(previous);
  _omhCloseOverlay(p.overlay);
  const id = _omhOpenOverlay({{ kind: "dialog", width: 0.8, height: 0.8, layout: {{
    type: "column", children: [
      {{ type: "block", size: {{ px: 34 }}, content: {{ mod: "peek", props: {{ terminal: p.terminal, _omhOutlinedTerminal: true }} }} }},
      {{ type: "block", content: {{ terminal: p.terminal }} }}
    ]
  }} }});
  _omhSetShared("ohmyherdr.peek", id);
}};
const _omhPeekClose = {name}.prototype.close;
{name}.prototype.close = function (...args) {{
  const p = _omhModalProps();
  if (p?._omhOutlinedTerminal && _omhShared("ohmyherdr.peek") === p.overlay) _omhSetShared("ohmyherdr.peek", null);
  if (_omhPeekClose) return _omhPeekClose.apply(this, args);
}};
'''
    return source + f'''
{MARK}
import {{ props as _omhModalProps, theme as _omhModalTheme, openOverlay as _omhHostOpenOverlay, closeOverlay as _omhCloseOverlay, shared as _omhShared, setShared as _omhSetShared }} from "herdr";
function _omhOpenOverlay(spec) {{
  if (spec.kind === "dialog" && spec.layout) spec = {{ ...spec, frame: "none", layout: {{ ...spec.layout, border: {{ width: 1, color: "accent" }}, radius: 8, background: spec.layout.background ?? "popover" }} }};
  return _omhHostOpenOverlay(spec);
}}
{terminal}
const _omhRender = {name}.prototype.render;
{name}.prototype.render = function (...args) {{
  const el = _omhRender.apply(this, args), p = _omhModalProps();
  if (!el || !p?.overlay || p._omhOutlinedTerminal || p.menu || p.sortMenu || p.part === "bar" || p.kind === "screen" || ["menu", "settings"].includes(p.role)) return el;
  return el.rounded(8).border_1().border_color(_omhModalTheme().accent);
}};
'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def apply(home):
    backup = home / "backup/dialog-outlines"
    backup.mkdir(parents=True, exist_ok=True)
    state_file = backup / "state.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    changed = []
    for group in ("mods", "frame"):
        for path in sorted((home / group).glob("*/main.js")):
            if path.parent.name in SKIP:
                continue
            if path.is_symlink() or path.parent.is_symlink():
                raise ValueError(f"Symlinked mod preserved: {path}")
            before = path.read_bytes()
            after = outlined(before.decode()).encode()
            if before == after:
                continue
            rel = str(path.relative_to(home))
            original = before
            if MARK.encode() in before:
                original = before.decode().split("\n" + MARK, 1)[0].replace("_omhOpenOverlay(", "openOverlay(").encode()
            saved = backup / digest(original) / "main.js"
            saved.parent.mkdir(parents=True, exist_ok=True)
            if not saved.exists():
                saved.write_bytes(original)
            state[rel] = {"original": str(saved.relative_to(home)), "patched": digest(after)}
            # Persist recovery information before changing the source.
            state_file.write_text(json.dumps(state, indent=2) + "\n")
            stage = path.with_suffix(".outline.tmp")
            stage.write_bytes(after)
            stage.replace(path)
            changed.append(rel)
    return changed


def restore(home):
    state_file = home / "backup/dialog-outlines/state.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    kept = []
    for rel, info in state.items():
        path = home / rel
        if not path.exists() or digest(path.read_bytes()) != info["patched"]:
            kept.append(rel)  # Someone edited it afterwards; preserve their version.
            continue
        stage = path.with_suffix(".outline.tmp")
        stage.write_bytes((home / info["original"]).read_bytes())
        stage.replace(path)
    return kept


if __name__ == "__main__":
    home = Path(sys.argv[1]).expanduser().resolve()
    result = restore(home) if len(sys.argv) > 2 and sys.argv[2] == "restore" else apply(home)
    print(json.dumps(result))
