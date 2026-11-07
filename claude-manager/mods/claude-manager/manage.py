#!/usr/bin/env python3
"""Claude Code skills / agents / MCP servers, on or off, through Claude Code's own settings.

  manage.py list                      -> JSON {skills, agents, mcp}, each [{name, desc, on}]
  manage.py set skill|agent|mcp NAME on|off

Off is written to ~/.claude/settings.json, the native way for each kind (checked against
Claude Code 2.1.319: a fresh `claude -p` no longer lists the component):
  skill -> "skillOverrides": {NAME: "off"}          (on = key removed)
  agent -> "permissions.deny": ["Agent(NAME)"]       (on = rule removed; "Task(NAME)" too)
  mcp   -> "deniedMcpServers": [{"serverName": NAME}] (on = entry removed; denies it in every scope)
Nothing is moved or deleted: on puts settings.json back as it was. Each write is atomic
(temp file + rename) after a copy to settings.json.bak-claude-manager.
"""
import glob, json, os, re, shutil, sys, tempfile

HOME = os.path.expanduser("~")
CLAUDE = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude")
SETTINGS = os.path.join(CLAUDE, "settings.json")
STATE = os.path.join(HOME, ".claude.json")  # user-scope MCP servers live here


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def front(path):
    """name + one-line description from a SKILL.md / agent .md frontmatter."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read(8000)
    except OSError:
        return {}
    m = re.match(r"---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return {}
    out, lines = {}, m.group(1).split("\n")
    for i, line in enumerate(lines):
        k = re.match(r"(name|description):\s*(.*)$", line)
        if not k or k.group(1) in out:
            continue
        v = k.group(2).strip()
        if v in ("|", ">", "|-", ">-"):  # block scalar marker
            v = ""
        for l in lines[i + 1:]:  # block or multi-line plain scalar: the indented lines under it
            if l.strip() and not l.startswith((" ", "\t")):
                break
            v += " " + l.strip()
        v = " ".join(v.split())
        out[k.group(1)] = v.strip("\"'")[:240]
    return out


def deny_names(s):
    out = set()
    for r in s.get("permissions", {}).get("deny", []):
        m = re.fullmatch(r"(?:Agent|Task)\((.+)\)", r)
        if m:
            out.add(m.group(1))
    return out


def mcp_where(cfg):
    if cfg.get("url"):
        return f"{cfg.get('type', 'http')} · {re.sub(r'^[a-z]+://([^/]+).*$', r'\1', cfg['url'])}"
    cmd = cfg.get("command", "")
    return f"stdio · {os.path.basename(cmd)}" if cmd else cfg.get("type", "")
    # ponytail: never env / headers / args: they hold tokens


def listing():
    s = load(SETTINGS, {})
    over = s.get("skillOverrides", {})
    denied = deny_names(s)
    denied_mcp = {e.get("serverName") for e in s.get("deniedMcpServers", []) if isinstance(e, dict)}
    skills = []
    for p in glob.glob(os.path.join(CLAUDE, "skills", "*", "SKILL.md")):
        fm = front(p)
        name = os.path.basename(os.path.dirname(p))
        skills.append({"name": name, "desc": fm.get("description", ""), "on": over.get(name, "on") != "off",
                       "mode": over.get(name)})
    agents = []
    for p in glob.glob(os.path.join(CLAUDE, "agents", "**", "*.md"), recursive=True):
        fm = front(p)
        name = fm.get("name") or os.path.basename(p)[:-3]
        agents.append({"name": name, "desc": fm.get("description", ""), "on": name not in denied})
    mcp = [{"name": n, "desc": mcp_where(c if isinstance(c, dict) else {}), "on": n not in denied_mcp}
           for n, c in load(STATE, {}).get("mcpServers", {}).items()]
    key = lambda x: x["name"].lower()
    return {"skills": sorted(skills, key=key), "agents": sorted(agents, key=key), "mcp": sorted(mcp, key=key),
            "settings": SETTINGS}


def apply(s, kind, name, on):
    if kind == "skill":
        over = s.setdefault("skillOverrides", {})
        if on:
            over.pop(name, None)
        else:
            over[name] = "off"
        if not over:
            del s["skillOverrides"]
    elif kind == "agent":
        perms = s.setdefault("permissions", {})
        deny = [r for r in perms.get("deny", []) if r not in (f"Agent({name})", f"Task({name})")]
        if not on:
            deny.append(f"Agent({name})")
        if deny:
            perms["deny"] = deny
        else:
            perms.pop("deny", None)
        if not perms:
            del s["permissions"]
    elif kind == "mcp":
        lst = [e for e in s.get("deniedMcpServers", []) if e != {"serverName": name}]
        if not on:
            lst.append({"serverName": name})
        if lst:
            s["deniedMcpServers"] = lst
        else:
            s.pop("deniedMcpServers", None)
    else:
        raise ValueError(f"unknown kind {kind!r}")
    return s


def write_atomic(path, data):
    path = os.path.realpath(path)  # a symlinked settings.json keeps its link
    if os.path.exists(path):
        shutil.copy2(path, path + ".bak-claude-manager")
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".settings.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())
        if os.path.exists(path):
            os.chmod(tmp, os.stat(path).st_mode & 0o777)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise


def main(argv):
    if argv[:1] == ["list"]:
        print(json.dumps(listing()))
    elif len(argv) == 4 and argv[0] == "set" and argv[1] in ("skill", "agent", "mcp") and argv[3] in ("on", "off"):
        _, kind, name, state = argv
        if not name or len(name) > 200 or any(c in name for c in "()\n"):
            sys.exit(f"bad name {name!r}")
        s = load(SETTINGS, {})  # read right before writing: Claude Code writes this file too
        write_atomic(SETTINGS, apply(s, kind, name, state == "on"))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
