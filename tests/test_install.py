"""The installer's move from the old crew layout to OhMyHerdr, in throwaway homes.

Run from the repo: python3 -m unittest tests/test_install.py
herdr-app is kept off PATH so nothing reaches a running window: the installer then takes the
"Herdr closed" path and edits shared.json itself.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
OLD = json.dumps({"id": "root", "type": "row", "children": []})


class Migration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.home, self.claude, tools = root / "home", root / "claude", root / "bin"
        (self.home / "layouts/.state").mkdir(parents=True)
        tools.mkdir()
        (tools / "python3").symlink_to(sys.executable)  # PATH without herdr-app
        self.env = {**os.environ, "HERDR_APP_HOME": str(self.home), "CLAUDE_CONFIG_DIR": str(self.claude),
                    "PATH": f"{tools}:/usr/bin:/bin"}

    def old_home(self):
        (self.home / "layouts/crew.json").write_text(OLD)
        (self.home / "layouts/.state/crew.json").write_text('{"theme": {"dark": "Catppuccin Mocha"}}')
        (self.home / "shared.json").write_text('{"layout": "crew", "other": 1}')
        (self.home / "keys.json").write_text('{"layout:crew": {"cmd-shift-z": "my.own"}}')

    def install(self, *mods):
        r = subprocess.run(["sh", str(REPO / "install.sh"), *mods, "-y"], cwd=REPO, env=self.env,
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r.stdout

    def test_update_touches_only_what_is_installed_and_skips_disabled(self):
        self.install("help-crew", "picker-crew")
        (self.home / "disabled-mods/picker-crew").mkdir(parents=True)  # as OhMyHerdr Mods leaves it
        (self.home / "mods/help-crew/main.js").write_text("stale")
        (self.home / "mods/picker-crew/main.js").write_text("stand-in")
        out = self.install("--update")
        self.assertIn("~ help-crew", out)
        self.assertIn("skipped", out)
        self.assertEqual((self.home / "mods/picker-crew/main.js").read_text(), "stand-in")
        self.assertEqual(sorted(p.name for p in (self.home / "mods").iterdir()), ["help-crew", "picker-crew"])

    def test_broken_keys_json_stops_before_anything_is_copied(self):
        (self.home / "keys.json").write_text("{ not json")
        r = subprocess.run(["sh", str(REPO / "install.sh"), "help-crew", "-y"], cwd=REPO, env=self.env,
                           capture_output=True, text=True, timeout=120)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Nothing was installed", r.stderr)
        self.assertFalse((self.home / "mods").exists())

    def test_object_bindings_of_yours_do_not_break_the_install(self):
        (self.home / "keys.json").write_text(json.dumps({"global": {"cmd-y": {"command": "tab.new", "args": {"name": "x"}}}}))
        out = self.install("help-crew")
        self.assertIn("+ help-crew", out)
        self.assertEqual(self.read("keys.json")["global"]["cmd-y"], {"command": "tab.new", "args": {"name": "x"}})

    def test_ends_with_the_keys_and_the_layout_step(self):
        out = self.install("files-crew")
        self.assertIn("Keys:", out)
        self.assertIn("cmd-e", out)
        self.assertIn("pick OhMyHerdr in Settings > Layout", out)
        self.assertIn("not on your PATH", out)

    def read(self, name):
        return json.loads((self.home / name).read_text())

    def test_old_layout_moves_with_its_keys_and_clicks(self):
        self.old_home()
        out = self.install("files-crew")  # a layout mod: the layout comes too
        self.assertIn("switched to the OhMyHerdr layout", out)
        self.assertEqual(self.read("shared.json"), {"layout": "OhMyHerdr", "other": 1})
        self.assertFalse((self.home / "layouts/crew.json").exists())
        self.assertTrue(list(self.home.glob("backup/*/layouts/crew.json")))
        self.assertTrue((self.home / "layouts/OhMyHerdr.png").is_file())
        self.assertEqual(self.read("layouts/.state/OhMyHerdr.json")["theme"]["dark"], "Catppuccin Mocha")
        keys = self.read("keys.json")
        self.assertNotIn("layout:crew", keys)
        self.assertEqual(keys["layout:OhMyHerdr"]["cmd-shift-z"], "my.own")
        again = self.install("files-crew")
        self.assertNotIn("switched", again)
        self.assertEqual(self.read("keys.json"), keys)

    def test_a_mod_without_the_layout_leaves_crew_alone(self):
        self.old_home()
        self.install("git")
        self.assertTrue((self.home / "layouts/crew.json").exists())
        self.assertEqual(self.read("shared.json")["layout"], "crew")
        self.assertEqual(self.read("keys.json")["layout:crew"]["cmd-shift-z"], "my.own")
        self.assertNotIn("layout:OhMyHerdr", self.read("keys.json"))

    def test_open_herdr_out_of_reach_keeps_crew(self):
        self.old_home()
        (self.home / "herdr-app.sock").write_text("")  # Herdr running, no herdr-app to ask
        out = self.install("files-crew")
        self.assertIn("pick OhMyHerdr in Settings > Layout", out)
        self.assertTrue((self.home / "layouts/crew.json").exists())
        self.assertEqual(self.read("shared.json")["layout"], "crew")
        self.assertIn("layout:crew", self.read("keys.json"))

    def test_keys_take_over_what_they_replace_and_respect_your_own(self):
        # Herdr seeds keys.json with its defaults; you moved the theme gallery to another key
        (self.home / "keys.json").write_text(json.dumps({"global": {
            "cmd-/": "app.help", "cmd-shift-/": "app.help", "cmd-shift-t": "my.own",
            "cmd-alt-t": "mod.open:theme-gallery"}}))
        r = subprocess.run(["sh", str(REPO / "install.sh"), "help-crew", "theme-gallery"], cwd=REPO, env=self.env,
                           stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)  # no TTY: defaults
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        g = self.read("keys.json")["global"]
        self.assertEqual((g["cmd-/"], g["cmd-shift-/"]), ("mod.open:help-crew", "mod.open:help-crew"))
        self.assertEqual((g["cmd-shift-t"], g["cmd-alt-t"]), ("my.own", "mod.open:theme-gallery"))


if __name__ == "__main__":
    unittest.main()
