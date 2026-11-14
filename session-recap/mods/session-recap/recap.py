#!/usr/bin/env python3
"""Which files a Claude Code session read and wrote, over time, from its transcript.

  recap.py list            -> JSON [{id, project, title, updated}]: the newest sessions, newest first
  recap.py show ID         -> JSON {id, project, cwd, start, end, files, reads, writes, shell, ticks, groups}
                              groups: [{dir, files: [{name, path, reads, writes, marks: [[x, "r"|"w"]]}]}]
                              shell: {count, marks: [x]}, the session's shell commands

x runs 0..1 over the session's working time: a pause longer than GAP_S counts as GAP_S, so a session
left open overnight doesn't squeeze its work into two clumps. Sub-agents' transcripts count too.
Only the Read / Edit / Write tools name their file. A shell command can change files too and the
transcript doesn't say which (Claude Code's file-history snapshots only follow its own tools), so shell
commands get one row of their own: when they ran, not what they touched.
"""
import glob, json, os, re, sys
from datetime import datetime

HOME = os.path.expanduser("~")
PROJECTS = os.path.join(os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude"), "projects")
LIST = 80              # sessions listed
HEAD = 256 * 1024      # ponytail: title and cwd come from a transcript's first 256 KB
GAP_S = 120
MARKS = 400            # per file; more than the track has pixels
KIND = {"Read": "r", "Edit": "w", "Write": "w", "MultiEdit": "w", "NotebookEdit": "w", "Bash": "s"}


def stamp(ts):
    try: return datetime.fromisoformat((ts or "").replace("Z", "+00:00")).timestamp()
    except ValueError: return None


def text_of(content):
    if isinstance(content, str): return content
    if isinstance(content, list):
        return " ".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


def head(path):
    """(cwd, title): the ai title when Claude Code wrote one, else the first thing the person typed."""
    cwd = title = first = None
    try:
        with open(path, "rb") as f:
            lines = f.read(HEAD).decode("utf-8", "replace").split("\n")
    except OSError:
        return None, None
    for l in lines:
        if '"cwd"' not in l and '"ai-title"' not in l: continue
        try: d = json.loads(l)
        except ValueError: continue
        cwd = cwd or d.get("cwd")
        if d.get("type") == "ai-title" and d.get("aiTitle"): title = d["aiTitle"]
        elif not first and d.get("type") == "user" and not d.get("isMeta"):
            t = " ".join(text_of((d.get("message") or {}).get("content")).split())
            if t and not t.startswith("<"): first = t
    return cwd, (title or first or "")[:120]


def listing():
    paths = glob.glob(os.path.join(PROJECTS, "*", "*.jsonl"))
    times = {}
    for p in paths:
        try: times[p] = os.path.getmtime(p)
        except OSError: pass
    out = []
    for p in sorted(times, key=times.get, reverse=True)[:LIST]:
        cwd, title = head(p)
        out.append({"id": os.path.basename(p)[:-6], "project": os.path.basename(cwd or "") or "?",
                    "title": title or "Untitled session", "updated": times[p]})
    return out


def events(path):
    """(time, file path, "r"|"w") for every Read / Edit / Write call in one transcript; (time, "", "s") for a shell command."""
    try: f = open(path, encoding="utf-8", errors="replace")
    except OSError: return
    with f:
        for l in f:
            if '"tool_use"' not in l: continue
            try: d = json.loads(l)
            except ValueError: continue
            if d.get("type") != "assistant": continue  # not the api-request-blob replays of the same calls
            ts = stamp(d.get("timestamp"))
            c = (d.get("message") or {}).get("content")
            if ts is None or not isinstance(c, list): continue
            for b in c:
                if not isinstance(b, dict) or b.get("type") != "tool_use" or b.get("name") not in KIND: continue
                inp = b.get("input") or {}
                if b["name"] == "Bash":
                    yield ts, "", "s"
                    continue
                p = inp.get("file_path") or inp.get("notebook_path")
                if isinstance(p, str) and p: yield ts, p, KIND[b["name"]]


def show_dir(d, cwd):
    if cwd and (d == cwd or d.startswith(cwd + os.sep)): return os.path.relpath(d, cwd).replace(os.curdir, "", 1) or "."
    return "~" + d[len(HOME):] if d == HOME or d.startswith(HOME + os.sep) else d


def recap(path):
    cwd, title = head(path)
    evs = sorted(e for p in [path] + glob.glob(os.path.join(path[:-6], "subagents", "*.jsonl")) for e in events(p))
    out = {"id": os.path.basename(path)[:-6], "project": os.path.basename(cwd or "") or "?", "cwd": cwd, "title": title,
           "start": None, "end": None, "files": 0, "reads": 0, "writes": 0, "shell": {"count": 0, "marks": []}, "ticks": [], "groups": []}
    if not evs: return out
    # working time: each pause counts for GAP_S at most
    at, t, prev = [], 0.0, evs[0][0]
    for ts, _, _ in evs:
        t += min(ts - prev, GAP_S); prev = ts
        at.append(t)
    span = at[-1] or 1.0
    files, order, shell = {}, [], []
    for (ts, p, kind), a in zip(evs, at):
        if kind == "s":
            x = round(a / span, 3)
            if shell[-1:] != [x]: shell.append(x)
            continue
        f = files.get(p)
        if f is None:
            f = files[p] = {"name": os.path.basename(p), "path": p, "reads": 0, "writes": 0, "marks": []}
            order.append(p)
        f["reads" if kind == "r" else "writes"] += 1
        m = [round(a / span, 3), kind]
        if m not in f["marks"][-2:] and len(f["marks"]) < MARKS: f["marks"].append(m)
    groups = {}
    for p in order:  # folders, then files in them, in the order the session first touched them
        groups.setdefault(show_dir(os.path.dirname(p), cwd), []).append(files[p])
    clock = lambda ts: datetime.fromtimestamp(ts).strftime("%H:%M")
    # five evenly spaced ticks, each with the clock of the first call at or after it
    ticks = [{"x": k / 4, "label": clock(next(e[0] for e, a in zip(evs, at) if a >= span * k / 4 - 1e-9))} for k in range(5)]
    out.update(start=evs[0][0], end=evs[-1][0], files=len(files), reads=sum(f["reads"] for f in files.values()),
               writes=sum(f["writes"] for f in files.values()), ticks=ticks,
               shell={"count": sum(1 for e in evs if e[2] == "s"), "marks": shell[:MARKS * 4]},
               groups=[{"dir": d, "files": fs} for d, fs in groups.items()])
    return out


def main(argv):
    if argv == ["list"]:
        print(json.dumps(listing()))
    elif len(argv) == 2 and argv[0] == "show" and re.fullmatch(r"[A-Za-z0-9-]{8,64}", argv[1]):
        found = glob.glob(os.path.join(PROJECTS, "*", argv[1] + ".jsonl"))
        if not found: sys.exit(f"no session {argv[1]}")
        print(json.dumps(recap(found[0])))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
