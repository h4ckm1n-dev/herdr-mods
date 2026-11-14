// Session recap: which files a Claude Code session read and wrote, over time. Pick a session on the
// left (newest first, type to filter); the right side draws one row per file, grouped by folder in the
// order the session first touched them, with a tick per read (dim) and per write (accent).
// recap.py reads the transcript; a pause over two minutes is squeezed so the work stays readable.
// Opened with props { session: id } (the agents list does), that session is the one shown.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { dialog, field, kbd, kbdHint, tag, ago, ICON, SIZE } from "./kit.js";
import { theme, exec, appHome, props, closeOverlay } from "herdr";

// ponytail: fixed widths (dialog 1040 - padding 32); a virtual list takes its width from a row.
const LEFT = 300, GAP = 16, RIGHT = 1008 - LEFT - GAP;
const NAME = 220, TRACK = RIGHT - NAME - 12 - 76 - 12;  // name · track · "3r 2w"
const SROW = 44, FROW = 22;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default class SessionRecap extends View {
  init(p, cx) {
    this.sessions = null;
    this.recap = null;
    this.at = 0;
    this.filter = "";
    this.status = "Reading sessions…";
    this.want = null; // the session whose recap is wanted: a slower, older answer is dropped
    this.script = `${appHome()}/mods/session-recap/recap.py`;
    this.list = VirtualListScrollHandle.new();
    this.rowsScroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Search sessions" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value().toLowerCase(); this.at = 0; this.list.scroll_to_item(0); this.load(cx); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", this.script, "list"]);
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").at(-1) || `recap.py exited ${r.code}`);
        this.sessions = JSON.parse(r.stdout);
        this.status = null;
        const i = this.sessions.findIndex((s) => s.id === (p?.session ?? props()?.session));
        if (i >= 0) { this.at = i; this.list.scroll_to_item(i); }
        this.load(cx);
      } catch (e) {
        this.status = `Couldn't read the sessions: ${e.message ?? e}`;
      }
      cx.notify();
    });
  }

  shown() {
    const f = this.filter;
    return (this.sessions ?? []).filter((s) => !f || s.title.toLowerCase().includes(f) || s.project.toLowerCase().includes(f));
  }

  // Reads the selected session's transcript, in its own task (a handler's cx is dead once it returns).
  load(cx) {
    const s = this.shown()[this.at];
    if (!s) { this.want = null; this.recap = null; return; }
    if (this.want === s.id) return;
    this.want = s.id;
    this.recap = null;
    cx.spawn(async (cx) => {
      let recap, status = null;
      try {
        const r = await exec("python3", ["-I", this.script, "show", s.id], { timeout: 120000 });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").at(-1) || `recap.py exited ${r.code}`);
        recap = JSON.parse(r.stdout);
      } catch (e) {
        status = `Couldn't read ${s.title}: ${e.message ?? e}`;
      }
      if (this.want !== s.id) return;
      this.recap = recap ?? null;
      this.status = status;
      this.rowsScroll.scroll_to_item(0);
      cx.notify();
    });
  }

  step(d, cx) {
    const n = this.shown().length;
    if (!n) return;
    this.at = Math.max(0, Math.min(n - 1, this.at + d));
    this.list.scroll_to_item(this.at);
    this.load(cx);
    cx.notify();
  }

  session(s, sel) {
    const c = theme();
    return v_flex().w(LEFT - 8).h(SROW).flex_none().px(12).gap(4).justify_center().rounded(8).cursor_pointer()
      .when(sel, (el) => el.bg(c.selected ?? c.hover))
      .child(div().truncate().text_size(SIZE.body).text_color(sel ? c.foreground : c.muted).child(s.title))
      .child(h_flex().gap(6).text_size(SIZE.meta).text_color(c.dim)
        .child(div().min_w(0).truncate().child(s.project)).child(div().flex_none().child(`· ${ago(s.updated)} ago`)));
  }

  // One folder heading, or one file: its name, its ticks along the session, how often it was read and written.
  row(r) {
    const c = theme();
    // every shell command of the session on one line: when it ran (which files it changed isn't recorded)
    if (r.shell) return h_flex().w(RIGHT - 8).h(FROW).flex_none().gap(12).items_center().text_size(SIZE.body)
      .child(h_flex().w(NAME).flex_none().gap(6).items_center().text_color(c.muted)
        .child(svg(ICON("terminal")).size(12).flex_none().text_color(c.dim)).child("Shell commands"))
      .child(div().relative().w(TRACK).h(FROW).flex_none()
        .child(div().absolute().left(0).right(0).top(10).h(1).bg(c.border))
        .children(r.shell.marks.map((x) => div().absolute().left(Math.round(x * (TRACK - 2))).top(6).w(2).h(10).rounded(1).bg(c.working))))
      .child(div().w(76).flex_none().text_right().text_size(SIZE.meta).text_color(c.working).child(`${r.shell.count}`));
    if (r.dir != null) return h_flex().w(RIGHT - 8).h(FROW).flex_none().gap(6).items_center().text_size(SIZE.meta).text_color(c.muted)
      .child(svg(ICON("folder")).size(12).flex_none().text_color(c.dim)).child(div().min_w(0).truncate().child(r.dir));
    const tick = ([x, kind], i) => div().absolute().left(Math.round(x * (TRACK - 2))).top(kind === "w" ? 4 : 7).w(2).h(kind === "w" ? 14 : 8)
      .rounded(1).bg(kind === "w" ? c.accent : c.dim);
    return h_flex().w(RIGHT - 8).h(FROW).flex_none().gap(12).items_center().text_size(SIZE.body)
      .child(div().w(NAME).flex_none().pl(18).truncate().text_color(r.writes ? c.foreground : c.muted).child(r.name))
      .child(div().relative().w(TRACK).h(FROW).flex_none()
        .child(div().absolute().left(0).right(0).top(10).h(1).bg(c.border))
        // writes last, so a write on top of a read at the same moment still shows
        .children([...r.marks.filter((m) => m[1] === "r"), ...r.marks.filter((m) => m[1] === "w")].map(tick)))
      .child(h_flex().w(76).flex_none().gap(6).justify_end().text_size(SIZE.meta)
        .when(r.reads > 0, (el) => el.child(div().text_color(c.dim).child(`${r.reads}r`)))
        .when(r.writes > 0, (el) => el.child(div().text_color(c.accent).child(`${r.writes}w`))));
  }

  render() {
    const c = theme();
    const sessions = this.shown();
    this.at = Math.max(0, Math.min(this.at, sessions.length - 1));
    const r = this.recap;
    const rows = r ? [...(r.shell?.count ? [{ shell: r.shell, key: "shell" }] : []), ...r.groups.flatMap((g) => [{ dir: g.dir, key: `d:${g.dir}` }, ...g.files.map((f) => ({ ...f, key: f.path }))])] : [];
    // "14 Nov 00:49 → 01:17", the day again only when the session ends on another one
    const at = (ts, withDay = true) => {
      const d = new Date(ts * 1000), two = (n) => String(n).padStart(2, "0");
      return `${withDay ? `${d.getDate()} ${MONTHS[d.getMonth()]} ` : ""}${two(d.getHours())}:${two(d.getMinutes())}`;
    };
    const span = (a, b) => `${at(a)} → ${at(b, new Date(a * 1000).toDateString() !== new Date(b * 1000).toDateString())}`;
    const legend = (color, h, label) => h_flex().flex_none().gap(4).items_center()
      .child(div().w(2).h(h).rounded(1).bg(color)).child(div().text_size(SIZE.meta).text_color(c.dim).child(label));
    const d = dialog(c, "session-recap", {
      title: "Session recap",
      glyph: svg(ICON("clock")).size(14).flex_none().text_color(c.muted),
      status: h_flex().flex_none().gap(12).items_center()
        .when(Boolean(this.sessions), (el) => el.child(div().text_size(SIZE.meta).text_color(c.dim).child(`${sessions.length} sessions`)))
        .child(kbd(c, "Esc")),
    });

    return d.root.size_full().track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return closeOverlay(props().overlay);
        if (k === "down") this.step(1, cx);
        else if (k === "up") this.step(-1, cx);
        else if (k === "pagedown") this.step(8, cx);
        else if (k === "pageup") this.step(-8, cx);
        else return;
        cx.stop_propagation();
      })
      .child(d.header)
      .child(h_flex().flex_1().min_h(0).px(16).pt(16).gap(GAP).items_start()
        .child(v_flex().w(LEFT).h_full().flex_none().gap(12)
          .child(field(c, Input.new(this.input).w_full().h(28).text_size(SIZE.body), true))
          .child(v_flex().relative().w(LEFT).flex_1().min_h(0)
            .when(Boolean(this.sessions) && !sessions.length, (el) => el.child(div().p(12).text_color(c.dim).child("No session matches")))
            .when(sessions.length > 0, (el) => el
              .child(v_virtual_list("sr-sessions", sessions.length, SROW, (i) => sessions[i].id,
                (range) => sessions.slice(range.start, range.end).map((s, j) => this.session(s, range.start + j === this.at)))
                .track_scroll(this.list).size_full()
                .on_item_click((id, cx) => {
                  const i = this.shown().findIndex((s) => s.id === id);
                  if (i < 0) return;
                  this.at = i;
                  this.load(cx);
                  cx.notify();
                }))
              .child(Scrollbar.vertical("sr-sessions").absolute().inset_0()))))
        .child(v_flex().w(RIGHT).h_full().flex_none().gap(8)
          .when(Boolean(r) && rows.length > 0, (el) => el
            // what, when, how much; then the clock along the track
            .child(h_flex().h(28).flex_none().gap(8).items_center()
              .child(div().min_w(0).truncate().font_semibold().child(r.project))
              .child(div().flex_none().text_size(SIZE.meta).text_color(c.dim).child(span(r.start, r.end)))
              .child(div().flex_1())
              .child(tag(c, `${r.files} files`))
              .child(legend(c.dim, 8, `${r.reads} reads`))
              .child(legend(c.accent, 14, `${r.writes} writes`))
              .when(r.shell?.count > 0, (x) => x.child(legend(c.working, 10, `${r.shell.count} shell`))))
            .child(h_flex().w(RIGHT - 8).h(14).flex_none().gap(12)
              .child(div().w(NAME).flex_none())
              .child(div().relative().w(TRACK).h(14).flex_none()
                .children(r.ticks.map((k, i) => div().absolute().top(0).text_size(SIZE.micro).text_color(c.dim)
                  // the last label ends at the track's edge, the others start at their tick
                  .when(i === r.ticks.length - 1, (x) => x.right(0)).when(i < r.ticks.length - 1, (x) => x.left(Math.round(k.x * TRACK)))
                  .child(k.label)))))
            .child(v_flex().relative().w(RIGHT).flex_1().min_h(0)
              .child(v_virtual_list("sr-files", rows.length, FROW, (i) => rows[i].key,
                (range) => rows.slice(range.start, range.end).map((x) => this.row(x)))
                .track_scroll(this.rowsScroll).size_full())
              .child(Scrollbar.vertical("sr-files").absolute().inset_0())))
          .when(Boolean(r) && !rows.length, (el) => el.child(div().p(12).text_color(c.dim).child("This session read and wrote no file with Claude's own tools")))
          .when(!r && Boolean(this.want) && !this.status, (el) => el.child(div().p(12).text_color(c.dim).child("Reading the transcript…")))))
      .when(Boolean(this.status), (el) => el.child(div().px(16).pt(8).text_size(SIZE.meta)
        .text_color(/^Couldn't/.test(this.status) ? c.blocked : c.muted).child(this.status)))
      .child(h_flex().mt(8).px(16).py(12).gap(16).items_center().border_t(1).border_color(c.border)
        .child(kbdHint(c, "↑↓", "session"))
        .child(kbdHint(c, "Esc", "close"))
        .child(div().flex_1())
        .child(div().text_size(SIZE.meta).text_color(c.dim).child("From the transcript. A shell command can change files too: it shows when it ran, not what it touched")));
  }
}
