import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import cost
from unittest.mock import patch

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

    def test_codex_tokens_by_day(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "2026", "11", "06"); os.makedirs(p)
            ev = lambda ts, tot: json.dumps({"timestamp": ts, "type": "event_msg", "payload": {"type": "token_count",
                "info": {"total_token_usage": {"total_tokens": tot}} if tot else None}}) + "\n"
            open(os.path.join(p, "rollout-x.jsonl"), "w").write(
                ev("2026-11-05T12:00:00Z", 100) + ev("2026-11-06T12:00:00Z", 100) + ev("2026-11-06T12:01:00Z", 0) + ev("2026-11-06T12:02:00Z", 250))
            r = cost.codex(cost.local_day("2026-11-06T12:00:00Z"), 0, root=d)
            self.assertEqual(r["today"], 150)   # the repeat and the rate-limit-only report add nothing
            self.assertEqual(r["week"], 250)
            self.assertEqual(len(r["days"]), 7)

    def test_codex_dollars(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "2026", "11", "06"); os.makedirs(p)
            ctx = json.dumps({"timestamp": "2026-11-06T12:00:00Z", "type": "turn_context", "payload": {"model": "gpt-6-astra"}}) + "\n"
            tc = lambda ts, i, c, o, last_in: json.dumps({"timestamp": ts, "type": "event_msg", "payload": {"type": "token_count", "info": {
                "total_token_usage": {"input_tokens": i, "cached_input_tokens": c, "output_tokens": o, "total_tokens": i + o},
                "last_token_usage": {"input_tokens": last_in}}}}) + "\n"
            # 1M in (400K cached) + 100K out at short rates, then a 300K-input request at long rates
            open(os.path.join(p, "rollout-y.jsonl"), "w").write(ctx + tc("2026-11-06T12:01:00Z", 1_000_000, 400_000, 100_000, 50_000)
                + tc("2026-11-06T12:02:00Z", 1_300_000, 400_000, 110_000, 300_000))
            r = cost.codex(cost.local_day("2026-11-06T12:00:00Z"), 0, root=d)
            short = (600_000 * 10 + 400_000 * 1 + 100_000 * 50) / 1e6
            long = (300_000 * 20 + 10_000 * 75) / 1e6
            self.assertAlmostEqual(r["usdToday"], short + long, places=4)
            self.assertEqual(r["cached"], round(100 * 400_000 / 1_300_000))  # cached share of all input
            self.assertAlmostEqual(cost.codex_cost("gpt-6.1-sol-2026", 1e6, 0, 0), 2.0)   # prefix match
            self.assertAlmostEqual(cost.codex_cost("mystery", 1e6, 0, 0), 2.0)            # unknown: Codex default

    def test_codex_auto_review_is_not_user_spend(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "2026", "11", "06"); os.makedirs(p)
            records = [
                {"type": "session_meta", "payload": {"thread_source": "guardian_review"}},
                {"timestamp": "2026-11-06T12:00:00Z", "type": "event_msg", "payload": {"type": "token_count", "info": {
                    "total_token_usage": {"total_tokens": 1000, "input_tokens": 900, "output_tokens": 100}}}},
            ]
            with open(os.path.join(p, "rollout-review.jsonl"), "w") as f:
                f.write("\n".join(map(json.dumps, records)) + "\n")
            r = cost.codex(cost.local_day("2026-11-06T12:00:00Z"), 0, root=d)
            self.assertEqual((r["today"], r["usdToday"]), (0, 0))

    def test_last_hour_and_rate(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "s.jsonl")
            now = cost.epoch("2026-11-06T12:30:00Z")
            # 3h ago (counts in the day, not the last hour), 20 min ago, and a repeat of that message with more output
            open(f, "w").write(line("a", "2026-11-06T09:30:00Z", 50_000) + line("b", "2026-11-06T12:10:00Z", 10_000)
                               + line("b", "2026-11-06T12:10:00Z", 100_000))
            day = cost.local_day("2026-11-06T12:30:00Z")
            with patch.object(cost.time, "time", return_value=now):
                r = cost.report([(f, "p", False)], {}, day, now=now)
            b = cost.cost("claude-opus-5-5", [10, 100_000, 0, 0, 0])
            self.assertAlmostEqual(r["lastHour"], b, places=4)   # only b, counted once with its final usage
            self.assertGreater(r["perHour"], 0)
            self.assertLessEqual(r["perHour"], r["today"])
            self.assertEqual(r["cached"], {"opus": 0})  # no cache reads in these lines

    def test_top_session_includes_its_subagents(self):
        with tempfile.TemporaryDirectory() as d:
            ts = "2026-11-06T12:00:00Z"
            a, b = os.path.join(d, "A.jsonl"), os.path.join(d, "B.jsonl")
            os.makedirs(os.path.join(d, "A", "subagents")); sa = os.path.join(d, "A", "subagents", "x.jsonl")
            open(a, "w").write(json.dumps({"type": "ai-title", "aiTitle": "Fix login"}) + "\n" + line("a1", ts, 1000))
            open(sa, "w").write(line("s1", ts, 3000))
            open(b, "w").write(json.dumps({"type": "custom-title", "customTitle": "Big one"}) + "\n" + line("b1", ts, 3500))
            r = cost.report([(a, "p", False), (sa, "p", True), (b, "p", False)], {}, cost.local_day(ts), now=cost.epoch(ts))
            self.assertEqual(r["topSession"]["title"], "Fix login")   # 1000 + 3000 from its subagent beats 3500
            self.assertAlmostEqual(r["topSession"]["usd"], cost.cost("claude-opus-5-5", [20, 4000, 0, 0, 0]), places=4)

    def test_today_adds_codex(self):
        res = {"today": 10.0, "lastHour": 2.0, "firstToday": 1000.0, "perHour": 0}
        cx = {"usdToday": 5.0, "usdLastHour": 1.0, "firstToday": 1000.0 - 3600}
        r = cost.merge_codex(res, cx, now=1000.0 + 3600)
        self.assertEqual((r["today"], r["claudeToday"], r["lastHour"]), (15.0, 10.0, 3.0))
        self.assertAlmostEqual(r["perHour"], 7.5)   # 15 over the 2 hours since Codex's first call

    def test_cache_share(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "s.jsonl"); ts = "2026-11-06T12:00:00Z"
            open(f, "w").write(line("a", ts, 5, cache_read_input_tokens=90))  # 10 fresh in + 90 read
            r = cost.report([(f, "p", False)], {}, cost.local_day(ts), now=cost.epoch(ts))
            self.assertEqual(r["cached"], {"opus": 90})

if __name__ == "__main__": unittest.main()
