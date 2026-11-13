import importlib.util
import os
import pty
import select
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import zlib
import struct
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "imgview.py"
spec = importlib.util.spec_from_file_location("imgview", SCRIPT)
imgview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imgview)


def png(w, h):
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    raw = b"".join(b"\0" + b"\xff\0\0" * w for _ in range(h))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class ImgviewTests(unittest.TestCase):
    def test_fit_centers_and_never_upscales(self):
        self.assertEqual(imgview.fit(80, 160, 100, 50, 8, 16), (10, 10, 46, 21))  # native size
        c, r, x, y = imgview.fit(4000, 1000, 100, 50, 8, 16)  # wide: fills the width
        self.assertEqual((c, x), (100, 1))
        self.assertLessEqual(r, 50)

    def test_png_size_and_jpeg_conversion(self):
        data = png(3, 2)
        self.assertEqual(imgview.png_size(data), (3, 2))
        with tempfile.TemporaryDirectory() as d:
            src = Path(d, "a.png")
            src.write_bytes(data)
            self.assertEqual(imgview.load(str(src)), data)
            if shutil.which("sips"):
                jpg = Path(d, "a.jpg")
                subprocess.run(["sips", "-s", "format", "jpeg", str(src), "--out", str(jpg)], check=True, capture_output=True)
                self.assertEqual(imgview.png_size(imgview.load(str(jpg))), (3, 2))

    def test_draws_kitty_graphics_and_quits_on_colon_q(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, "a.png").write_bytes(png(3, 2))
            pid, fd = pty.fork()
            if pid == 0:
                os.environ.pop("HC_TERMINAL_ID", None)  # don't end the terminal running the tests
                os.execv(sys.executable, [sys.executable, "-I", "-c", SCRIPT.read_text(), str(Path(d, "a.png"))])
            out = b""
            end = time.time() + 5
            while b"to quit" not in out and time.time() < end:
                if select.select([fd], [], [], 0.2)[0]:
                    out += os.read(fd, 65536)
            self.assertIn(b"\x1b_Ga=T,f=100", out)
            os.write(fd, b":q\r")
            end = time.time() + 5
            while time.time() < end:
                done, status = os.waitpid(pid, os.WNOHANG)
                if done:
                    break
                try:
                    if select.select([fd], [], [], 0.1)[0]:
                        os.read(fd, 65536)
                except OSError:
                    pass
            else:
                os.kill(pid, 9)
                self.fail(":q did not quit")
            self.assertEqual(os.waitstatus_to_exitcode(status), 0)


if __name__ == "__main__":
    unittest.main()
