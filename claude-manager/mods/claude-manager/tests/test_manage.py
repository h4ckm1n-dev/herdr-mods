# python3 -I tests/test_manage.py : off then on puts settings.json back byte for byte
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
home = tempfile.mkdtemp()
cfg = os.path.join(home, ".claude")
os.makedirs(os.path.join(cfg, "skills", "demo"))
os.makedirs(os.path.join(cfg, "agents"))
open(os.path.join(cfg, "skills", "demo", "SKILL.md"), "w").write("---\nname: demo\ndescription: |\n  A demo\n  skill.\nother: x\n---\nbody")
open(os.path.join(cfg, "agents", "helper.md"), "w").write("---\nname: helper\ndescription: Helps.\n---\n")
json.dump({"mcpServers": {"srv": {"command": "/usr/bin/srv", "env": {"TOKEN": "secret"}}}}, open(os.path.join(home, ".claude.json"), "w"))
orig = json.dumps({"permissions": {"allow": ["Read"], "deny": ["Bash(rm *)"]}, "model": "opus"}, indent=2) + "\n"
S = os.path.join(cfg, "settings.json")
open(S, "w").write(orig)
env = {**os.environ, "HOME": home, "CLAUDE_CONFIG_DIR": cfg}
run = lambda *a: subprocess.run([sys.executable, "-I", os.path.join(HERE, "manage.py"), *a], env=env, capture_output=True, text=True, check=True).stdout
state = lambda: {k: {x["name"]: x["on"] for x in v} for k, v in json.loads(run("list")).items() if k != "settings"}

assert state() == {"skills": {"demo": True}, "agents": {"helper": True}, "mcp": {"srv": True}}
L = json.loads(run("list"))
assert L["skills"][0]["desc"] == "A demo skill.", L["skills"][0]
assert "secret" not in json.dumps(L) and L["mcp"][0]["desc"] == "stdio · srv"
for kind, name in [("skill", "demo"), ("agent", "helper"), ("mcp", "srv")]:
    run("set", kind, name, "off")
s = json.load(open(S))
assert s["skillOverrides"] == {"demo": "off"} and "Agent(helper)" in s["permissions"]["deny"] and s["deniedMcpServers"] == [{"serverName": "srv"}]
assert state() == {"skills": {"demo": False}, "agents": {"helper": False}, "mcp": {"srv": False}}
assert open(S + ".bak-claude-manager").read() != orig  # backup = state before the last write
run("set", "agent", "helper", "off")  # idempotent: no duplicate rule
assert json.load(open(S))["permissions"]["deny"].count("Agent(helper)") == 1
for kind, name in [("skill", "demo"), ("agent", "helper"), ("mcp", "srv")]:
    run("set", kind, name, "on")
assert open(S).read() == orig, open(S).read()
bad = subprocess.run([sys.executable, "-I", os.path.join(HERE, "manage.py"), "set", "agent", "x)", "off"], env=env, capture_output=True)
assert bad.returncode != 0 and open(S).read() == orig
print("ok")
