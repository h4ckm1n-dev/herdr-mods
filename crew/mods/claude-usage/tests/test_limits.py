import importlib.util, json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("limits", Path(__file__).parents[1] / "limits.py")
limits = importlib.util.module_from_spec(spec); spec.loader.exec_module(limits)


class Limits(unittest.TestCase):
    def test_report_time_wins_over_file_mtime(self):
        with tempfile.TemporaryDirectory() as root:
            day = Path(root) / "2026/11/08"; day.mkdir(parents=True)
            for name, stamp, used, mtime in [("old", "2026-11-08T10:00:00Z", 10, 200), ("new", "2026-11-08T11:00:00Z", 20, 100)]:
                f = day / f"rollout-{name}.jsonl"
                f.write_text(json.dumps({"timestamp": stamp, "payload": {"rate_limits": {"limit_id": "codex", "primary": {"used_percent": used, "resets_at": 2000}}}}) + "\n")
                os.utime(f, (mtime, mtime))
            with patch.object(limits, "CODEX", root):
                out = limits.codex(1000)
                self.assertEqual(out["five_hour"]["utilization"], 20)
                self.assertIsNone(out["seven_day"])
                self.assertEqual(limits.codex(3000)["five_hour"]["utilization"], 0)

    def test_custom_codex_home(self):
        with patch.dict(os.environ, {"CODEX_HOME": "/custom/codex"}):
            with patch.dict(os.environ):
                os.environ.pop("CODEX_SESSIONS", None)
                spec.loader.exec_module(limits)
                self.assertEqual(limits.CODEX, "/custom/codex/sessions")
        spec.loader.exec_module(limits)


if __name__ == "__main__": unittest.main()
