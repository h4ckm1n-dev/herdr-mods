#!/usr/bin/env python3
"""5h / 7d quota windows for Claude Code and Codex, as JSON:
{"claude": {"five_hour": {...}, "seven_day": {...}} | null, "codex": ... | null}
Each window: {"utilization": percent, "resets_at": ISO UTC}. Local files only, nothing fetched.
- Claude: the cache the Claude Code statusline writes (/tmp/claude/statusline-usage-cache.json).
- Codex: the newest `rate_limits` in ~/.codex/sessions rollouts (Codex reports them with token counts)."""
import glob, json, os, sys, time
from datetime import datetime, timezone

CLAUDE_CACHE = "/tmp/claude/statusline-usage-cache.json"
CODEX = os.environ.get("CODEX_SESSIONS") or os.path.join(os.environ.get("CODEX_HOME") or os.path.join(os.path.expanduser("~"), ".codex"), "sessions")
TAIL = 512 * 1024  # bytes read from the end of a rollout: rate limits ride on every token count

def claude(now=None):
    try:
        with open(CLAUDE_CACHE) as f: d = json.load(f)
    except (OSError, ValueError): return None
    if not isinstance(d, dict): return None
    now = time.time() if now is None else now
    def win(w):  # like Codex's: a window past its reset is empty again, whatever the cache last said
        try: past = datetime.fromisoformat(str(w.get("resets_at")).replace("Z", "+00:00")).timestamp() <= now
        except ValueError: past = False
        return {**w, "utilization": 0} if past else w
    return {k: win(d[k]) for k in ("five_hour", "seven_day") if isinstance(d.get(k), dict)} or None

def iso(epoch): return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if epoch else None

def codex(now):
    files = sorted(glob.glob(os.path.join(CODEX, "*", "*", "*", "rollout-*.jsonl")), key=os.path.getmtime, reverse=True)
    latest, result = float("-inf"), None
    for path in files[:5]:  # shortcut: inspect five recently touched sessions; widen if reports fall outside this set
        try:
            with open(path, "rb") as f:
                f.seek(max(0, os.path.getsize(path) - TAIL)); lines = f.read().decode("utf-8", "replace").splitlines()
        except OSError: continue
        for line in reversed(lines):
            if '"rate_limits"' not in line: continue
            try:
                record = json.loads(line)
                rl = (record.get("payload") or {}).get("rate_limits") or {}
            except ValueError: continue
            if rl.get("limit_id") not in (None, "codex") or not (rl.get("primary") or rl.get("secondary")): continue
            # a window past its reset is empty again, whatever the last report said
            win = lambda w: {"utilization": w.get("used_percent") if (w.get("resets_at") or 0) > now else 0,
                             "resets_at": iso(w.get("resets_at"))} if w else None
            try: stamp = datetime.fromisoformat((record.get("timestamp") or "").replace("Z", "+00:00")).timestamp()
            except ValueError: continue
            if stamp > latest:
                latest, result = stamp, {"five_hour": win(rl.get("primary")), "seven_day": win(rl.get("secondary"))}
            break
    return result

if __name__ == "__main__":
    print(json.dumps({"claude": claude(), "codex": codex(time.time())}))
