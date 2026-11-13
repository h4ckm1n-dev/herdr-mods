#!/usr/bin/env python3
"""Claude Code statusline wrapper: keeps the cache limits.py reads, then runs your own statusline.

Claude Code hands its 5h / 7d rate limits (Pro and Max plans) only to the statusline command, on
stdin. This saves them to /tmp/claude/statusline-usage-cache.json and pipes the same input to the
command you give it, whose output is what Claude Code shows. install.sh wires it; by hand:
  "statusLine": {"type": "command", "command": "python3 -I <this file> '<your statusline command>'"}
Without a command it prints nothing."""
import json, os, subprocess, sys, tempfile
from datetime import datetime, timezone

CACHE = "/tmp/claude/statusline-usage-cache.json"


def window(w):
    # the stdin schema says used_percentage and an epoch; the cache keeps limits.py's utilization + ISO
    pct = w.get("used_percentage", w.get("utilization"))
    if not isinstance(pct, (int, float)): return None  # no figure: the bar hides that window
    at = w.get("resets_at")
    if isinstance(at, (int, float)): at = datetime.fromtimestamp(at, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"utilization": pct, "resets_at": at}


def save(raw, path=CACHE):
    try: rl = json.loads(raw).get("rate_limits") or {}
    except (ValueError, AttributeError): return False
    if not isinstance(rl, dict): return False
    out = {k: w for k in ("five_hour", "seven_day") if isinstance(rl.get(k), dict) and (w := window(rl[k]))}
    if not out: return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w") as f: json.dump(out, f)
    os.replace(tmp, path)
    return True


if __name__ == "__main__":
    raw = sys.stdin.read()
    try: save(raw)
    except Exception: pass  # a statusline never fails over a cache: odd input or a full disk stays silent
    if len(sys.argv) > 1:
        sys.exit(subprocess.run(["sh", "-c", sys.argv[1]], input=raw, text=True).returncode)
