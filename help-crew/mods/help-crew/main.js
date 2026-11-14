// Keybinds, Crew style: every binding from keys.json as one line per action, grouped, filterable,
// its keys drawn as keycaps. ↑↓ move, ↵ (or a click) runs the action (never one that closes, quits or resets), Esc closes.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { keys, commands, run, props, closeOverlay, theme, window } from "herdr";
import { SIZE, ICON, dialog, field, keyLabel, kbdHint } from "./kit.js";
import { entries, runnable } from "./binds.js";

const ROW = 32, LIST_W = 1008;
// a stroke "⌥⌘[" -> one cap per symbol, the key last
const caps = (text) => text.match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? [];

export default class HelpCrew extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = 1; // row 0 is the first group's heading
    this.scroll = VirtualListScrollHandle.new();
    this.input = InputState.new({ placeholder: "Filter keybinds" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value().toLowerCase(); this.at = 1; this.scroll.scroll_to_item(0); cx.notify(); });
    this.input.on("submit", () => this.go(this.rows?.[this.at]));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  /** Runs a row's action, the dialog closed first so the action lands on what was under it. */
  go(row) {
    const call = row && !row.head ? runnable(row, commands()) : null;
    if (!call) return;
    closeOverlay(props().overlay);
    run(call);
  }

  keycap(t, text) {
    return div().flex_none().min_w(22).h(22).px(6).flex().items_center().justify_center().rounded(5)
      .border_1().border_color(t.input).bg(t.surface).text_size(SIZE.meta).font_medium().text_color(t.foreground).child(text);
  }

  // No handlers in here: a virtual list's rows can't hold any (the list's on_item_click does clicks).
  row(t, r, sel, mac) {
    if (r.head) return h_flex().w(LIST_W - 8).h(ROW).px(8).pt(8).gap(8).items_center()
      .child(div().text_size(SIZE.meta).font_medium().text_color(t.muted).child(r.head))
      .child(div().text_size(SIZE.micro).text_color(t.muted).child(String(r.count)));
    const can = Boolean(runnable(r, commands()));
    return h_flex().w(LIST_W - 8).h(ROW).px(8).gap(12).items_center().rounded(8)
      .when(sel, (el) => el.bg(t.selected ?? t.hover)).when(can, (el) => el.cursor_pointer())
      .accessibility_label(`${r.label}: ${r.keys.map((k) => keyLabel(k, mac)).join(" or ")}`)
      .child(div().w(380).flex_none().truncate().text_size(SIZE.body).text_color(t.foreground).child(r.label))
      // every key of the action on its line: strokes of a chord joined by "then", alternatives by "or"
      .child(h_flex().flex_none().gap(4).items_center().children(r.keys.flatMap((spec, n) => [
        ...(n ? [div().px(4).text_size(SIZE.meta).text_color(t.muted).child("or")] : []),
        ...keyLabel(spec, mac).split(" ").flatMap((stroke, j) => [
          ...(j ? [div().text_size(SIZE.meta).text_color(t.muted).child("then")] : []),
          ...(mac ? caps(stroke) : [stroke]).map((c) => this.keycap(t, c)),
        ]),
      ])))
      .child(div().flex_1().min_w(0))
      .when(Boolean(r.where), (el) => el.child(div().flex_none().text_size(SIZE.meta).text_color(t.muted).child(r.where)));
  }

  render() {
    const t = theme(), mac = window()?.platform === "macos", f = this.filter;
    const all = entries(keys());
    const shown = all.filter((e) => !f || [e.label, e.group, e.action, e.where, ...e.keys, ...e.keys.map((k) => keyLabel(k, mac))].join(" ").toLowerCase().includes(f));
    const rows = this.rows = [...new Set(shown.map((e) => e.group))].flatMap((g) => {
      const mine = shown.filter((e) => e.group === g);
      return [{ head: g, count: mine.length, id: `head:${g}` }, ...mine];
    });
    this.at = Math.max(1, Math.min(rows.length - 1, this.at));
    const move = (step) => {
      let i = this.at;
      for (let n = Math.abs(step); n > 0; n--) {
        let j = i + Math.sign(step);
        while (rows[j]?.head) j += Math.sign(step);
        if (!rows[j]) break;
        i = j;
      }
      this.at = i;
      this.scroll.scroll_to_item(i <= 1 ? 0 : i); // the first entry brings its heading along
    };
    const d = dialog(t, "help-crew", { title: "Keybinds" });
    return d.root.size_full().track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
        const step = { up: -1, down: 1, pageup: -10, pagedown: 10 }[e.key];
        if (step === undefined) return;
        move(step);
        cx.stop_propagation();
        cx.notify();
      })
      .child(d.header)
      .child(d.body.pb(8).child(field(t, h_flex().gap(8).items_center()
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(SIZE.body).text_color(t.foreground)), true)))
      .child(v_flex().relative().w(LIST_W).mx(16).flex_1().min_h(0)
        .when(rows.length > 0, (el) => el
          .child(v_virtual_list("help-list", rows.length, ROW, (i) => rows[i].id, (range) =>
            rows.slice(range.start, range.end).map((r, n) => this.row(t, r, range.start + n === this.at, mac)))
            .track_scroll(this.scroll).size_full().on_item_click((id) => this.go(rows.find((r) => r.id === id))))
          .child(Scrollbar.vertical("help-list").absolute().inset_0()))
        .when(!rows.length, (el) => el.child(div().p(16).text_size(SIZE.body).text_color(t.dim).child(`No keybind matches "${this.filter}"`))))
      .child(h_flex().flex_none().mt(8).px(16).py(12).gap(16).items_center().border_t(1).border_color(t.border)
        .child(kbdHint(t, "↵", "run"))
        .child(kbdHint(t, "↑↓", "select"))
        .child(kbdHint(t, "Esc", "close"))
        .child(div().flex_1())
        .child(div().text_size(SIZE.meta).text_color(t.muted).child(`${all.length} keybinds · edit them in keys.json`)));
  }
}
