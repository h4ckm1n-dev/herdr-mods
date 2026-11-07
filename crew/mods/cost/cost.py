#!/usr/bin/env python3
"""Claude Code spend: today / last 7 days, by model, main vs subagents, by project.
Incremental by file offset (like claude-crew/scan.py): each transcript is read once, then only new bytes.
Usage: cost.py [YYYY-MM-DD]   (date = "today", for tests)   Prints JSON."""
import glob, json, os, sys
from datetime import datetime, date, timedelta

HOME = os.path.expanduser("~")
PROJECTS = os.path.join(HOME, ".claude", "projects")
LEDGERS = os.path.join(HOME, ".claude", "logs")
CACHE = os.path.join(HOME, ".cache", "herdr-cost", "usage.json")
V = 1
WINDOW = 7

# $/MTok: (input, output, cache read). Source: claude-api skill "Current Models" table (cached 2026-10-06);
# matched by longest model-id prefix. Cache write is derived: 5-minute = 1.25x input, 1-hour = 2x input.
# ponytail: static table; Haiku 5.5 is $0.10/$0.50 only for prompts <=100K (we bill all at that rate),
# cache-read for Opus 4.x / Sonnet 4.6 / Haiku 4.5 assumed 0.1x input (not in the table).
PRICES = {
    "claude-fable":      (10.0, 50.0, 0.25),
    "claude-mythos":     (10.0, 50.0, 0.25),
    "claude-opus-5-5":   (4.0, 20.0, 0.20),
    "claude-opus":       (5.0, 25.0, 0.50),   # opus 5, 4.8, 4.7, 4.6
    "claude-sonnet-5":   (2.0, 10.0, 0.20),   # sonnet 5.5 and 5
    "claude-sonnet":     (3.0, 15.0, 0.30),   # sonnet 4.6
    "claude-haiku-5":    (0.10, 0.50, 0.01),
    "claude-haiku":      (1.0, 5.0, 0.10),    # haiku 4.5
}
FAMILIES = ("fable", "mythos", "opus", "sonnet", "haiku")

def family(model):
    m = (model or "").lower()
    return next((f for f in FAMILIES if f in m), "other")

def price(model):
    best = max((p for p in PRICES if (model or "").startswith(p)), key=len, default=None)
    return PRICES[best] if best else PRICES["claude-opus-5-5"]  # unknown model: assume the daily driver

def cost(model, t):
    """t = [input, output, cache_read, cache_write_5m, cache_write_1h] tokens -> dollars."""
    i, o, r = price(model)
    return (t[0] * i + t[1] * o + t[2] * r + t[3] * i * 1.25 + t[4] * i * 2.0) / 1e6

def tokens(u):
    cc = u.get("cache_creation") or {}
    w1 = cc.get("ephemeral_1h_input_tokens", 0)
    w5 = cc.get("ephemeral_5m_input_tokens", u.get("cache_creation_input_tokens", 0) - w1)
    return [u.get("input_tokens", 0), u.get("output_tokens", 0), u.get("cache_read_input_tokens", 0), w5, w1]

def local_day(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().date().isoformat()

def add(days, day, model, t, sign=1):
    row = days.setdefault(day, {}).setdefault(model, [0, 0, 0, 0, 0])
    for k in range(5): row[k] += sign * t[k]

def scan(path, cache):
    """Fold new whole lines of one transcript into its cache entry: {off, last, cwd, days{day{model: tokens}}}."""
    size = os.path.getsize(path)
    c = cache.get(path)
    if not c or c.get("v") != V or c["off"] > size:  # new, old format, or rewritten
        c = {"v": V, "off": 0, "last": None, "cwd": None, "days": {}}
    if size > c["off"]:
        with open(path, "rb") as f:
            f.seek(c["off"]); data = f.read()
        end = data.rfind(b"\n") + 1  # only whole lines; the rest waits for the next run
        for line in data[:end].split(b"\n"):
            try: d = json.loads(line)
            except ValueError: continue
            if not c["cwd"] and d.get("cwd"): c["cwd"] = d["cwd"]
            m = d.get("message") or {}
            u = m.get("usage")
            if d.get("type") != "assistant" or not u or m.get("model") in (None, "<synthetic>") or not d.get("timestamp"): continue
            # lines of one API message repeat its usage (output_tokens grows): keep only the latest
            if c["last"] and c["last"][0] == m.get("id"):
                _, day, model, t = c["last"]
                add(c["days"], day, model, t, -1)
            day, model, t = local_day(d["timestamp"]), m["model"], tokens(u)
            add(c["days"], day, model, t)
            c["last"] = [m.get("id"), day, model, t]
        c["off"] += end
    cache[path] = c
    return c

def ledger(today):
    """Subagent runs today by agent type, from the subagent-usage-ledger hook (SubagentStop = a finished run)."""
    runs = {}
    try:
        for line in open(os.path.join(LEDGERS, "subagents-%s.jsonl" % today)):
            try: d = json.loads(line)
            except ValueError: continue
            if d.get("event") == "SubagentStop" and d.get("agent"): runs[d["agent"]] = runs.get(d["agent"], 0) + 1
    except OSError: pass
    return sorted(runs.items(), key=lambda kv: -kv[1])[:5]

def report(files, cache, today):
    """files: [(path, project_dir, is_subagent)]. Pure over the cache, so the test can feed temp files."""
    first = (date.fromisoformat(today) - timedelta(days=WINDOW - 1)).isoformat()
    names = [(date.fromisoformat(today) - timedelta(days=k)).isoformat() for k in range(WINDOW - 1, -1, -1)]
    daily = {n: 0.0 for n in names}
    out = {"today": 0.0, "week": 0.0, "models": {}, "split": {"main": [0.0, 0.0], "sub": [0.0, 0.0]}, "projects": {}}
    for path, proj, sub in files:
        c = scan(path, cache)
        name = os.path.basename((c["cwd"] or proj).rstrip("/")) or proj
        for day, models in c["days"].items():
            if day < first or day > today: continue
            for model, t in models.items():
                usd = cost(model, t)
                daily[day] += usd
                out["week"] += usd
                fam = out["models"].setdefault(family(model), [0.0, 0.0])
                s = out["split"]["sub" if sub else "main"]
                p = out["projects"].setdefault(name, [0.0, 0.0])
                fam[1] += usd; s[1] += usd; p[1] += usd
                if day == today:
                    out["today"] += usd; fam[0] += usd; s[0] += usd; p[0] += usd
    out["days"] = [[n, round(daily[n], 4)] for n in names]
    r = lambda v: [round(x, 4) for x in v]
    out["models"] = {k: r(v) for k, v in out["models"].items()}
    out["split"] = {k: r(v) for k, v in out["split"].items()}
    out["projects"] = sorted(([k, *r(v)] for k, v in out["projects"].items()), key=lambda p: (-p[1], -p[2]))[:8]
    out["today"], out["week"] = round(out["today"], 4), round(out["week"], 4)
    out["subagents"] = ledger(today)
    return out

def find(since):
    """Transcripts touched since `since` (epoch): older files can't hold a message from the window."""
    out = []
    for p in glob.glob(os.path.join(PROJECTS, "*", "*.jsonl")):
        out.append((p, os.path.basename(os.path.dirname(p)), False))
    for p in glob.glob(os.path.join(PROJECTS, "*", "*", "subagents", "*.jsonl")):
        out.append((p, os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(p)))), True))
    return [f for f in out if os.path.getmtime(f[0]) >= since]

def load():
    try: return json.load(open(CACHE))
    except (OSError, ValueError): return {}

def save(cache, live):
    cache = {p: c for p, c in cache.items() if p in live}  # a deleted or aged-out transcript drops out
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    tmp = "%s.%d.tmp" % (CACHE, os.getpid())
    with open(tmp, "w") as f: json.dump(cache, f, separators=(",", ":"))
    os.replace(tmp, CACHE)

if __name__ == "__main__":
    today = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()
    start = datetime.combine(date.fromisoformat(today) - timedelta(days=WINDOW), datetime.min.time()).timestamp()
    files, cache = find(start), load()
    res = report(files, cache, today)
    save(cache, {f[0] for f in files})
    print(json.dumps(res, separators=(",", ":")))
