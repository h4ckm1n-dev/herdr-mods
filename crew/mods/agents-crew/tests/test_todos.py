# python3 -I tests/test_todos.py — the session task list scan.py hands the sidebar
import importlib.util, os
spec = importlib.util.spec_from_file_location("scan", os.path.join(os.path.dirname(__file__), "..", "scan.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
t = m.todos([], "TodoWrite", {"todos": [{"content": "A", "status": "completed", "activeForm": "Doing A"}, {"content": "B", "status": "in_progress", "activeForm": "Doing B"}]})
assert [x["status"] for x in t] == ["completed", "in_progress"] and t[1]["doing"] == "Doing B"
t = m.todos([], "TaskCreate", {"subject": "X"}); t = m.todos(t, "TaskCreate", {"subject": "Y"})
t = m.todos(t, "TaskUpdate", {"taskId": "2", "status": "in_progress"})
assert t[1]["status"] == "in_progress" and t[0]["status"] == "pending"
t = m.todos(t, "TaskUpdate", {"taskId": "1", "status": "deleted"}); assert [x["title"] for x in t] == ["Y"]
# a stray non-object line or a bad timestamp is skipped, not a crash that blanks every card
import json, tempfile
fd, log = tempfile.mkstemp(suffix=".jsonl"); os.close(fd)
flow_call = {"type": "assistant", "timestamp": "2026-01-01T00:00:01Z", "message": {"content": [
    {"type": "tool_use", "id": "f1", "name": m.FLOW, "input": {"title": "T", "done": 1, "total": 2}}]}}
open(log, "w").write('[1]\n"x"\n' + json.dumps({"type": "user", "timestamp": 5, "message": {"content": "a"}}) + "\n"
                     + json.dumps({"type": "user", "timestamp": "2026-01-01T00:00:00Z", "message": {"content": "b"}}) + "\n"
                     + json.dumps(flow_call) + "\n")
recs = m.tail_lines(log); assert len(recs) == 3 and m.turn_span(recs) == (1767225600.0, 1767225601.0), recs
cache = {}; m.usage(log, cache); assert cache[log]["off"] == os.path.getsize(log) and cache[log]["flow"], cache
os.remove(log)
print("ok")
