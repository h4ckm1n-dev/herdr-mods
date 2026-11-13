import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("files", Path(__file__).parents[1] / "files.py")
files = importlib.util.module_from_spec(spec)
spec.loader.exec_module(files)


class FileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True, capture_output=True)

    def test_git_ignored_tracked_deleted_and_unusual_names(self):
        self.git("init", "-q")
        (self.root / ".gitignore").write_text("ignored/\n")
        (self.root / "ignored").mkdir()
        (self.root / "ignored/x").write_text("ignored")
        (self.root / "gone").touch()
        self.git("add", "gone")
        (self.root / "gone").unlink()
        name = "space ' dollar$\n.md"
        (self.root / name).touch()
        self.assertEqual(files.listing(self.root)["files"], [".gitignore", name])

    def test_subfolder_never_scans_parent(self):
        self.git("init", "-q")
        (self.root / "outside").touch()
        sub = self.root / "src"
        sub.mkdir()
        (sub / "inside").touch()
        self.assertEqual(files.listing(sub)["files"], ["inside"])

    def test_plain_folder_hidden_files_and_no_symlink_recursion(self):
        (self.root / ".env.example").touch()
        (self.root / "node_modules").mkdir()
        (self.root / "node_modules/nope").touch()
        (self.root / "loop").symlink_to(self.root, target_is_directory=True)
        self.assertEqual(files.listing(self.root)["files"], [".env.example"])

    def test_limit_is_visible(self):
        for name in ("a", "b", "c"):
            (self.root / name).touch()
        with patch.object(files, "LIMIT", 2):
            self.assertEqual(files.listing(self.root), {"files": ["a", "b"], "limited": True})

    def test_missing_root_is_an_error(self):
        with self.assertRaises(ValueError):
            files.listing(self.root / "missing")


if __name__ == "__main__":
    unittest.main()
