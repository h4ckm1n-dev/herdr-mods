// Theme gallery, after cmux/AiMux's `cmux themes` picker: the whole Ghostty theme
// collection (bundled in AiMux/cmux/Ghostty.app, plus ~/.config/ghostty/themes) next to
// Herdr's own themes. Type to filter, Tab (or the chips) for all/dark/light, ↑/↓ to
// preview live, Enter or click "Use" to keep, Esc to put the old theme back.
// A Ghostty theme becomes themes/<name>.json the first time it's previewed; files only
// the preview needed are removed again on close, so Settings lists just what you keep.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { header, field, kbd, button, SIZE, chip as kitChip } from "./kit.js";
import { theme, themes, settings, run, exec, appHome, readTextFile, writeTextFile, props, closeOverlay, nextCommand } from "herdr";

const ROW = 28;
// ponytail: fixed list width (dialog 820 - padding 32 - card 300 - gap 16); a virtual list takes its width from a row.
const LIST_W = 472;
const MODES = ["all", "dark", "light"];
const half = (t) => (t.dark ? "dark" : "light");
const cap = (w) => w[0].toUpperCase() + w.slice(1);
// Herdr's localeCompare ignores its options (code-unit order: "CGA" < "Canyon" < "atom"), so sort on a
// lowercased key with digit runs zero-padded: case-insensitive and numeric, as intended.
const sortKey = (s) => s.toLowerCase().replace(/\d+/g, (d) => d.padStart(8, "0"));
const byName = (a, b) => { const x = sortKey(a.name), y = sortKey(b.name); return x < y ? -1 : x > y ? 1 : 0; };
const lum = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
// Text on the selection: the theme's foreground or background, whichever stands out more.
// Mix two #rrggbb colors: a of b into a base (the previewed theme's "raised" surface).
const mix = (a, b, k) => { const x = parseInt(a.slice(1, 7), 16), y = parseInt(b.slice(1, 7), 16); const ch = (s) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k); return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1); };
const onSel = (t) => (Math.abs(lum(t.foreground) - lum(t.selection)) >= Math.abs(lum(t.background) - lum(t.selection)) ? t.foreground : t.background);

// Herdr's themes() entry → the same shape scan.py gives Ghostty themes.
function fromHerdr(h) {
  const c = h.colors;
  return {
    name: h.name, dark: !h.light, herdr: true,
    background: c.background, foreground: c.foreground, selection: c.selection, cursor: c.foreground,
    ansi: Array.from({ length: 16 }, (_, i) => c[`ansi${i}`] ?? c.foreground),
  };
}

export default class ThemeGallery extends View {
  init(_props, cx) {
    this.list = themes().map(fromHerdr);
    this.filter = "";
    this.mode = "all";
    this.at = 0;
    this.applied = false;
    this.created = new Set(); // theme files this gallery wrote
    this.seq = 0;
    this.status = "Loading the Ghostty collection…";
    this.scroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Search themes…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; this.moved(cx); });
    this.input.on("submit", (_e, cx) => this.use(cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    // `theme-gallery.next|prev|use` from keys.json or `herdr-app do`.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "next") this.step(1, cx);
        else if (c === "prev") this.step(-1, cx);
        else if (c === "use") this.use(cx);
        cx.notify();
      }
    });

    // What Esc goes back to: the shown layout's light and dark picks.
    const st = settings();
    this.orig = { light: st.theme_light ?? "paper", dark: st.theme_dark ?? "graphite" };
    this.picked = { ...this.orig };
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/theme-gallery/scan.py`]);
        if (r.code !== 0) throw new Error(r.stderr.trim() || `scan.py exited ${r.code}`);
        const have = new Set(this.list.map((t) => t.name.toLowerCase()));
        this.list.push(...JSON.parse(r.stdout).filter((t) => !have.has(t.name.toLowerCase())));
        this.list.sort(byName);
        this.status = null;
      } catch (e) {
        this.status = `Ghostty collection unavailable: ${e.message ?? e}`;
      }
      // Open on the theme showing now.
      this.at = Math.max(0, this.rows().findIndex((t) => t.name === this.orig[settings().dark ? "dark" : "light"]));
      this.scroll.scroll_to_item(this.at, "center");
      cx.notify();
    });
  }

  find(name) {
    return this.list.find((t) => t.name === name);
  }

  rows() {
    const f = this.filter.toLowerCase();
    return this.list.filter((t) => (this.mode === "all" || half(t) === this.mode) && (!f || t.name.toLowerCase().includes(f)));
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  step(d, cx) {
    const n = this.rows().length;
    if (!n) return;
    this.at = (this.at + d + n) % n;
    this.scroll.scroll_to_item(this.at);
    this.moved(cx);
  }

  // Selection moved: preview it in the app once the arrows settle.
  moved(cx) {
    const seq = ++this.seq;
    cx.timer.after(140, (cx) => { if (seq === this.seq) cx.spawn((cx) => this.preview(this.rows()[this.at], cx)); });
  }

  async ensureFile(t) {
    if (t.herdr) return;
    const path = `${appHome()}/themes/${t.name}.json`;
    if ((await readTextFile(path)) !== null) return;
    const { background, foreground, selection, cursor, ansi } = t;
    await writeTextFile(path, JSON.stringify({ background, foreground, selection, cursor, ansi }, null, 2) + "\n", null);
    this.created.add(path);
  }

  async preview(t, cx) {
    if (!t || this.picked[half(t)] === t.name) return;
    try {
      await this.ensureFile(t);
      run("app.theme", { name: t.name });
      this.picked[half(t)] = t.name;
    } catch (e) {
      this.status = `Couldn't preview ${t.name}: ${e.message ?? e}`;
    }
    cx.notify();
  }

  use(cx) {
    const t = this.rows()[this.at];
    if (!t) return;
    this.applied = true;
    // Enter before the preview settled: apply now; close() keeps the file.
    if (this.picked[half(t)] !== t.name) {
      this.picked[half(t)] = t.name;
      cx.spawn(async () => { await this.ensureFile(t); run("app.theme", { name: t.name }); this.dismiss(); });
    } else this.dismiss();
  }

  async close() {
    if (!this.applied) {
      for (const h of ["light", "dark"]) if (this.picked[h] !== this.orig[h]) run("app.theme", { name: this.orig[h] });
      this.picked = { ...this.orig };
    }
    const keep = new Set(Object.values(this.picked).map((n) => `${appHome()}/themes/${n}.json`));
    const gone = [...this.created].filter((p) => !keep.has(p));
    if (gone.length) await exec("rm", ["-f", "--", ...gone]);
  }

  swatch(t, w, h) {
    return h_flex().w(w).h(h).flex_none().rounded(4).border_1().border_color(theme().border).bg(t.background)
      .items_center().justify_center().gap(2)
      .child(div().text_size(11).font_medium().text_color(t.foreground).child("Aa"))
      .child(div().size(6).rounded(3).bg(t.ansi[1]))
      .child(div().size(6).rounded(3).bg(t.ansi[2]))
      .child(div().size(6).rounded(3).bg(t.ansi[4]));
  }

  row(t, on) {
    const c = theme();
    // No handlers in here: a virtual list's rows can't hold any (the list's on_item_click does clicks).
    return h_flex().h(ROW).w(LIST_W - 8).mx(4).px(8).gap(8).items_center().rounded(8).cursor_pointer().text_size(SIZE.body)
      .when(on, (el) => el.bg(c.selected ?? c.hover))
      .child(this.swatch(t, 36, 20))
      .child(div().flex_1().min_w(0).truncate().text_color(c.foreground).when(on, (d) => d.font_medium()).child(t.name))
      .when(this.orig.dark === t.name || this.orig.light === t.name, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(c.accent)))
      .child(div().w(36).flex_none().text_size(SIZE.micro).text_color(c.dim).child(t.herdr ? "herdr" : half(t)));
  }

  // A fake terminal in the theme's own colors, so light themes preview in dark mode too.
  card(t) {
    const c = theme();
    const a = t.ansi;
    const s = settings();
    const line = (...parts) => h_flex().children(parts.map(([txt, col, bg]) => div().text_color(col ?? t.foreground).when(!!bg, (d) => d.bg(bg)).child(txt)));
    const term = v_flex().p(12).gap(2).rounded(8).bg(t.background).text_size(12).font_family(s.font_family ?? s.font ?? "JetBrains Mono")
      .child(line(["~/herdr ", a[4]], ["main ", a[5]], ["✓", a[2]]))
      .child(line(["❯ ", a[2]], ["ls"]))
      .child(line(["README.md  "], ["src/  ", a[4]], ["build.sh*", a[2]]))
      .child(line(["❯ ", a[2]], ["git diff --stat"]))
      .child(line([" main.js | 12 "], ["++++++", a[2]], ["------", a[1]]))
      .child(line(["fn ", a[5]], ["greet", a[4]], ["(name: "], ["&str", a[3]], [") {"]))
      .child(line(["  println!", a[6]], ["(", null], ["\"hi {name}\"", a[2]], [");"]))
      .child(line(["}"]))
      .child(line(["error", a[1]], [": build failed"]))
      .child(line(["warning", a[3]], [": unused import", a[8]]))
      .child(line(["selected text", onSel(t), t.selection]))
      .child(line(["❯ ", a[2]], ["▌", t.cursor]));
    const dots = (from) => h_flex().gap(4).children(a.slice(from, from + 8).map((col) => div().flex_1().h(12).rounded(4).bg(col)));
    return v_flex().flex_1().min_w(300).gap(12) // 16:9 dialog: the preview takes the spare width
      .child(term)
      .child(v_flex().gap(4).child(dots(0)).child(dots(8)))
      .child(v_flex().gap(4)
        .child(div().text_size(SIZE.title).font_semibold().text_color(c.foreground).truncate().child(t.name))
        .child(div().text_size(SIZE.meta).text_color(c.dim).child(`${cap(half(t))} · ${t.herdr ? "Herdr theme" : t.src ?? ""}`)))
      .child(button(c, "tg-use", `Use for ${half(t)} mode ↵`, (_e, cx) => this.use(cx), { primary: true }).w_full());
  }

  render() {
    const c = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const sel = rows[this.at];
    const counts = { all: this.list.length, dark: this.list.filter((t) => t.dark).length, light: this.list.filter((t) => !t.dark).length };
    const chip = (m) => kitChip(c, `tg-mode-${m}`, `${cap(m)} ${counts[m]}`, { on: this.mode === m, onClick: (_e, cx) => { this.mode = m; this.at = 0; this.moved(cx); cx.notify(); } });

    return v_flex().id("theme-gallery").track_focus(this.handle).size_full().min_h(0).bg(c.popover).text_color(c.foreground).text_size(SIZE.title)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.dismiss();
        if (k === "down") this.step(1, cx);
        else if (k === "up") this.step(-1, cx);
        else if (k === "pagedown") this.step(10, cx);
        else if (k === "pageup") this.step(-10, cx);
        else if (k === "tab") { this.mode = MODES[(MODES.indexOf(this.mode) + (e.modifiers.shift ? 2 : 1)) % 3]; this.at = 0; this.moved(cx); }
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(header(c, { title: "Themes", count: String(rows.length), status: kbd(c, "Esc") }))
      .child(v_flex().flex_1().min_h(0).p(16).gap(12)
        .child(h_flex().gap(8).items_center()
          .child(field(c, Input.new(this.input).flex_1().min_w(0), true))
          .child(h_flex().flex_none().gap(2).children(MODES.map(chip))))
        .when(!!this.status, (el) => el.child(div().text_size(SIZE.meta).text_color(c.dim).child(this.status)))
        // The dialog has a set height (mod.json), so the list takes whatever the search row leaves.
        .child(h_flex().flex_1().min_h(0).gap(16).items_start()
          .child(v_flex().relative().w(LIST_W).h_full()
            .child(v_virtual_list("tg-list", rows.length, ROW, (i) => rows[i].name,
              (range) => rows.slice(range.start, range.end).map((t, j) => this.row(t, range.start + j === this.at)))
              .track_scroll(this.scroll).size_full()
              .on_item_click((name, cx) => {
                const i = this.rows().findIndex((t) => t.name === name);
                if (i < 0) return;
                if (i === this.at) return this.use(cx);
                this.at = i;
                this.moved(cx);
                cx.notify();
              }))
            .child(Scrollbar.vertical("tg-list").absolute().inset_0()))
          .when(!!sel, (el) => el.child(this.card(sel)))
          .when(!sel, (el) => el.child(v_flex().w(300).items_center().gap(8).pt(48)
            .child(div().text_size(SIZE.title).text_color(c.muted).child("No theme matches"))
            .child(div().text_size(SIZE.meta).text_color(c.dim).child("Try another word, or switch to All"))))));
  }
}
