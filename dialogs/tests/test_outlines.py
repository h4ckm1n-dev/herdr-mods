import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

source = Path(__file__).resolve().parents[2] / "crew/mods/workspace-chrome-crew/dialog_outlines.py"
spec = importlib.util.spec_from_file_location("outlines", source)
outlines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(outlines)


class OutlineTests(unittest.TestCase):
    def test_apply_is_idempotent_and_restore_preserves_later_edits(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            originals = {}
            for rel in ("mods/prompt/main.js", "frame/settings/main.js", "mods/menu/main.js"):
                path = home / rel
                path.parent.mkdir(parents=True)
                text = "export default class Dialog extends View { render() { return div(); } }\n"
                path.write_text(text)
                originals[rel] = text
            self.assertEqual(len(outlines.apply(home)), 2)
            self.assertEqual(outlines.apply(home), [])
            self.assertEqual((home / "mods/menu/main.js").read_text(), originals["mods/menu/main.js"])
            edited = home / "mods/prompt/main.js"
            edited.write_text(edited.read_text() + "// user edit\n")
            self.assertEqual(outlines.restore(home), ["mods/prompt/main.js"])
            self.assertTrue(edited.read_text().endswith("// user edit\n"))
            self.assertEqual((home / "frame/settings/main.js").read_text(), originals["frame/settings/main.js"])

    def test_unknown_exports_are_preserved(self):
        with self.assertRaises(ValueError):
            outlines.outlined("export default function unknown() {}")

    def test_decorator_upgrade_preserves_edits_to_the_original_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            path = home / "mods/prompt/main.js"
            path.parent.mkdir(parents=True)
            original = "export default class Dialog extends View { render() { return div(); } }\n"
            path.write_text(original)
            outlines.apply(home)
            path.write_text("// user edit\n" + path.read_text())
            real = outlines.outlined
            with patch.object(outlines, "outlined", side_effect=lambda s: real(s).replace("return el.rounded", "/* v2 */ return el.rounded")):
                outlines.apply(home)
            self.assertEqual(outlines.restore(home), [])
            self.assertEqual(path.read_text(), "// user edit\n" + original)

    def test_symlinked_mods_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            target = home / "original"
            target.mkdir()
            (target / "main.js").write_text("export default class Dialog extends View {}")
            (home / "mods").mkdir()
            (home / "mods/dialog").symlink_to(target, target_is_directory=True)
            with self.assertRaises(ValueError):
                outlines.apply(home)
