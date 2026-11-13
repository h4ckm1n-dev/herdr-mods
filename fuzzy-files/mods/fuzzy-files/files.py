"""List files relative to this tab's cwd, without following directory symlinks."""
import json
import os
from pathlib import Path
import subprocess
import sys

LIMIT = 50000
SKIP = {".git", ".hg", ".svn", "node_modules", ".venv", "venv", "__pycache__"}


def listing(root):
    if not root.is_dir():
        raise ValueError("The tab's folder no longer exists")
    try:
        result = subprocess.run(["git", "-c", "core.fsmonitor=false", "ls-files", "-z",
                                 "--cached", "--others", "--exclude-standard", "--", "."],
                                cwd=root, capture_output=True, timeout=20, env={**os.environ, "LC_ALL": "C"})
    except FileNotFoundError:
        result = None
    if result is not None and result.returncode == 0:
        paths = {os.fsdecode(p) for p in result.stdout.split(b"\0") if p}
        files = sorted(p for p in paths if (root / p).is_file())
        return {"files": files[:LIMIT], "limited": len(files) > LIMIT}
    if result is not None and b"not a git repository" not in result.stderr:
        raise RuntimeError(result.stderr.decode(errors="replace").strip() or "Git could not list files")
    files = []
    def failed(error):
        raise error
    for folder, dirs, names in os.walk(root, onerror=failed):
        dirs[:] = sorted(d for d in dirs if d not in SKIP)
        for name in sorted(names):
            path = Path(folder) / name
            if path.is_file():
                if len(files) == LIMIT:
                    return {"files": sorted(files), "limited": True}
                files.append(str(path.relative_to(root)))
    return {"files": sorted(files), "limited": False}


if __name__ == "__main__":
    try:
        print(json.dumps(listing(Path.cwd())))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
