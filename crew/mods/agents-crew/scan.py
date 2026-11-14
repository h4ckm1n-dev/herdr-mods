#!/usr/bin/env python3
"""Summarise the Claude Code session running in each terminal: main loop + subagents.
Args: one "key|pid|cwd" per terminal (pid: its foreground process, may be empty).
Prints one JSON object {key: session|null}. Reads only file tails, so it stays cheap."""
import glob, json, os, re, subprocess, sys, time
from datetime import datetime

HOME = os.path.expanduser("~")
TAIL = 512 * 1024      # ponytail: tail-only parse; counts cover the tail, fine for live view
RECENT_S = 30 * 60     # finished subagents stay listed this long
GAP_S = 120            # longer pauses between records don't count as work (resumed agents)
STEP = "mcp__savvy-progress__step"  # workers that report {done, total, note}
FLOW = "mcp__savvy-progress__progress"  # the savvy-flow orchestrator's counter: title, phase, done/total
PHASES = ("plan", "design", "delegate", "review", "close")

def flow(prev, inp, ts):
    """Port of savvy-progress merge(): a new title (or one after a finished flow) starts over."""
    title = (inp.get("title") or "").strip()[:120]
    new = not prev or prev["finished"] or (title and title != prev["title"])
    b = {"title": "savvy-flow", "total": 0, "done": 0, "phase": "plan", "finished": False} if new else dict(prev)
    tasks = [t for t in inp.get("tasks") or [] if (t.get("title") or "").strip()] if isinstance(inp.get("tasks"), list) else None
    num = lambda v, d: max(0, round(v)) if isinstance(v, (int, float)) else d
    total = min(200, num(inp.get("total"), len(tasks) if tasks is not None else b["total"]))
    done = num(inp.get("done"), b["done"])
    done = min(total, done) if total else done
    phase = inp.get("phase") if inp.get("phase") in PHASES else b["phase"]
    fin = inp.get("finished") is True
    return {"title": title or b["title"], "total": total, "done": done,
            "phase": "close" if fin else phase, "finished": fin, "at": ts}
STALE_S = 15 * 60      # unfinished but silent this long: the subagent died without saying so
WRITES = {"Edit", "Write", "MultiEdit", "NotebookEdit"}

def slug(cwd):
    return re.sub(r"[^A-Za-z0-9]", "-", cwd)

def tail_lines(path):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2); size = f.tell()
            f.seek(max(0, size - TAIL))
            data = f.read().decode("utf-8", "replace")
    except OSError:
        return []
    lines = data.split("\n")
    if size > TAIL: lines = lines[1:]  # first line is cut
    out = []
    for l in lines:
        try: d = json.loads(l)
        except ValueError: continue
        if isinstance(d, dict): out.append(d)  # a stray non-object line must not crash the scan
    return out

def stamp(ts):
    """Epoch seconds of an ISO timestamp, or None when it isn't one."""
    try: return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except (AttributeError, TypeError, ValueError): return None

def base(p): return os.path.basename(p.rstrip("/")) or p

def describe(name, inp):
    p = inp.get("file_path") or inp.get("notebook_path") or ""
    first = lambda s: (s or "").strip().split("\n")[0]
    if name == "Bash":
        if inp.get("description"): return inp["description"]
        cmd = re.sub(r"^(cd\s+\S+\s*(&&|;)\s*)+", "", first(inp.get("command")))
        return "$ " + cmd.replace(HOME, "~")
    if name == "Read": return "read " + base(p)
    if name in WRITES: return "edit " + base(p)
    if name == "Grep": return 'grep "%s"' % first(inp.get("pattern"))
    if name == "Glob": return "glob " + (inp.get("pattern") or "")
    if name == "WebFetch": return "fetch " + re.sub(r"^https?://([^/]+).*$", r"\1", inp.get("url") or "")
    if name == "WebSearch": return "search " + (inp.get("query") or "")
    if name in ("Agent", "Task"): return "spawn " + (inp.get("description") or "agent")
    m = re.match(r"^mcp__(.+?)__(.+)$", name)
    return "%s:%s" % m.groups() if m else name

def activity(records):
    calls, results = [], {}
    for d in records:
        if d.get("type") not in ("assistant", "user"): continue  # skip api-request-blob replays
        c = (d.get("message") or {}).get("content")
        if not isinstance(c, list): continue
        for b in c:
            if b.get("type") == "tool_use":
                calls.append((b.get("id"), b.get("name") or "?", b.get("input") or {}, d.get("timestamp")))
            elif b.get("type") == "tool_result":
                results[b.get("tool_use_id")] = bool(b.get("is_error"))
    acts, files, errors, step = [], [], 0, None
    for cid, name, inp, ts in calls:
        if name in (STEP, FLOW):  # progress report, not an action
            step = {"done": inp.get("done", (step or {}).get("done", 0)),
                    "total": inp.get("total") or (step or {}).get("total"), "note": inp.get("note") or ""}
            continue
        state = "run" if cid not in results else ("err" if results[cid] else "ok")
        errors += state == "err"
        p = inp.get("file_path") or inp.get("notebook_path")
        if name in WRITES and p and state == "ok":
            files = [f for f in files if f != p] + [p]
        acts.append({"line": describe(name, inp)[:160], "state": state, "at": ts})
    return {"count": len(acts), "errors": errors, "files": [base(f) for f in files], "recent": acts[-6:], "step": step}

CACHE = os.path.join(HOME, ".cache", "agents-crew", "usage.json")  # own cache: claude-crew's scanner keeps v5

TOUCHED = set()  # cache entries used this run; the rest is dropped so the cache can't grow forever
FRESH = {"v": 6, "step": None, "flow": None, "todos": [], "files": [], "pend": {}, "off": 0, "last": None, "in": 0, "out": 0, "read": 0, "write": 0, "turns": 0, "ctx": 0,
         "model": "", "calls": 0, "errors": 0, "active": 0.0, "ts": None, "at": {}}

TODO_TOOLS = ("TodoWrite", "TaskCreate", "TaskUpdate")

def todos(cur, name, inp):
    """The session's task list. TodoWrite sends the whole list each time; TaskCreate/TaskUpdate edit one task,
    ids counted from 1 in creation order (inferred from Claude Code's "#1, #2" numbering, not seen in a transcript yet)."""
    if name == "TodoWrite":
        return [{"id": str(i + 1), "title": t.get("content") or "", "doing": t.get("activeForm") or "", "status": t.get("status") or "pending"}
                for i, t in enumerate(inp.get("todos") or [])]
    cur = [dict(t) for t in cur]
    if name == "TaskCreate":
        cur.append({"id": str(len(cur) + 1), "title": inp.get("subject") or inp.get("description") or "", "doing": inp.get("activeForm") or "", "status": "pending"})
    else:
        for t in cur:
            if t["id"] == str(inp.get("taskId") or inp.get("id") or ""):
                if inp.get("status") == "deleted": cur.remove(t)
                else: t.update({k: v for k, v in (("status", inp.get("status")), ("title", inp.get("subject")), ("doing", inp.get("activeForm"))) if v})
                break
    return cur

def usage(path, cache):
    """Exact totals over the WHOLE transcript (tokens, calls, errors, working time), read
    incrementally from the last offset so a 25 MB log costs one read, then only new bytes."""
    size = os.path.getsize(path)
    c = cache.get(path)
    if not c or c.get("v") != FRESH["v"] or c["off"] > size:  # new, old format, or rewritten
        c = json.loads(json.dumps(FRESH))  # deep copy: files/pend lists must not be shared
    if size > c["off"]:
        with open(path, "rb") as f:
            f.seek(c["off"]); data = f.read()
        end = data.rfind(b"\n") + 1  # only whole lines; the rest waits for the next poll
        for l in data[:end].split(b"\n"):
            try: d = json.loads(l)
            except ValueError: continue
            if not isinstance(d, dict): continue
            ts = d.get("timestamp"); t = stamp(ts)
            if t is not None:  # working time: gaps between records, capped, so a resume hours later adds nothing
                if c["ts"] and t > c["ts"]: c["active"] += min(GAP_S, t - c["ts"])
                c["ts"] = t
            kind, m = d.get("type"), d.get("message") or {}
            blocks = m.get("content") if isinstance(m.get("content"), list) else []
            if kind == "assistant":  # api-request-blob records replay every call: not counted
                for b in blocks:
                    if b.get("type") != "tool_use": continue
                    inp = b.get("input") or {}
                    if b.get("name") == FLOW:
                        c["flow"] = flow(c["flow"], inp, ts)
                        continue
                    if b.get("name") in TODO_TOOLS:  # the session's own plan: decomposition + status per task
                        c["todos"] = todos(c.get("todos") or [], b.get("name"), inp)
                    if b.get("name") == STEP:  # total only comes on the first report: carry it
                        st = c["step"] or {}
                        c["step"] = {"done": inp.get("done", st.get("done", 0)),
                                     "total": inp.get("total") or st.get("total"), "note": inp.get("note") or ""}
                        continue
                    c["calls"] += 1
                    fp = inp.get("file_path") or inp.get("notebook_path")
                    if b.get("name") in WRITES and fp: c["pend"][b.get("id")] = fp
            elif kind == "user":
                for b in blocks:
                    if b.get("type") != "tool_result": continue
                    c["errors"] += bool(b.get("is_error"))
                    fp = c["pend"].pop(b.get("tool_use_id"), None)
                    if fp and not b.get("is_error"):
                        if fp not in c["files"]: c["files"].append(fp)
                        c.setdefault("at", {})[fp] = c["ts"]  # last write time, for the conflict radar (old cache rows lack it)
            u = m.get("usage")
            if kind != "assistant" or not u or m.get("id") == c["last"] or m.get("model") == "<synthetic>": continue
            c["last"] = m.get("id")  # lines of one API message repeat its usage: count it once
            i, r, w = u.get("input_tokens", 0), u.get("cache_read_input_tokens", 0), u.get("cache_creation_input_tokens", 0)
            c["in"] += i; c["read"] += r; c["write"] += w; c["out"] += u.get("output_tokens", 0)
            c["turns"] += 1; c["ctx"] = i + r + w; c["model"] = m.get("model") or c["model"]
        c["off"] += end
    cache[path] = c
    TOUCHED.add(path)
    return {k: c[k] for k in ("in", "out", "read", "write", "turns", "ctx", "model", "calls", "errors", "active", "ts", "step", "flow", "todos")} \
        | {"files": len(c["files"]), "touched": recent_writes(c.get("at", {}), time.time())}

def recent_writes(at, now):
    """Files written in the last RECENT_S: what two live sessions can be fighting over right now."""
    return sorted(fp for fp, t in at.items() if t and now - t < RECENT_S)

def load_cache():
    try: return json.load(open(CACHE))
    except (OSError, ValueError): return {}

def save_cache(cache):
    hist = {p: v for p, v in cache.get("_hist", {}).items() if os.path.exists(p) and "|" in v[0]}
    cache = {p: c for p, c in cache.items() if p in TOUCHED} | {"_hist": hist}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    tmp = "%s.%d.tmp" % (CACHE, os.getpid())  # two panels scanning at once must not share a temp file
    with open(tmp, "w") as f: json.dump(cache, f, separators=(",", ":"))
    os.replace(tmp, CACHE)

def hkey(m):
    # model splits it sharply: general-purpose runs ~45s on sonnet, ~6min on opus
    return "%s|%s" % (m.get("agentType") or "agent", m.get("model") or "inherit")

def history(cache):
    """Median and p75 working time of finished subagents, per type. Each log is timed once."""
    seen = cache.setdefault("_hist", {})
    for meta in glob.glob(os.path.join(HOME, ".claude", "projects", "*", "*", "subagents", "*.meta.json")):
        log = meta[:-10] + ".jsonl"
        if log in seen or not os.path.exists(log): continue
        try: m = json.load(open(meta))
        except (OSError, ValueError): continue
        if m.get("finished"):  # timed once; finished logs don't change
            seen[log] = [hkey(m), usage(log, {})["active"]]
    by = {}
    for key, secs in seen.values():
        if secs <= 5: continue
        by.setdefault(key, []).append(secs)
        by.setdefault(key.split("|")[0], []).append(secs)  # type alone: fallback when the pair is rare
    out = {}
    for typ, v in by.items():
        if len(v) < 3: continue  # too few runs to promise anything
        v.sort(); out[typ] = {"median": v[len(v) // 2], "p75": v[(3 * len(v)) // 4], "n": len(v)}
    return out

def born(path):
    st = os.stat(path)
    return getattr(st, "st_birthtime", st.st_mtime)

def by_pid():
    """Claude writes ~/.claude/sessions/<pid>.json (sessionId, cwd); it follows /clear and --resume."""
    out = {}
    for f in glob.glob(os.path.join(HOME, ".claude", "sessions", "*.json")):
        try: d = json.load(open(f))
        except (OSError, ValueError): continue
        if d.get("sessionId"): out[int(d.get("pid") or base(f)[:-5])] = d
    return out

def parents(pids):
    if not pids: return {}
    try:
        ps = subprocess.run(["ps", "-o", "pid=,ppid=", "-p", ",".join(map(str, pids))],
                            capture_output=True, text=True, timeout=2).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    return {int(a): int(b) for a, b in (l.split() for l in ps.splitlines() if len(l.split()) == 2)}

def transcript(pid, cwd, known, kids):
    """(path, exact). Exact via the pid's session file; else the newest transcript in cwd."""
    d = known.get(pid) or known.get(kids.get(pid))  # pid may be the shell around claude
    if d:
        sid = d["sessionId"]
        p = os.path.join(HOME, ".claude", "projects", slug(d.get("cwd") or cwd or ""), sid + ".jsonl")
        if not os.path.exists(p):
            p = next(iter(glob.glob(os.path.join(HOME, ".claude", "projects", "*", sid + ".jsonl"))), None)
        return p, True  # p may be None: a fresh Claude with no transcript yet, not someone else's
    if pid is not None or not cwd: return None, False  # a claude we can't place: show nothing, not a guess
    # ponytail: fallback guess; two Claudes in one cwd share the newest transcript
    mains = glob.glob(os.path.join(HOME, ".claude", "projects", slug(cwd), "*.jsonl"))
    return (max(mains, key=os.path.getmtime), False) if mains else (None, False)

JEV_DIR = os.path.join(HOME, ".claude", "dev-mods")  # written by the jev-router Claude Code mod

def jev(sid):
    """Last jev-router call of this session (written by the Claude Code mod), None when it never ran here."""
    try:
        return json.load(open(os.path.join(JEV_DIR, "jev-state", sid + ".json")))
    except (OSError, ValueError):
        return None

def turn_span(records):
    """(start, end) of the current task: from the last prompt the person (or a task notice) sent, to the last record."""
    start = end = None
    for d in records:
        t = stamp(d.get("timestamp"))
        if t is None or d.get("type") not in ("user", "assistant"): continue
        end = t
        c = (d.get("message") or {}).get("content")
        prompt = isinstance(c, str) or (isinstance(c, list) and not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c))
        if d["type"] == "user" and prompt and not d.get("isMeta"): start = t
    return start, end

def session(main, exact, cache, hist):
    sid = base(main)[:-6]
    out = {"id": sid, "exact": exact, "updated": os.path.getmtime(main),
           "main": {**activity(recs := tail_lines(main)), "usage": usage(main, cache)}, "agents": [],
           "jev": jev(sid)}
    out["turn"] = dict(zip(("start", "end"), turn_span(recs)))
    now = time.time()
    # every subagent of the session, not just the listed ones, so the total never shrinks
    out["crewTotal"] = sum(sum(usage(l, cache)[k] for k in ("in", "out", "read", "write"))
                           for l in glob.glob(os.path.join(main[:-6], "subagents", "*.jsonl")))
    for meta in glob.glob(os.path.join(main[:-6], "subagents", "*.meta.json")):
        log = meta[:-10] + ".jsonl"
        src = log if os.path.exists(log) else meta
        try:
            m = json.load(open(meta)); mt = os.path.getmtime(src); started = born(src)
        except (OSError, ValueError):
            continue
        done = bool(m.get("finished"))
        lost = not done and now - mt > STALE_S
        if (done or lost) and now - mt > RECENT_S: continue
        recs = tail_lines(log) if src == log else []
        out["agents"].append({
            "id": base(meta)[:-10], "type": m.get("agentType") or "agent",
            "name": m.get("description") or m.get("agentType") or "agent",
            "model": m.get("model") or "", "finished": done or lost, "lost": lost,
            "started": started, "updated": mt, **activity(recs),
            "usage": usage(log, cache) if src == log else None,
            "typical": hist.get(hkey(m)) or hist.get(m.get("agentType") or "agent")})
    # what this session (main loop + listed subagents) wrote lately; main.js compares sessions
    out["touched"] = sorted({f for u in [out["main"]["usage"]] + [a["usage"] for a in out["agents"]] if u for f in u["touched"]})
    # stable order: running first, then by start time, so rows don't jump on every write
    out["agents"].sort(key=lambda a: (a["finished"], a["started"]))
    return out

if __name__ == "__main__":
    terms = [(a.split("|", 2) + ["", ""])[:3] for a in sys.argv[1:]]
    pids = [int(p) for _, p, _ in terms if p.isdigit()]
    known = by_pid()
    kids = {} if all(p in known for p in pids) else {pp: c for c, pp in parents(list(known)).items()}
    res, cache = {}, load_cache()
    hist = history(cache)
    for key, pid, cwd in terms:
        try:
            path, exact = transcript(int(pid) if pid.isdigit() else None, cwd, known, kids)
            res[key] = session(path, exact, cache, hist) if path else None
        except Exception:  # one bad session must not blank every card (as in codex_scan.py)
            res[key] = None
    save_cache(cache)
    print(json.dumps(res, separators=(",", ":")))
