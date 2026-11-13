#!/usr/bin/env python3
"""Summarise the Codex session running in each terminal, in the shape main.js draws for Claude.
Args: one "key|pid|cwd" per terminal. Prints one JSON object {key: session|null}.
Sessions: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. Reads only file tails."""
import glob, json, os, re, sqlite3, subprocess, sys, time
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
TAIL = 512 * 1024      # ponytail: tail-only parse like scan.py; totals come from the last token_count anyway
STALE_S = 15 * 60      # a sub-agent silent this long died without answering
ROLLOUT = re.compile(r"/rollout-[^/]*\.jsonl$")

def tail_records(path):
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
        try: out.append(json.loads(l))
        except ValueError: pass  # blank or half-written line
    return out

def first_meta(path):
    """session_meta is always the first line; read it alone so a long file still knows its cwd and id."""
    try:
        with open(path, "rb") as f:
            d = json.loads(f.readline().decode("utf-8", "replace"))
    except (OSError, ValueError):
        return None
    return d.get("payload") if d.get("type") == "session_meta" else None

def model_label(model):
    """gpt-6.1-sol -> GPT-6.1 Sol"""
    parts = [p for p in (model or "").split("-") if p]
    if not parts: return ""
    head = parts[0].upper() if parts[0].lower() == "gpt" else parts[0].capitalize()
    if len(parts) > 1 and re.match(r"^\d", parts[1]): head, parts = f"{head}-{parts[1]}", parts[1:]
    return " ".join([head] + [p.capitalize() for p in parts[1:]])

def epoch(ts):
    try: return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError): return 0.0

def iso(sec):
    return datetime.fromtimestamp(sec, timezone.utc).isoformat().replace("+00:00", "Z") if isinstance(sec, (int, float)) else None

def describe(name, inp):
    first = (inp or "").strip().split("\n")[0] if isinstance(inp, str) else ""
    try: args = json.loads(inp or "{}")
    except (ValueError, TypeError): args = {}
    if not isinstance(args, dict): args = {}
    title = args.get("title") or args.get("description")
    if isinstance(title, str) and title.strip(): return title.strip().split("\n")[0]
    if name in ("exec_command", "shell_command"):
        try: first = (args.get("cmd") or args.get("command") or "").strip().split("\n")[0]
        except (ValueError, AttributeError): pass
        first = re.sub(r"^rtk\s+", "", first)
        return "$ " + first.replace(HOME, "~")
    if name == "exec":
        # Codex wraps calls in JS orchestration: text(await tools.exec_command({cmd:"..."}))
        label = re.search(r'\b(?:description|title)\s*:\s*("(?:[^"\\]|\\.)*")', inp or "")
        if label:
            try: return json.loads(label.group(1)).strip().split("\n")[0]
            except ValueError: pass
        m = re.search(r'\bcmd\s*:\s*("(?:[^"\\]|\\.)*")', inp or "")
        if m:
            try: first = json.loads(m.group(1)).strip().split("\n")[0]
            except ValueError: pass
            first = re.sub(r"^rtk\s+", "", first)  # the RTK proxy prefix says nothing about the command
        else:
            t = re.search(r"\btools\.(\w+)\s*\(", inp or "")
            if t: return t.group(1)
        return "$ " + re.sub(r"^(cd\s+\S+\s*(&&|;)\s*)+", "", first).replace(HOME, "~")
    if name == "apply_patch":
        m = re.search(r"\*\*\* (?:Update|Add|Delete) File: (.+)", inp or "")
        return "edit " + os.path.basename(m.group(1).strip()) if m else "edit"
    return name or "?"

def plan_tasks(inp):
    """Codex update_plan snapshots use the same task rows as Claude's TodoWrite."""
    plan = inp.get("plan")
    if not isinstance(plan, list): return []
    return [{"id": str(i + 1), "title": t["step"].strip(), "doing": "",
             "status": t.get("status") if t.get("status") in ("pending", "in_progress", "completed") else "pending"}
            for i, t in enumerate(plan) if isinstance(t, dict) and isinstance(t.get("step"), str) and t["step"].strip()]

def output_text(p):
    o = p.get("output")
    if isinstance(o, list): return "\n".join(x.get("text", "") for x in o if isinstance(x, dict))
    return o if isinstance(o, str) else ""

def failed(text):
    codes = re.findall(r'(?i)(?:exit(?:ed with)? code\s+|"exit_code"\s*:\s*)(-?\d+)', text)
    return any(int(code) != 0 for code in codes) or "error" in text.strip().split("\n")[0].lower()

def parse(records, meta, now, seen=None):
    """seen: {task_name: last activity epoch} of sub-agents, from Codex's thread index (else their start counts)."""
    seen = dict(seen or {})
    calls, results, agents, answered = [], {}, [], {}
    turn = {"start": None, "end": None}
    usage = {"in": 0, "out": 0, "read": 0, "write": 0, "turns": 0, "ctx": 0, "window": 0,
             "model": "", "calls": 0, "errors": 0, "active": 0, "ts": None, "todos": []}
    limits, lim_id, done_at, last_at = None, None, None, None
    for d in records:
        p, ts = d.get("payload") or {}, d.get("timestamp")
        if ts: last_at = epoch(ts)
        kind = p.get("type") if isinstance(p, dict) else None
        if d.get("type") == "event_msg":
            if kind == "thread_settings_applied":
                usage["model"] = model_label((p.get("thread_settings") or {}).get("model"))
            elif kind == "task_started":
                turn, done_at, usage["turns"] = {"start": epoch(ts), "end": None}, None, usage["turns"] + 1
            elif kind in ("task_complete", "turn_aborted"):
                done_at = epoch(ts)
            elif kind == "token_count":
                info = p.get("info") or {}
                tot, last = info.get("total_token_usage") or {}, info.get("last_token_usage") or {}
                cached = tot.get("cached_input_tokens") or 0
                usage.update({"in": (tot.get("input_tokens") or 0) - cached, "read": cached,
                              "out": tot.get("output_tokens") or 0, "ctx": last.get("input_tokens") or 0,
                              "window": info.get("model_context_window") or 0, "ts": epoch(ts) or None})
                rl = p.get("rate_limits") or {}
                # a window past its reset is empty again, whatever the last report said
                win = lambda w: {"utilization": w.get("used_percent") if (w.get("resets_at") or 0) > now else 0,
                                 "resets_at": iso(w.get("resets_at"))} if w else None
                # other limits ("premium") report null windows or their own numbers: the codex limit wins
                rid = rl.get("limit_id")
                if (rl.get("primary") or rl.get("secondary")) and (lim_id != "codex" or rid in (None, "codex")):
                    limits, lim_id = {"five_hour": win(rl.get("primary")), "seven_day": win(rl.get("secondary"))}, rid
        elif d.get("type") == "turn_context":
            usage["model"] = model_label(p.get("model")) or usage["model"]
        elif d.get("type") == "response_item":
            if kind in ("custom_tool_call", "function_call"):
                name = p.get("name") or "?"
                if name == "update_plan":
                    try: inp = json.loads(p.get("arguments") or p.get("input") or "{}")
                    except (ValueError, TypeError): continue
                    if isinstance(inp, dict): usage["todos"] = plan_tasks(inp)
                    continue  # plans fill the task list, rather than replacing the activity line
                if name == "spawn_agent":
                    try: a = json.loads(p.get("arguments") or "{}")
                    except ValueError: a = {}
                    task = a.get("task_name") or "agent"
                    agents.append({"id": p.get("call_id") or task, "type": a.get("agent_type") or "agent", "name": task,
                                   "model": "", "started": epoch(ts), "updated": epoch(ts),
                                   "task": (a.get("message") or task).strip().split("\n")[0][:160]})
                    line = "spawn " + task
                else:
                    line = describe(name, p.get("input") if kind == "custom_tool_call" else p.get("arguments"))
                calls.append((p.get("call_id"), line[:160], ts))
            elif kind in ("custom_tool_call_output", "function_call_output"):
                results[p.get("call_id")] = failed(output_text(p))
            elif kind == "agent_message":
                name = (p.get("author") or "").rsplit("/", 1)[-1]
                content = p.get("content") or ""
                text = content if isinstance(content, str) else "\n".join(x.get("text", "") for x in content if isinstance(x, dict))
                seen[name] = max(seen.get(name) or 0, epoch(ts))
                if text.split("\n", 1)[0] == "Message Type: FINAL_ANSWER":
                    answered.setdefault(name, []).append(epoch(ts))
    # epoch seconds like scan.py's turn_span; still running: the last record so far
    if turn["start"]: turn["end"] = done_at or last_at
    if usage["ts"] and not usage["turns"]: usage["turns"] = 1  # a turn began before what we read
    acts = [{"line": line, "state": "run" if cid not in results else ("err" if results[cid] else "ok"), "at": ts}
            for cid, line, ts in calls]
    errors = sum(a["state"] == "err" for a in acts)
    usage.update({"calls": len(acts), "errors": errors})
    crew = []
    for a in agents:
        # only an answer after this spawn counts (task names get reused)
        at = next((t for t in answered.get(a["name"], []) if t >= a["started"]), None)
        lost = at is None and now - max(a["started"], seen.get(a["name"]) or 0) > STALE_S
        task = a.pop("task")
        crew.append({**a, "finished": at is not None or lost, "lost": lost, "updated": at or max(a["updated"], seen.get(a["name"]) or 0),
                     "count": 0, "errors": 0, "files": [], "step": None, "typical": None,
                     "recent": [{"line": task, "state": "ok" if at else "err" if lost else "run", "at": None}],
                     "usage": None if at or lost else {"active": max(1.0, now - a["started"])}})
    crew.sort(key=lambda a: (a["finished"], a["started"]))
    return {"brand": "codex", "turn": turn, "agents": crew, "crewTotal": 0, "jev": None, "limits": limits,
            "main": {"count": len(acts), "errors": errors, "files": [], "recent": acts[-6:], "step": None, "usage": usage}}

BACK = 8 * 1024 * 1024  # how far before the tail to look for the model and the current turn's start
WANT = ('"thread_settings_applied"', '"turn_context"', '"task_started"', '"update_plan"')

def before_tail(path, wanted=WANT):
    """Recover the latest model, turn and plan before the tail, bounded by BACK bytes."""
    try:
        size = os.path.getsize(path)
        if size <= TAIL: return []
        found, end = {}, size - TAIL
        with open(path, "rb") as f:
            while end > 0 and len(found) < len(wanted) and size - TAIL - end < BACK:
                start = max(0, end - 256 * 1024)
                f.seek(start); chunk = f.read(end - start + 4096).decode("utf-8", "replace")  # overlap: lines cut at chunk edges
                for line in reversed(chunk.split("\n")[1 if start else 0:]):
                    for w in wanted:
                        if w not in found and w in line:
                            try: record = json.loads(line)
                            except ValueError: pass
                            else:
                                p = record.get("payload") or {}
                                if w.strip('"') in (record.get("type"), p.get("type"), p.get("name")):
                                    found[w] = record
                end = start
    except OSError:
        return []
    return sorted(found.values(), key=lambda d: d.get("timestamp") or "")

def read_session(path, now, seen=None):
    recs = tail_records(path)
    kinds = {k for d in recs if isinstance(d.get("payload"), dict)
             for k in (d.get("type"), d["payload"].get("type"), d["payload"].get("name"))}
    wanted = [w for w in WANT if w.strip('"') not in kinds]
    if wanted: recs = before_tail(path, wanted) + recs
    return parse(recs, first_meta(path) or {}, now, seen)

def descendants(pid):
    """pid and every process under it (the terminal's pid may be the shell around codex)."""
    try: out = subprocess.run(["ps", "-Ao", "pid=,ppid="], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError): return [pid]
    kids = {}
    for line in out.split("\n"):
        parts = line.split()
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            kids.setdefault(int(parts[1]), []).append(int(parts[0]))
    seen, todo = [], [pid]
    while todo:
        p = todo.pop()
        if p in seen: continue
        seen.append(p); todo += kids.get(p, [])
    return seen

def open_rollout(pids, root):
    """The session file one of these processes holds open (exact match), via lsof."""
    if not pids: return None
    try:
        out = subprocess.run(["lsof", "-Fn", "-p", ",".join(map(str, pids))], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    base = os.path.realpath(root) + os.sep  # under the session root, wherever CODEX_HOME puts it
    hits = [os.path.realpath(l[1:]) for l in out.split("\n") if l.startswith("n") and ROLLOUT.search(l[1:])]
    hits = [h for h in hits if h.startswith(base)]
    # codex may hold its sub-agents' files too: the terminal's own session is the cli one without a parent
    return next((h for h in hits if terminal_session(first_meta(h) or {})), None)

def terminal_session(m):
    """A person's terminal session: the TUI (originator codex-tui; older versions: source cli, no originator),
    started by the user — not an auto-review (guardian_review), a sub-agent, Codex Desktop or `codex exec`."""
    tui = m.get("originator") == "codex-tui" or (not m.get("originator") and m.get("source") == "cli")
    return tui and m.get("thread_source", "user") == "user" and not m.get("parent_thread_id")

def newest_for_cwd(cwd, root, now):
    """Approximate: the newest session started in this folder, today or yesterday."""
    days = {time.strftime("%Y/%m/%d", time.localtime(now - d * 86400)) for d in (0, 1)}
    files = [f for d in days for f in glob.glob(os.path.join(root, d, "*.jsonl"))]
    for f in sorted(files, key=os.path.getmtime, reverse=True):
        m = first_meta(f) or {}
        # terminal sessions only: not Codex Desktop, `codex exec` or sub-agent threads
        if m.get("cwd") == cwd and terminal_session(m): return os.path.realpath(f)
    return None

def indexed_for_cwd(cwd, root, now):
    """Codex's own thread index (state_5.sqlite beside sessions/): finds resumed sessions in old day folders."""
    db = index_db(root)
    if not os.path.exists(db): return None
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=1)
        rows = con.execute("select rollout_path from threads where cwd = ? and archived = 0 and updated_at >= ? order by updated_at desc limit 20",
                           (cwd, int(now - 2 * 86400))).fetchall()
        con.close()
    except sqlite3.Error:
        return None  # ponytail: schema drift or a lock just falls back to the day folders
    # the session file's own first line says what kind of thread it is (the index columns vary by Codex version)
    return next((os.path.realpath(r[0]) for r in rows if r[0] and os.path.exists(r[0]) and terminal_session(first_meta(r[0]) or {})), None)

def index_db(root):
    return os.path.join(os.path.dirname(root.rstrip("/")), "state_5.sqlite")

def subagent_activity(sid, root):
    """{task_name: last update} for the sub-agent threads this session spawned (their own threads in the index)."""
    db = index_db(root)
    if not sid or not os.path.exists(db): return {}
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=1)
        rows = con.execute("select agent_path, updated_at from threads where source like ? and agent_path is not null",
                           (f'%"parent_thread_id":"{sid}"%',)).fetchall()
        con.close()
    except sqlite3.Error:
        return {}
    out = {}
    for path, at in rows:
        name = (path or "").rsplit("/", 1)[-1]
        if name: out[name] = max(out.get(name, 0), at or 0)
    return out

def find(pid, cwd, root):
    """(path, exact) for a terminal: the file its codex holds open, else the newest in its folder."""
    if pid:
        p = open_rollout(descendants(pid), root)
        if p: return p, True
    if not cwd: return None, False
    now = time.time()
    return (indexed_for_cwd(cwd, root, now) or newest_for_cwd(cwd, root, now)), False

def session(path, exact, now, root):
    meta = first_meta(path) or {}
    out = read_session(path, now, subagent_activity(meta.get("id"), root))
    return {**out, "id": meta.get("id") or os.path.basename(path)[:-6], "exact": exact, "updated": os.path.getmtime(path)}

if __name__ == "__main__":
    root = os.environ.get("CODEX_SESSIONS") or os.path.join(os.environ.get("CODEX_HOME") or os.path.join(HOME, ".codex"), "sessions")
    res, now = {}, time.time()
    for arg in sys.argv[1:]:
        key, pid, cwd = (arg.split("|", 2) + ["", ""])[:3]
        try:
            path, exact = find(int(pid) if pid.isdigit() else None, cwd, root)
            res[key] = session(path, exact, now, root) if path else None
        except Exception:  # one bad session must not blank every card
            res[key] = None
    print(json.dumps(res, separators=(",", ":")))
