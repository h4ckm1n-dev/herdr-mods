# python3 -I tests/test_recap.py : a made-up transcript comes back as folders, files and marks
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = tempfile.mkdtemp()
proj = os.path.join(cfg, "projects", "-work-app")
os.makedirs(os.path.join(proj, "abcd1234-0000", "subagents"))
use = lambda ts, name, path: {"type": "assistant", "timestamp": ts, "cwd": "/work/app",
                             "message": {"content": [{"type": "tool_use", "name": name, "input": {"file_path": path}}]}}
main = [
    {"type": "user", "cwd": "/work/app", "isMeta": True, "message": {"content": "<local-command-caveat>x"}},
    {"type": "user", "cwd": "/work/app", "message": {"content": "fix the\nparser"}},
    use("2026-01-01T10:00:00Z", "Read", "/work/app/src/a.py"),
    use("2026-01-01T10:00:30Z", "Edit", "/work/app/src/a.py"),
    {"type": "api-request-blob", "message": [{"type": "tool_use", "name": "Read", "input": {"file_path": "/work/app/replay.py"}}]},
    use("2026-01-01T10:00:45Z", "Bash", "/work/app/ignored"),
    use("2026-01-01T18:00:00Z", "Write", "/work/app/tests/t.py"),   # eight hours later: counts as one gap
    use("2026-01-01T18:00:30Z", "Read", "/elsewhere/notes.md"),
    {"type": "ai-title", "aiTitle": "Fix the parser"},
]
open(os.path.join(proj, "abcd1234-0000.jsonl"), "w").write("\n".join(json.dumps(r) for r in main) + "\nnot json\n")
open(os.path.join(proj, "abcd1234-0000", "subagents", "agent-1.jsonl"), "w").write(json.dumps(use("2026-01-01T10:00:10Z", "Read", "/work/app/src/b.py")) + "\n")
env = {**os.environ, "CLAUDE_CONFIG_DIR": cfg}
run = lambda *a: subprocess.run([sys.executable, "-I", os.path.join(HERE, "recap.py"), *a], env=env, capture_output=True, text=True)

l = json.loads(run("list").stdout)
assert [(s["id"], s["project"], s["title"]) for s in l] == [("abcd1234-0000", "app", "Fix the parser")], l
d = json.loads(run("show", "abcd1234-0000").stdout)
assert (d["files"], d["reads"], d["writes"]) == (4, 3, 2), d
assert [g["dir"] for g in d["groups"]] == ["src", "tests", "/elsewhere"], [g["dir"] for g in d["groups"]]
src = d["groups"][0]["files"]
assert [f["name"] for f in src] == ["a.py", "b.py"] and src[0]["marks"] == [[0.0, "r"], [0.154, "w"]], src
# 45 s of work, a capped 120 s pause, 30 s more: the write after the pause sits at 165/195, not at the far right
assert d["groups"][1]["files"][0]["marks"] == [[0.846, "w"]], d["groups"][1]
# a shell command names no file: it is counted and placed in time, on its own row (45 s into 195 s of work)
assert d["shell"] == {"count": 1, "marks": [0.231]}, d["shell"]
assert d["ticks"][0]["x"] == 0 and d["ticks"][-1]["x"] == 1 and len(d["ticks"][0]["label"]) == 5
assert run("show", "../etc/passwd").returncode != 0 and run("show", "ffffffff-none").returncode != 0
print("ok")
