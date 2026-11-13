import importlib.util, json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("codex_scan", Path(__file__).parents[1] / "codex_scan.py")
scan = importlib.util.module_from_spec(spec); spec.loader.exec_module(scan)


class Codex(unittest.TestCase):
    def test_commands_and_errors(self):
        self.assertEqual(scan.describe("exec_command", '{"cmd":"git status"}'), "$ git status")
        self.assertEqual(scan.describe("exec_command", '{"cmd":"rtk git status"}'), "$ git status")
        self.assertEqual(scan.describe("js", '{"code":"await app.getScreenshot()", "title":"Inspect agent cards"}'), "Inspect agent cards")
        self.assertEqual(scan.describe("exec", 'await tools.example({title: "Inspect agent cards"})'), "Inspect agent cards")
        for output in ('Process exited with code 1', '{"exit_code":2}', 'exit code 0\nexit code 3'):
            self.assertTrue(scan.failed(output))
        self.assertFalse(scan.failed('{"exit_code":0}'))

    def test_model_context_and_completed_call(self):
        records = [
            {"type": "turn_context", "payload": {"model": "gpt-6.1-sol"}},
            {"type": "response_item", "payload": {"type": "function_call", "name": "exec_command", "call_id": "x", "arguments": '{"cmd":"false"}'}},
            {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "x", "output": "Process exited with code 1"}},
        ]
        out = scan.parse(records, {}, 1000)["main"]
        self.assertEqual(out["usage"]["model"], "GPT-6.1 Sol")
        self.assertEqual(out["recent"][0]["state"], "err")

    def test_plan_uses_claude_task_shape_and_keeps_activity(self):
        def plan(items):
            return {"type": "response_item", "payload": {"type": "function_call", "name": "update_plan", "arguments": json.dumps({"plan": items})}}
        records = [
            {"type": "response_item", "payload": {"type": "function_call", "name": "exec_command", "arguments": '{"cmd":"git status"}'}},
            plan([{"step": "Inspect", "status": "in_progress"}]),
            plan([{"step": "Inspect", "status": "completed"}, {"step": "Match cards", "status": "in_progress"}]),
        ]
        out = scan.parse(records, {}, 1000)["main"]
        self.assertEqual(out["usage"]["todos"], [
            {"id": "1", "title": "Inspect", "doing": "", "status": "completed"},
            {"id": "2", "title": "Match cards", "doing": "", "status": "in_progress"},
        ])
        self.assertEqual(out["recent"][-1]["line"], "$ git status")
        self.assertEqual(out["count"], 1)
        self.assertEqual(scan.plan_tasks({"plan": [None, {"step": 123}, {"step": ""}]}), [])
        self.assertEqual(scan.plan_tasks({"plan": None}), [])

    def test_subagent_open_file_is_not_exact_terminal_match(self):
        with tempfile.TemporaryDirectory() as root:
            f = Path(root) / "rollout-child.jsonl"
            f.write_text(json.dumps({"type": "session_meta", "payload": {"originator": "codex-tui", "parent_thread_id": "parent"}}) + "\n")
            with patch.object(scan.subprocess, "run") as run:
                run.return_value.stdout = "n" + str(f) + "\n"
                self.assertIsNone(scan.open_rollout([123], root))

    def test_subagent_progress_is_not_completion(self):
        records = [{"timestamp": "2026-11-08T10:00:00Z", "type": "response_item", "payload": {
            "type": "function_call", "name": "spawn_agent", "call_id": "s", "arguments": '{"task_name":"worker"}'}}]
        def message(kind, ts):
            return {"timestamp": ts, "type": "response_item", "payload": {"type": "agent_message", "author": "/root/worker",
                "content": [{"type": "input_text", "text": "Message Type: " + kind + "\nPayload: status"}]}}
        records.append(message("MESSAGE", "2026-11-08T10:20:00Z"))
        now = scan.epoch("2026-11-08T10:21:00Z")
        sub = scan.parse(records, {}, now)["agents"][0]
        self.assertFalse(sub["finished"])
        self.assertFalse(sub["lost"])
        records.append(message("FINAL_ANSWER", "2026-11-08T10:21:00Z"))
        self.assertTrue(scan.parse(records, {}, now)["agents"][0]["finished"])

    def test_model_before_large_tail(self):
        with tempfile.TemporaryDirectory() as root:
            f = Path(root) / "rollout-model.jsonl"
            f.write_text(json.dumps({"type": "turn_context", "payload": {"model": "gpt-6-astra"}}) + "\n" + "{}\n" * 100)
            with patch.object(scan, "TAIL", 100):
                self.assertEqual(scan.read_session(f, 1000)["main"]["usage"]["model"], "GPT-6 Astra")

    def test_plan_survives_large_tool_output(self):
        with tempfile.TemporaryDirectory() as root:
            f = Path(root) / "rollout-plan.jsonl"
            record = {"type": "response_item", "payload": {"type": "function_call", "name": "update_plan", "arguments":
                json.dumps({"plan": [{"step": "Match cards", "status": "in_progress"}]})}}
            f.write_text(json.dumps(record) + "\n" + "{}\n" * 100)
            with patch.object(scan, "TAIL", 100):
                tasks = scan.read_session(f, 1000)["main"]["usage"]["todos"]
                self.assertEqual(tasks[0]["title"], "Match cards")


if __name__ == "__main__": unittest.main()
