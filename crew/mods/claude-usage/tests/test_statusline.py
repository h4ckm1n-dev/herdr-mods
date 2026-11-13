import importlib.util, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("statusline", os.path.join(HERE, "statusline.py"))
sl = importlib.util.module_from_spec(spec); spec.loader.exec_module(sl)

with tempfile.TemporaryDirectory() as d:
    cache = os.path.join(d, "claude", "cache.json")
    # stdin schema: used_percentage + epoch resets_at -> utilization + ISO
    raw = json.dumps({"rate_limits": {"five_hour": {"used_percentage": 42, "resets_at": 0}, "seven_day": {"used_percentage": 7, "resets_at": 1763000000}}})
    assert sl.save(raw, cache)
    got = json.load(open(cache))
    assert got == {"five_hour": {"utilization": 42, "resets_at": "1970-01-01T00:00:00Z"},
                   "seven_day": {"utilization": 7, "resets_at": "2025-11-13T02:13:20Z"}}, got
    # no rate limits (API key, older Claude Code) or junk: cache left alone
    assert not sl.save(json.dumps({"model": {}}), cache) and not sl.save("not json", cache)
    assert json.load(open(cache)) == got

# wrapper: the wrapped command gets the same stdin, its output and exit code pass through
r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "statusline.py"), "cat; exit 3"], input='{"x":1}', text=True, capture_output=True)
assert r.stdout == '{"x":1}' and r.returncode == 3, r
print("ok")

# odd input never breaks the user's statusline: the wrapped command still runs
for bad in ['{"rate_limits":"x"}', '{"rate_limits":{"five_hour":{"used_percentage":5,"resets_at":1e20}}}', '{"rate_limits":{"five_hour":{"resets_at":1}}}']:
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "statusline.py"), "echo shown"], input=bad, text=True, capture_output=True)
    assert r.stdout == "shown\n" and r.returncode == 0, (bad, r)
print("ok odd input")
