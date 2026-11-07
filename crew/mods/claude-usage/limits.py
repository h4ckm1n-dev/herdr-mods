#!/usr/bin/env python3
"""5h / 7d quota windows for Claude Code and Codex, as JSON:
{"claude": {"five_hour": {...}, "seven_day": {...}} | null, "codex": ... | null}
Each window: {"utilization": percent, "resets_at": ISO UTC}. Local files only, nothing fetched.
- Claude: the cache the Claude Code statusline writes (/tmp/claude/statusline-usage-cache.json).
- Codex: the newest `rate_limits` in ~/.codex/sessions rollouts (Codex reports them with token counts)."""
import glob, json, os, sys, time
from datetime import datetime, timezone

CLAUDE_CACHE = "/tmp/claude/statusline-usage-cache.json"
CODEX = os.path.join(os.path.expanduser("~"), ".codex", "sessions")
TAIL = 512 * 1024  # bytes read from the end of a rollout: rate limits ride on every token count

def claude():
    try:
        with open(CLAUDE_CACHE) as f: d = json.load(f)
        return {k: d[k] for k in ("five_hour", "seven_day") if d.get(k)} or None
    except (OSError, ValueError): return None

def iso(epoch): return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if epoch else None

def codex(now):
    files = sorted(glob.glob(os.path.join(CODEX, "*", "*", "*", "rollout-*.jsonl")), key=os.path.getmtime, reverse=True)
    for path in files[:5]:  # ponytail: newest 5 sessions; the latest report is in the newest one that has any
        try:
            with open(path, "rb") as f:
                f.seek(max(0, os.path.getsize(path) - TAIL)); lines = f.read().decode("utf-8", "replace").splitlines()
        except OSError: continue
        for line in reversed(lines):
            if '"rate_limits"' not in line: continue
            try: rl = (json.loads(line).get("payload") or {}).get("rate_limits") or {}
            except ValueError: continue
            if rl.get("limit_id") not in (None, "codex") or not (rl.get("primary") or rl.get("secondary")): continue
            # a window past its reset is empty again, whatever the last report said
            win = lambda w: {"utilization": w.get("used_percent") if (w.get("resets_at") or 0) > now else 0,
                             "resets_at": iso(w.get("resets_at"))} if w else None
            return {"five_hour": win(rl.get("primary")), "seven_day": win(rl.get("secondary"))}
    return None

if __name__ == "__main__":
    print(json.dumps({"claude": claude(), "codex": codex(time.time())}))
