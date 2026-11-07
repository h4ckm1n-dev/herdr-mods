#!/usr/bin/env python3
"""Claude Code spend: today / last 7 days, by model, main vs subagents, by project.
Incremental by file offset (like claude-crew/scan.py): each transcript is read once, then only new bytes.
Usage: cost.py [YYYY-MM-DD]   (date = "today", for tests)   Prints JSON."""
import glob, json, os, sys, time
from datetime import datetime, date, timedelta

HOME = os.path.expanduser("~")
PROJECTS = os.path.join(HOME, ".claude", "projects")
LEDGERS = os.path.join(HOME, ".claude", "logs")
CACHE = os.path.join(HOME, ".cache", "herdr-cost", "usage.json")
V = 3  # 2: 10-minute slots for the last hour; 3: the session title
WINDOW = 7
SLOT = 600  # seconds: spend is also kept in 10-minute slots, for the last hour

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

def epoch(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()

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
        c = {"v": V, "off": 0, "last": None, "cwd": None, "title": None, "days": {}, "slots": {}}
    if size > c["off"]:
        with open(path, "rb") as f:
            f.seek(c["off"]); data = f.read()
        end = data.rfind(b"\n") + 1  # only whole lines; the rest waits for the next run
        for line in data[:end].split(b"\n"):
            try: d = json.loads(line)
            except ValueError: continue
            if not c["cwd"] and d.get("cwd"): c["cwd"] = d["cwd"]
            # the session's name as Claude Code shows it: a /rename wins over the generated title
            if d.get("type") == "custom-title" and d.get("customTitle"): c["title"] = "!" + d["customTitle"]
            elif d.get("type") == "ai-title" and d.get("aiTitle") and not (c["title"] or "").startswith("!"): c["title"] = d["aiTitle"]
            m = d.get("message") or {}
            u = m.get("usage")
            if d.get("type") != "assistant" or not u or m.get("model") in (None, "<synthetic>") or not d.get("timestamp"): continue
            # lines of one API message repeat its usage (output_tokens grows): keep only the latest
            if c["last"] and c["last"][0] == m.get("id"):
                _, day, model, t, slot = c["last"]
                add(c["days"], day, model, t, -1); add(c["slots"], slot, model, t, -1)
            day, model, t = local_day(d["timestamp"]), m["model"], tokens(u)
            slot = str(int(epoch(d["timestamp"]) // SLOT))
            add(c["days"], day, model, t); add(c["slots"], slot, model, t)
            c["last"] = [m.get("id"), day, model, t, slot]
        c["off"] += end
        keep = str(int(time.time() // SLOT) - 2 * 24 * 3600 // SLOT)  # slots only serve today and the last hour
        c["slots"] = {k: v for k, v in c["slots"].items() if k >= keep}
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

def report(files, cache, today, now=None):
    """files: [(path, project_dir, is_subagent)]. Pure over the cache, so the test can feed temp files."""
    first = (date.fromisoformat(today) - timedelta(days=WINDOW - 1)).isoformat()
    names = [(date.fromisoformat(today) - timedelta(days=k)).isoformat() for k in range(WINDOW - 1, -1, -1)]
    daily = {n: 0.0 for n in names}
    now = time.time() if now is None else now
    hour_from, day_start = now // SLOT - 5, datetime.combine(date.fromisoformat(today), datetime.min.time()).timestamp()
    first_today, last_hour, cache_in, sessions = None, 0.0, {}, {}
    out = {"today": 0.0, "week": 0.0, "models": {}, "split": {"main": [0.0, 0.0], "sub": [0.0, 0.0]}, "projects": {}}
    for path, proj, sub in files:
        c = scan(path, cache)
        name = os.path.basename((c["cwd"] or proj).rstrip("/")) or proj
        # a subagent's spend belongs to the session that ran it: <project>/<session>/subagents/<agent>.jsonl
        sid = os.path.basename(os.path.dirname(os.path.dirname(path))) if sub else os.path.basename(path)[:-6]
        ses = sessions.setdefault(sid, {"usd": 0.0, "title": None, "project": name, "at": 0})
        if not sub: ses["title"], ses["project"] = (c.get("title") or "").lstrip("!") or None, name
        ses["at"] = max(ses["at"], os.path.getmtime(path))
        for slot, models in c.get("slots", {}).items():
            s0 = int(slot) * SLOT
            if s0 < day_start or s0 > now: continue
            if any(any(t) for t in models.values()): first_today = s0 if first_today is None else min(first_today, s0)
            if int(slot) >= hour_from: last_hour += sum(cost(model, t) for model, t in models.items())
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
                # cache share: input tokens served from cache (today if any, else the week)
                cin = cache_in.setdefault((day == today, family(model)), [0, 0])
                cin[0] += t[2]; cin[1] += t[0] + t[2] + t[3] + t[4]
                if day == today:
                    out["today"] += usd; fam[0] += usd; s[0] += usd; p[0] += usd; ses["usd"] += usd
    out["days"] = [[n, round(daily[n], 4)] for n in names]
    r = lambda v: [round(x, 4) for x in v]
    out["models"] = {k: r(v) for k, v in out["models"].items()}
    out["split"] = {k: r(v) for k, v in out["split"].items()}
    out["projects"] = sorted(([k, *r(v)] for k, v in out["projects"].items()), key=lambda p: (-p[1], -p[2]))[:8]
    out["today"], out["week"] = round(out["today"], 4), round(out["week"], 4)
    out["subagents"] = ledger(today)
    # pace: the last hour (six 10-minute slots, the current one partial) and today's average per active hour
    out["lastHour"] = round(last_hour, 4)
    top = max(sessions.values(), key=lambda x: x["usd"], default=None)
    out["topSession"] = {**top, "usd": round(top["usd"], 4), "at": int(top["at"])} if top and top["usd"] > 0 else None
    out["cached"] = {}
    for fam in out["models"]:
        today_, week_ = cache_in.get((True, fam), [0, 0]), [a + b for a, b in zip(cache_in.get((True, fam), [0, 0]), cache_in.get((False, fam), [0, 0]))]
        r_, tot = today_ if today_[1] else week_
        if tot: out["cached"][fam] = round(100 * r_ / tot)
    out["perHour"] = round(out["today"] / max(1.0, (now - first_today) / 3600), 4) if first_today is not None else 0.0
    out["firstToday"] = first_today
    return out

CODEX = os.path.join(HOME, ".codex", "sessions")

# Codex models, $/MTok: (input, cached input, output) for <=272K input, then >272K. Source: OpenAI's
# pricing page (developers.openai.com/api/docs/pricing, read 2026-11-07); gpt-5.6-sol is promotional
# until 2026-11-30. Longest id prefix wins; an unknown model is billed as gpt-6.1-sol (Codex's default).
CODEX_PRICES = {
    "gpt-6.1-sol":   ((2.00, 0.10, 10.00), (4.00, 0.20, 15.00)),
    "gpt-6.1-terra": ((1.00, 0.05, 5.00), (2.00, 0.10, 7.50)),
    "gpt-6-astra":   ((10.00, 1.00, 50.00), (20.00, 2.00, 75.00)),
    "gpt-6-sol":     ((2.00, 0.20, 10.00), (4.00, 0.40, 15.00)),
    "gpt-6-luna":    ((0.10, 0.01, 0.50), (0.20, 0.02, 0.75)),
    "gpt-5.6-sol":   ((4.00, 0.40, 20.00), (8.00, 0.80, 30.00)),
    "gpt-5.3-codex": ((1.75, 0.175, 14.00), (1.75, 0.175, 14.00)),
}
LONG = 272_000

def codex_cost(model, fresh, cached, out, long=False):
    best = max((p for p in CODEX_PRICES if (model or "").startswith(p)), key=len, default="gpt-6.1-sol")
    pin, pcache, pout = CODEX_PRICES[best][1 if long else 0]
    return (fresh * pin + cached * pcache + out * pout) / 1e6

def codex(today, since, root=CODEX, now=None):
    """Codex per local day: tokens and API-equivalent $ (Codex itself runs on a ChatGPT plan).
    Each token_count reports running totals; a day gets the growth seen that day, priced at the
    model of the turn (turn_context) and the long-context rate when that request passed 272K."""
    names = [(date.fromisoformat(today) - timedelta(days=WINDOW - 1 - i)).isoformat() for i in range(WINDOW)]
    tok, usd = dict.fromkeys(names, 0), dict.fromkeys(names, 0.0)
    now = time.time() if now is None else now
    last_hour, first_today = 0.0, None
    for path in glob.glob(os.path.join(root, "*", "*", "*", "rollout-*.jsonl")):
        if os.path.getmtime(path) < since: continue
        prev, model = {"total_tokens": 0, "input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0}, None
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if '"turn_context"' in line:
                        try: model = (json.loads(line).get("payload") or {}).get("model") or model
                        except ValueError: pass
                        continue
                    if '"token_count"' not in line: continue
                    try: d = json.loads(line)
                    except ValueError: continue
                    info = (d.get("payload") or {}).get("info") or {}
                    tot = info.get("total_token_usage") or {}
                    if not tot.get("total_tokens") or tot["total_tokens"] <= prev["total_tokens"]: continue  # a repeat, or rate limits only
                    dl = {k: max(0, (tot.get(k) or 0) - prev[k]) for k in prev}
                    prev = {k: tot.get(k) or 0 for k in prev}
                    day = local_day(d.get("timestamp") or "")
                    if day not in tok: continue
                    cached = min(dl["cached_input_tokens"], dl["input_tokens"])
                    long = ((info.get("last_token_usage") or {}).get("input_tokens") or 0) > LONG
                    spent = codex_cost(model, dl["input_tokens"] - cached, cached, dl["output_tokens"], long)
                    tok[day] += dl["total_tokens"]; usd[day] += spent
                    at = epoch(d["timestamp"])
                    if day == today: first_today = at if first_today is None else min(first_today, at)
                    if now - 3600 <= at <= now: last_hour += spent
        except (OSError, ValueError): continue
    return {"today": tok[today], "week": sum(tok.values()), "days": [[n, tok[n]] for n in names],
            "usdLastHour": round(last_hour, 4), "firstToday": first_today, "usdToday": round(usd[today], 4), "usdWeek": round(sum(usd.values()), 4), "usdDays": [[n, round(usd[n], 4)] for n in names]}

def merge_codex(res, cx, now):
    """The Today card is every agent: Claude Code plus Codex at API prices (claudeToday keeps Claude's part)."""
    res["codex"], res["claudeToday"] = cx, res["today"]
    res["today"] = round(res["today"] + cx["usdToday"], 4)
    res["lastHour"] = round(res["lastHour"] + cx["usdLastHour"], 4)
    firsts = [f for f in (res.get("firstToday"), cx.get("firstToday")) if f is not None]
    res["perHour"] = round(res["today"] / max(1.0, (now - min(firsts)) / 3600), 4) if firsts else 0.0
    return res

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
    merge_codex(res, codex(today, start), time.time())
    save(cache, {f[0] for f in files})
    print(json.dumps(res, separators=(",", ":")))
