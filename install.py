# The installer proper; run it through install.sh.
import json, os, shutil, subprocess, sys, time, filecmp

APP, args = sys.argv[1], sys.argv[2:]
YES = "-y" in args
args = [a for a in args if a != "-y"]
CAT = [l.rstrip("\n").split("\t") for l in open("mods.tsv") if l.strip() and not l.startswith("#")]
NAMES = [c[0] for c in CAT]
LAYOUT = json.load(open("layouts/crew.json"))
STAMP = time.strftime("%Y%m%d-%H%M%S")
BACKUP = os.path.join(APP, "backup", STAMP)

def ask(q, default=True):
    if YES: return True
    if not sys.stdin.isatty(): return default
    a = input(f"{q} [{'Y/n' if default else 'y/N'}] ").strip().lower()
    return default if not a else a.startswith("y")

def layout_mods(n):
    out = set()
    if isinstance(n, dict):
        m = n.get("content", {}).get("mod") if isinstance(n.get("content"), dict) else None
        if m: out.add(m)
        if n.get("terminal_menu"): out.add(n["terminal_menu"])
        for c in n.get("children", []): out |= layout_mods(c)
    return out

def backup(path):
    if not os.path.lexists(path): return
    dst = os.path.join(BACKUP, os.path.relpath(path, APP))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(path, dst) if os.path.isdir(path) and not os.path.islink(path) else shutil.copy2(path, dst, follow_symlinks=False)

def same_tree(a, b):
    if not os.path.isdir(b) or os.path.islink(b): return False
    c = filecmp.dircmp(a, b, ignore=["__pycache__", ".DS_Store", "gpui-kit.d.ts"])
    def ok(c): return not (c.left_only or c.diff_files or c.funny_files) and all(ok(s) for s in c.subdirs.values())
    return ok(c)

# ---- what to install --------------------------------------------------------------
if "--list" in args:
    for name, needs, desc in CAT: print(f"  {name:<22} {desc}{'  (crew layout)' if needs == 'layout' else ''}")
    sys.exit(0)

if "--all" in args:
    chosen, want_layout = list(NAMES), True
elif args:
    bad = [a for a in args if a not in NAMES]
    if bad: sys.exit(f"Unknown mod: {', '.join(bad)} (see --list)")
    chosen, want_layout = args, None
else:
    print(f"Herdr mods -> {APP}\n")
    for i, (name, needs, desc) in enumerate(CAT, 1):
        print(f"  {i:>2}  {name:<22} {desc}{'  (crew layout)' if needs == 'layout' else ''}")
    print("\nNumbers or names separated by spaces, 'all', or Enter for all.")
    raw = input("Install: ").strip() if sys.stdin.isatty() else "all"
    if raw in ("", "all"):
        chosen, want_layout = list(NAMES), None
    else:
        chosen = []
        for tok in raw.replace(",", " ").split():
            name = NAMES[int(tok) - 1] if tok.isdigit() and 0 < int(tok) <= len(NAMES) else tok
            if name not in NAMES: sys.exit(f"Unknown: {tok}")
            if name not in chosen: chosen.append(name)
        want_layout = None

# crew-layout mods only show up inside the crew layout: offer it, and bring what it needs
needs_layout = [c[0] for c in CAT if c[0] in chosen and c[1] == "layout"]
if want_layout is None:
    want_layout = bool(needs_layout) and ask(f"{', '.join(needs_layout)} live in the crew layout. Install layouts/crew.json too?")
if want_layout:
    extra = sorted(m for m in layout_mods(LAYOUT) if m in NAMES and m not in chosen)
    if extra: print(f"The crew layout also needs: {', '.join(extra)}"); chosen += extra

# ---- copy mods ----------------------------------------------------------------------
ign = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store")
for m in chosen:
    src, dst = os.path.join("mods", m), os.path.join(APP, "mods", m)
    if same_tree(src, dst): print(f"  = {m} (up to date)"); continue
    existed = os.path.lexists(dst)
    backup(dst)
    if os.path.lexists(dst): shutil.rmtree(dst) if not os.path.islink(dst) else os.unlink(dst)
    shutil.copytree(src, dst, ignore=ign)
    print(f"  {'~' if existed else '+'} {m}")

# ---- layout ---------------------------------------------------------------------------
if want_layout:
    dst = os.path.join(APP, "layouts", "crew.json")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not (os.path.exists(dst) and filecmp.cmp("layouts/crew.json", dst, shallow=False)):
        backup(dst); shutil.copy2("layouts/crew.json", dst); print("  + layouts/crew.json (pick it in Settings > Layout)")

# ---- keys: merge each mod's bindings; never overwrite yours without asking --------------
kpath = os.path.join(APP, "keys.json")
keys = json.load(open(kpath)) if os.path.exists(kpath) else {}
changed = False
for m in chosen:
    f = os.path.join("keys", f"{m}.json")
    if not os.path.exists(f): continue
    for section, binds in json.load(open(f)).items():
        sec = keys.setdefault(section, {})
        for k, action in binds.items():
            cur = sec.get(k)
            if cur == action: continue
            if cur and not ask(f"{k} ({section}) is '{cur}'. Rebind to '{action}' for {m}?", default=False):
                print(f"  ! kept {k} = {cur}"); continue
            sec[k] = action; changed = True
            print(f"  + key {k} -> {action}")
if changed:
    backup(kpath)
    with open(kpath, "w") as fh: json.dump(keys, fh, indent=2); fh.write("\n")

# ---- check ----------------------------------------------------------------------------
if shutil.which("herdr-app"):
    bad = [m for m in chosen if subprocess.run(["herdr-app", "check", os.path.join(APP, "mods", m)], capture_output=True).returncode]
    print(f"\nherdr-app check: {'failed for ' + ', '.join(bad) if bad else 'all passed'}")
if os.path.isdir(BACKUP): print(f"Replaced files saved in {BACKUP}")
print("Done. Herdr reloads mods live.")
