"""Ghostty theme collection -> JSON for the theme-gallery mod.

Same search order as cmux/AiMux GhosttyThemeDirectories: the first directory
holding a name (case-insensitive) wins. Prints [{name, dark, background,
foreground, selection, cursor, ansi[16], src}] on stdout.
"""
import json, os, sys

H = os.path.expanduser
DIRS = [os.path.join(os.environ["GHOSTTY_RESOURCES_DIR"], "themes")] if os.environ.get("GHOSTTY_RESOURCES_DIR") else []
DIRS += [
    H("~/.config/ghostty/themes"),  # user themes first: they win over bundled ones of the same name
    H("~/Library/Application Support/com.mitchellh.ghostty/themes"),
    H("~/Library/Application Support/la.sabaidev.aimux/themes"),
    H("~/Library/Application Support/com.cmuxterm.app/themes"),
    "/Applications/AiMux.app/Contents/Resources/ghostty/themes",
    "/Applications/cmux.app/Contents/Resources/ghostty/themes",
    "/Applications/Ghostty.app/Contents/Resources/ghostty/themes",
]
# Linux: Ghostty's packaged themes (e.g. /usr/share/ghostty/themes)
DIRS += [os.path.join(d, "ghostty/themes") for d in (os.environ.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share").split(":") if d]
# xterm defaults for any palette slot a theme leaves out
XTERM = ["#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
         "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff"]


def hexc(v):
    v = v.strip().strip('"').lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6 or any(c not in "0123456789abcdefABCDEF" for c in v):
        return None
    return "#" + v.lower()


def lum(c):
    r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def mix(a, b, t):
    pa, pb = ([int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in (a, b))
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(pa, pb))


def parse(path):
    kv, pal = {}, {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = (s.strip() for s in line.split("=", 1))
            if k == "palette" and "=" in v:
                i, c = v.split("=", 1)
                if i.strip().isdigit() and int(i) < 16 and hexc(c):
                    pal[int(i)] = hexc(c)
            elif hexc(v):
                kv[k] = hexc(v)
    bg, fg = kv.get("background"), kv.get("foreground")
    if not bg or not fg:
        return None
    return {
        "background": bg,
        "foreground": fg,
        "selection": kv.get("selection-background") or mix(bg, fg, 0.25),
        "cursor": kv.get("cursor-color") or fg,
        "ansi": [pal.get(i, XTERM[i]) for i in range(16)],
        "dark": lum(bg) < 0.5,
    }


def catalog():
    seen, out = set(), []
    for d in DIRS:
        try:
            names = sorted(os.listdir(d))
        except OSError:
            continue
        for n in names:
            p = os.path.join(d, n)
            if n.startswith(".") or n.casefold() in seen or not os.path.isfile(p):
                continue
            t = parse(p)
            if t:
                seen.add(n.casefold())
                out.append({"name": n, "src": p, **t})
    return sorted(out, key=lambda t: t["name"].casefold())


if __name__ == "__main__":
    json.dump(catalog(), sys.stdout, separators=(",", ":"))
