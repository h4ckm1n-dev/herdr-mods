import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import cost

def line(id, ts, out, model="claude-opus-5-5", **u):
    usage = {"input_tokens": 10, "output_tokens": out, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0, **u}
    return json.dumps({"type": "assistant", "timestamp": ts, "cwd": "/x/proj", "message": {"id": id, "model": model, "usage": usage}}) + "\n"

class Cost(unittest.TestCase):
    def test_pricing(self):
        # opus 5.5: $4 in / $20 out / $0.20 read; 5m write 1.25x, 1h write 2x
        self.assertAlmostEqual(cost.cost("claude-opus-5-5", [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000]),
                               4 + 20 + 0.2 + 5 + 8)
        self.assertAlmostEqual(cost.cost("claude-sonnet-5-5", [1_000_000, 0, 0, 0, 0]), 2.0)
        self.assertAlmostEqual(cost.cost("claude-opus-4-8", [1_000_000, 0, 0, 0, 0]), 5.0)  # prefix falls to the generic opus row
        self.assertEqual(cost.family("claude-haiku-5-5"), "haiku")

    def test_dedupe_keeps_latest_and_resumes(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "s.jsonl")
            ts = "2026-11-06T12:00:00Z"
            day = cost.local_day(ts)
            open(f, "w").write(line("m1", ts, 5) + line("m1", ts, 50) + line("m2", ts, 100))
            cache = {}
            r = cost.report([(f, "p", False)], cache, day)
            # m1 counted once with its final 50 output tokens, m2 once: 20 in, 150 out
            self.assertAlmostEqual(r["today"], (20 * 4 + 150 * 20) / 1e6, places=4)
            # append a late duplicate line of m2 (and a partial line): only the delta counts
            open(f, "a").write(line("m2", ts, 300) + '{"partial')
            r = cost.report([(f, "p", False)], cache, day)
            self.assertAlmostEqual(r["today"], (20 * 4 + 350 * 20) / 1e6, places=4)
            self.assertEqual(r["projects"][0][0], "proj")

    def test_split_and_window(self):
        with tempfile.TemporaryDirectory() as d:
            m, s = os.path.join(d, "m.jsonl"), os.path.join(d, "s.jsonl")
            ts = "2026-11-06T12:00:00Z"; day = cost.local_day(ts)
            open(m, "w").write(line("a", ts, 1000) + line("old", "2026-10-01T12:00:00Z", 1000))
            open(s, "w").write(line("b", ts, 1000, model="claude-haiku-5-5"))
            r = cost.report([(m, "p", False), (s, "p", True)], {}, day)
            self.assertGreater(r["split"]["main"][0], r["split"]["sub"][0])
            self.assertAlmostEqual(r["today"], r["split"]["main"][0] + r["split"]["sub"][0], places=4)
            self.assertEqual(set(r["models"]), {"opus", "haiku"})
            self.assertAlmostEqual(r["week"], r["today"], places=4)  # the October message is outside the window

if __name__ == "__main__": unittest.main()
