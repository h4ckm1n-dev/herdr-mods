import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { theme, exec, readTextFile, appHome, focused, spaces, panes, props, closeOverlay, run, settings } from "herdr";
import { dialog, field, kbdHint, ICON, SIZE } from "./kit.js";

// A run of text split where the query matched: matched characters in the accent, the rest in `color`.
function lit(t, text, offset, at, color) {
  const out = [];
  for (let i = 0; i < text.length;) {
    const on = at.has(offset + i);
    let j = i + 1;
    while (j < text.length && at.has(offset + j) === on) j++;
    out.push(div().flex_none().text_color(on ? t.accent : color).child(text.slice(i, j)));
    i = j;
  }
  return out;
}
import { rank, context, openArgs, hits, thousands, tilde } from "./search.js";
import { fileIcon } from "./file-icon.js";

// PNG / JPEG open in a tab running imgview.py (kitty graphics); :q quits and closes it, like the nvim tabs
const IMAGE = /\.(png|jpe?g)$/i;

export default class FuzzyFiles extends View {
  init(_props, cx) {
    this.location = context(focused(), spaces(), panes());
    this.files = [];
    this.matches = [];
    this.at = 0;
    this.busy = true;
    this.status = "Reading files…";
    this.scroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Find a file…" });
    this.input.on("change", (_e, cx) => {
      this.matches = rank(this.files, this.input.value());
      this.at = 0;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.open(this.matches[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    // FileTree's Material icons; the svgs ship with files-crew (no second 4.7 MB copy), generic glyph without it
    this.icons = false;
    cx.spawn(async cx => {
      this.icons = Boolean(await readTextFile(`${appHome()}/mods/files-crew/icons/file.svg`).catch(() => null));
      cx.notify();
    });
    cx.spawn(async cx => {
      try {
        const { root, on, space } = this.location;
        if (!root || !space) throw new Error("No working folder for the active tab");
        const script = await readTextFile(`${appHome()}/mods/fuzzy-files/files.py`);
        if (!script) throw new Error("File finder script is missing; reinstall fuzzy-files");
        const output = await exec("python3", ["-I", "-c", script], { cwd: root, on });
        if (output.code !== 0) throw new Error(output.stderr.trim() || "Could not read files");
        const result = JSON.parse(output.stdout);
        this.files = result.files;
        this.matches = rank(this.files, this.input.value());
        this.limited = result.limited;
        this.status = null;
        this.scroll.scroll_to_item(0);
      } catch (error) {
        this.status = String(error.message ?? error);
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  open(path, cx) {
    if (!path || this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async cx => {
      try {
        const exists = await exec("python3", ["-I", "-c", "import os,sys;sys.exit(0 if os.path.isfile(sys.argv[1]) else 1)", path],
          { on: this.location.on, cwd: this.location.root });
        if (exists.code !== 0) throw new Error("This file no longer exists; reopen Find files to refresh");
        if (IMAGE.test(path)) {
          const script = await readTextFile(`${appHome()}/mods/fuzzy-files/imgview.py`);
          if (!script) throw new Error("Image viewer script is missing; reinstall fuzzy-files");
          if (!spaces().some(s => s.id === this.location.space)) throw new Error("The original space was closed");
          run("tab.new", { ...openArgs(this.location, path), argv: ["python3", "-I", "-c", script, path] });
          closeOverlay(props().overlay);
          return;
        }
        const check = await exec("nvim", ["--version"], { on: this.location.on, cwd: this.location.root });
        if (check.code !== 0) throw new Error("Neovim is unavailable on this machine");
        if (!spaces().some(s => s.id === this.location.space)) throw new Error("The original space was closed");
        run("tab.new", openArgs(this.location, path));
        closeOverlay(props().overlay);
      } catch (error) {
        this.status = String(error.message ?? error);
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  // ~/…/parent/ dimmed, then the project folder itself; a remote machine leads
  folderLine(t) {
    const { on, root } = this.location;
    if (!root) return div().text_size(SIZE.meta).text_color(t.dim).child("No folder");
    const p = tilde(root), cut = p.lastIndexOf("/") + 1;
    return h_flex().min_w(0).overflow_hidden().text_size(SIZE.meta)
      .when(Boolean(on), el => el.child(div().flex_none().text_color(t.muted).child(`${on}:`)))
      .child(div().flex_none().text_color(t.dim).child(p.slice(0, cut)))
      .child(div().flex_none().text_color(t.foreground).child(p.slice(cut)));
  }

  render() {
    const t = theme(), rows = this.matches, dark = Boolean(settings().dark), query = this.input.value();
    const d = dialog(t, "fuzzy-files", { title: "Find files", glyph: svg(ICON("search")).size(14).flex_none().text_color(t.muted) });
    return d.root.size_full().track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
        let step = { up: -1, down: 1, pageup: -10, pagedown: 10 }[e.key];
        if (e.modifiers.control && e.key === "n") step = 1;
        if (e.modifiers.control && e.key === "p") step = -1;
        if (step === undefined) return;
        this.at = Math.max(0, Math.min(rows.length - 1, this.at + step));
        this.scroll.scroll_to_item(this.at);
        cx.stop_propagation();
        cx.notify();
      })
      .child(d.header)
      .child(d.body.gap(8)
        .child(this.folderLine(t))
        .child(field(t, Input.new(this.input).flex_1().min_w(0), true)))
      .child(v_flex().relative().w(1008).mx(16).flex_1().min_h(0)
        .when(rows.length > 0, el => el
          .child(v_virtual_list("fuzzy-files-list", rows.length, 32, i => rows[i], range =>
            rows.slice(range.start, range.end).map((path, offset) => {
              // name first, its folder dimmed after it: a long folder gets cut, never the name
              const at = new Set(hits(query, path)), cut = path.lastIndexOf("/") + 1;
              return h_flex().w(1000).h(32).px(8).gap(8).items_center().rounded(8).text_size(SIZE.body)
                .when(range.start + offset === this.at, row => row.bg(t.selected ?? t.hover))
                .cursor_pointer().accessibility_label(`Open ${path}`)
                .child(this.icons ? image(fileIcon(path, false, false, dark)).size(16).flex_none()
                  : svg(ICON("file-text")).size(14).flex_none().text_color(t.dim))
                .child(h_flex().flex_none().children(lit(t, path.slice(cut), cut, at, t.foreground)))
                .when(cut > 0, row => row.child(h_flex().flex_1().min_w(0).overflow_hidden().text_size(SIZE.meta)
                  .children(lit(t, path.slice(0, cut - 1), 0, at, t.dim))));
            }))
            .track_scroll(this.scroll).size_full().on_item_click((path, cx) => this.open(path, cx)))
          .child(Scrollbar.vertical("fuzzy-files-list").absolute().inset_0()))
        .when(!this.busy && !rows.length, el => el.child(div().p(16).text_color(t.dim)
          .child(this.files.length ? "No file matches" : "No files found"))))
      .child(h_flex().mt(8).px(16).py(12).gap(16).items_center().border_t(1).border_color(t.border)
        .child(kbdHint(t, "↵", "open"))
        .child(kbdHint(t, "↑↓", "select"))
        .child(kbdHint(t, "Esc", "close"))
        .child(div().flex_1())
        .child(div().text_size(SIZE.meta).text_color(t.dim)
          .child(`${query ? `${thousands(rows.length)} of ` : ""}${thousands(this.files.length)} files${this.limited ? ", first 50,000" : ""}`)))
      .when(Boolean(this.status), el => el.child(div().px(16).pb(12).text_size(SIZE.meta)
        .text_color(this.busy ? t.muted : t.blocked).child(this.status)));
  }
}
