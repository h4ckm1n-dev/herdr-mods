// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { panel, header, footer, empty, errorBand, tag, iconButton, plural, SIZE, navKey, trackTerminal, keyHints, terminalFocus, panelFocusAsked } from "./kit.js";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, nextCommand, run, terminals } from "herdr";

function location() {
  // terminalFocus: while this panel holds the keyboard, keep the folder the terminal gave it
  const space = spaces().find(s => s.active), f = terminalFocus();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
/** One nvim server per machine + project folder: its socket path. */
// Killing from inside VimLeave hits nvim with SIGHUP ("Caught deadly signal"): a detached job waits until nvim
// is gone or a zombie (kill -0 counts zombies, and the shell Herdr execs after it reaps late), then ends the terminal.
const QUIT_CLOSES_TAB = `autocmd VimLeave * if !empty($HC_TERMINAL_ID) | call jobstart(['sh', '-c', 'while ps -o stat= -p "$1" | grep -qv Z; do sleep 0.05; done; hc kill "$2"', 'sh', string(getpid()), $HC_TERMINAL_ID], {'detach': 1}) | endif`;
const nvimSocket = (on, root) => { let h = 5381; for (const c of `${on ?? ""}:${root}`) h = (h * 33 + c.charCodeAt(0)) >>> 0; return `/tmp/herdr-nvim-${h.toString(16)}.sock`; };

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.handle = cx.focus_handle(); this.cur = null; this.idx = 0;
    cx.spawn(async cx => { for (;;) { if ((await nextCommand()) === "focus") { this.handle.focus(); cx.notify(); } } });
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  /** Opens the file in this project's nvim (a tab running `nvim --listen`), starting it when none answers. */
  edit(path, cx) {
    const { root, on } = this, file = `${root}/${path}`, sock = nvimSocket(on, root);
    cx.spawn(async cx => {
      // --remote-expr fails (code 2) without a server; plain --remote would edit locally and hang
      const r = await exec("nvim", ["--server", sock, "--remote-expr", `execute('drop ' .. fnameescape('${file.replace(/'/g, "''")}'))`], { on }).catch(() => null);
      if (r?.code === 0) {
        const t = terminals().find(t => t.argv?.includes(sock));
        if (t) run("pane.focus", { terminal: t.address });
        return;
      }
      // a double click must not start two (the second would remove the first's socket)
      if (this.starting === sock) return;
      this.starting = sock; cx.timer.after(2000, () => { if (this.starting === sock) this.starting = null; });
      await exec("rm", ["-f", sock], { on }).catch(() => null); // a dead server's socket blocks --listen
      // the title (the pane header) follows the current file; Herdr keeps a shell after the program ends; ending the terminal on quit closes the tab (:q)
      run("terminal.open", { argv: ["nvim", "--listen", sock, "--cmd", QUIT_CLOSES_TAB, "--cmd", "set title titlestring=%t", file], folder: root, place: "tab" });
    });
  }

  /** Visible tree rows in display order: { path, dir, depth, name }. */
  flat(prefix = "", depth = 0, out = []) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push({ path, dir: entry.dir, depth, name: entry.name });
      if (entry.dir && this.folders.has(path)) this.flat(path, depth + 1, out);
    }
    return out;
  }

  /** Cursor index: stays on the same path when the tree changes, else clamped. */
  cursor(flat) {
    const i = this.cur == null ? -1 : flat.findIndex(r => r.path === this.cur);
    if (i >= 0) this.idx = i; else this.idx = Math.max(0, Math.min(flat.length - 1, this.idx));
    this.cur = flat[this.idx]?.path ?? null;
    return this.idx;
  }

  setCursor(flat, i) { this.idx = i; this.cur = flat[i]?.path ?? null; }

  key(e, cx) {
    if (this.file) { // viewer: Esc / Backspace go back to the tree
      const m = e.modifiers ?? {};
      if ((e.key === "escape" || e.key === "backspace") && !m.platform && !m.control && !m.alt) { this.show(null); cx.stop_propagation(); cx.notify(); return; }
      return;
    }
    const flat = this.flat(), i = this.cursor(flat), r = flat[i];
    navKey(e, cx, { count: flat.length, index: i, set: n => this.setCursor(flat, n),
      enter: () => { if (!r) return; if (r.dir) this.toggle(r.path, cx); else this.edit(r.path, cx); },
      space: () => { if (r && !r.dir) this.show(r.path, cx); },
      right: () => { if (!r?.dir) return; if (!this.folders.has(r.path)) this.toggle(r.path, cx); else if (flat[i + 1]?.depth > r.depth) this.setCursor(flat, i + 1); },
      left: () => {
        if (!r) return;
        if (r.dir && this.folders.has(r.path)) { this.toggle(r.path, cx); return; }
        const parent = r.path.includes("/") ? r.path.slice(0, r.path.lastIndexOf("/")) : null;
        const p = parent == null ? -1 : flat.findIndex(x => x.path === parent);
        if (p >= 0) this.setCursor(flat, p);
      } });
  }

  rows(flat, cursor, t) {
    return flat.map((r, n) => {
      const { path, dir, depth, name } = r, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`], here = n === cursor;
      const markColor = mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked;
      // always a 1px border (transparent) so the keyboard cursor never shifts the layout
      return h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 16).pr(8).gap(8).items_center().rounded(8).cursor_pointer().border_1().border_color(here ? t.accent : "#00000000")
        .when(here, el => el.bg(t.selected)).hover(s => s.bg(here ? t.selected : t.hover))
        .text_size(SIZE.body).on_click((_e, cx) => dir ? this.toggle(path, cx) : this.edit(path, cx))
        .child(dir ? svg(`mods/files-crew/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/files-crew/${dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(dir ? t.muted : t.dim))
        .child(div().flex_1().min_w(0).truncate().text_color(dir ? t.foreground : t.muted).child(name))
        .when(Boolean(mark), el => el.child(div().flex_none().w(16).flex().justify_center().text_size(SIZE.micro).font_semibold().text_color(markColor).child(mark)));
    });
  }

  render(cx) {
    if (panelFocusAsked(this, "files-crew")) cx.timer.after(0, () => this.handle.focus()); // focus() can't run during render
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme(), folder = this.root?.split(/[\\/]/).pop() ?? "";
    trackTerminal();
    const kb = this.handle.is_focused(), flat = this.file ? [] : this.flat(), cur = this.file ? -1 : this.cursor(flat);
    const rows = this.rows(flat, kb ? cur : -1, t), top = this.entries.get("")?.length ?? 0;
    const name = this.file?.split("/").pop(), dir = this.file?.includes("/") ? this.file.slice(0, this.file.lastIndexOf("/")) : "";
    const head = header(t, { glyph: svg("mods/files-crew/folder.svg").size(14).flex_none().text_color(t.muted), title: "Files", count: folder || null,
      status: this.loading && !top ? "Loading…" : top ? plural(top, "item") : null });
    const viewer = this.file && h_flex().h(42).flex_none().px(16).gap(8).items_center().border_b(1).border_color(t.border)
      .child(iconButton(t, "files-back", "chevron-left", (_e, cx) => { this.show(null); cx.notify(); }, { tip: "Back to files" }))
      .child(div().flex_none().min_w(0).truncate().font_semibold().child(name))
      .child(div().flex_1().min_w(0))
      .when(Boolean(dir), el => el.child(div().min_w(0).truncate().text_size(SIZE.meta).text_color(t.dim).child(dir)))
      .child(tag(t, "read-only"));
    return panel(t, "files", { keyboard: kb }).track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(viewer || head)
      .when(!this.file, el => el.when(Boolean(this.error), e => e.child(errorBand(t, this.error)))
        .child(!rows.length && !this.error
          ? (this.loading ? empty(t, { title: "Loading files…" }) : empty(t, { glyph: svg("mods/files-crew/folder.svg").size(20).text_color(t.dim), title: this.root ? "No files" : "No folder", hint: this.root ? "This folder is empty" : "Focus a terminal to browse its folder" }))
          : v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(8).children(rows)))
      .when(!this.file && this.limited, el => el.child(footer(t, "files-limit").child(div().text_size(SIZE.meta).text_color(t.dim).child("List limited to 500 entries per folder, 5,000 total"))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : empty(t, { title: this.fileError || "Loading file…" })))
      .when(kb && !this.file, el => el.child(keyHints(t, "files-keys", [["↑↓", "move"], ["⏎", "nvim"], ["␣", "preview"], ["←→", "fold"], ["Esc", "terminal"]])))
      .when(kb && Boolean(this.file), el => el.child(keyHints(t, "files-keys", [["Esc", "back"], ["⌫", "back"]])));
  }
}
