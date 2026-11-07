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
print("ok")
