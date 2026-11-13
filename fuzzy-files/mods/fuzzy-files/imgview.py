# Image viewer for a Herdr tab: draws a PNG or JPEG with kitty graphics, :q (or q, Esc) quits and closes the tab.
# Run as `python3 -I -c <this file> <image>` so it works on remote machines too. Stdlib only.
import base64, fcntl, os, select, shutil, signal, struct, subprocess, sys, tempfile, termios, tty

CHUNK = 4096


def png_size(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    return struct.unpack(">II", data[16:24])


def load(path):
    """PNG bytes for the image; JPEG goes through macOS sips (kitty graphics in Herdr decodes PNG only)."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return data
    # ponytail: sips is macOS-only; a Linux machine would need ImageMagick or Pillow here
    if not shutil.which("sips"):
        raise SystemExit("JPEG needs macOS (sips) on this machine")
    fd, out = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        r = subprocess.run(["sips", "-s", "format", "png", path, "--out", out], capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(r.stderr.strip() or "Could not convert this image")
        with open(out, "rb") as f:
            return f.read()
    finally:
        os.unlink(out)


def fit(w, h, cols, rows, cw, ch):
    """Cells (c, r) and top-left (col, row), 1-based, that show a w x h px image centered, never upscaled."""
    s = min(cols * cw / w, rows * ch / h, 1)
    c, r = max(1, min(cols, round(w * s / cw))), max(1, min(rows, round(h * s / ch)))
    return c, r, (cols - c) // 2 + 1, (rows - r) // 2 + 1


def cells():
    rows, cols, xp, yp = struct.unpack("HHHH", fcntl.ioctl(sys.stdout.fileno(), termios.TIOCGWINSZ, b"\0" * 8))
    # no pixel size reported: assume the usual 1:2 cell
    return cols, rows, (xp / cols if xp else 8), (yp / rows if yp else 16)


def draw(png, name):
    w, h = png_size(png)
    cols, rows, cw, ch = cells()
    c, r, x, y = fit(w, h, cols, max(1, rows - 2), cw, ch)
    out = ["\x1b_Ga=d,d=A,q=2\x1b\\\x1b[2J", f"\x1b[{y};{x}H"]
    b64 = base64.standard_b64encode(png).decode()
    for i in range(0, len(b64), CHUNK):
        more = int(i + CHUNK < len(b64))
        head = f"a=T,f=100,q=2,C=1,c={c},r={r}," if i == 0 else ""
        out.append(f"\x1b_G{head}m={more};{b64[i:i + CHUNK]}\x1b\\")
    out.append(f"\x1b[{rows};1H\x1b[2m{name} · {w}×{h} · :q to quit\x1b[0m")
    sys.stdout.write("".join(out))
    sys.stdout.flush()


def close_tab():
    # Herdr keeps a shell after the program ends: end the terminal once this process is gone, as the nvim tabs do
    tid = os.environ.get("HC_TERMINAL_ID")
    if tid and shutil.which("hc"):
        subprocess.Popen(["sh", "-c", 'while ps -o stat= -p "$1" | grep -qv Z; do sleep 0.05; done; hc kill "$2"', "sh", str(os.getpid()), tid],
                         start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main(path):
    name = os.path.basename(path)
    try:
        png = load(path)
        png_size(png)
    except (OSError, ValueError) as e:
        sys.exit(f"{name}: {e}")
    resized = [True]
    signal.signal(signal.SIGWINCH, lambda *_: resized.__setitem__(0, True))
    fd, saved = sys.stdin.fileno(), termios.tcgetattr(sys.stdin)
    sys.stdout.write("\x1b[?1049h\x1b[?25l")
    tty.setcbreak(fd)
    cmd = None
    try:
        while True:
            if resized[0]:
                resized[0] = False
                draw(png, name)
            try:
                ready = select.select([fd], [], [], 0.2)[0]
            except InterruptedError:
                continue
            if not ready:
                continue
            keys = os.read(fd, 64).decode(errors="ignore")
            if keys.startswith("\x1b") and len(keys) > 1:
                continue  # an arrow or other escape sequence, not Esc
            quit = False
            for k in keys:  # typed fast or pasted, ":q\r" arrives in one read
                if cmd is None:
                    if k in ("q", "\x1b"):
                        quit = True
                        break
                    if k == ":":
                        cmd = ""
                elif k in ("\r", "\n"):
                    if cmd.rstrip("!") in ("q", "wq", "x", "qa"):
                        quit = True
                        break
                    cmd = None
                elif k in ("\x1b", "\x03"):
                    cmd = None
                elif k in ("\x7f", "\b"):
                    cmd = cmd[:-1] if cmd else None
                else:
                    cmd += k
            if quit:
                break
            rows = cells()[1]
            sys.stdout.write(f"\x1b[{rows};1H\x1b[2K" + (f":{cmd}" if cmd is not None else f"\x1b[2m{name} · :q to quit\x1b[0m"))
            sys.stdout.flush()
    finally:
        sys.stdout.write("\x1b_Ga=d,d=A,q=2\x1b\\\x1b[?25h\x1b[?1049l")
        sys.stdout.flush()
        termios.tcsetattr(fd, termios.TCSADRAIN, saved)
    close_tab()


if __name__ == "__main__":
    main(sys.argv[1])
