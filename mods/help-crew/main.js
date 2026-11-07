// Keybinds, Crew style: every binding from keys.json, grouped, filterable, keys drawn as keycaps.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { keys, props, closeOverlay, theme, window } from "herdr";
import { SIZE, ICON, dialog, field, keyLabel } from "./kit.js";

const GROUPS = [["Spaces", /^space\./], ["Tabs", /^tab\./], ["Panes", /^pane\./], ["Agents", /^agent\./],
  ["Terminal", /^terminal\.|^send:/], ["Layout", /^layout\./], ["Mods", /^mod\./], ["App", /./]];

// readline sequences the terminal keybinds send, by what they do
const SEND = { "\u0017": "Delete word", "\u0015": "Delete line", "\u0001": "Line start", "\u0005": "Line end",
  "\u001bb": "Word left", "\u001bf": "Word right", "\u001b\u007f": "Delete word" };
// "space.select:1" -> "Select space 1"-ish: verb first, sentence case
function label(action) {
  if (action.startsWith("send:")) {
    const seq = action.slice(5);
    return SEND[seq] ?? `Type ${JSON.stringify(seq)}`;
  }
  const [name, arg] = action.split(":");
  const [noun, ...rest] = name.split(".");
  const words = [...rest.join(" ").split("_"), noun === "app" ? "" : noun].filter(Boolean).join(" ").replace(/_/g, " ");
  const s = arg ? `${words} ${arg}` : words;
  return s[0].toUpperCase() + s.slice(1);
}
// a stroke "⌥⌘[" -> one cap per symbol, the key last
const caps = (text) => text.match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? [];

export default class HelpCrew extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Filter keybinds" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value().toLowerCase(); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  keycap(t, text) {
    return div().flex_none().min_w(20).h(20).px(5).flex().items_center().justify_center().rounded(4)
      .border_1().border_color(t.border).bg(t.surface).text_size(SIZE.micro).text_color(t.muted).child(text);
  }

  row(t, k, i, mac) {
    const strokes = keyLabel(k.keys, mac).split(" ");
    return h_flex().id(`k-${i}`).h(32).px(8).gap(12).items_center().rounded(6).hover((s) => s.bg(t.hover))
      .child(div().flex_1().min_w(0).truncate().text_size(SIZE.body).text_color(t.foreground).child(label(k.action)))
      .when(k.section !== "global", (el) => el.child(div().flex_none().text_size(SIZE.micro).text_color(t.dim).child(k.section)))
      .child(h_flex().flex_none().gap(4).items_center()
        .children(strokes.flatMap((st, j) => [
          ...(j ? [div().text_size(SIZE.micro).text_color(t.dim).child("then")] : []),
          ...(mac ? caps(st) : [st]).map((c) => this.keycap(t, c)),
        ])));
  }

  // groups in two columns, split where the row counts balance (16:9 dialog, so wide not tall)
  columns(groups) {
    const total = groups.reduce((n, [, r]) => n + r.length + 1, 0);
    let n = 0, cut = groups.findIndex(([, r]) => (n += r.length + 1) >= total / 2) + 1;
    return [groups.slice(0, cut), groups.slice(cut)];
  }

  render() {
    const t = theme(), mac = window()?.platform === "macos", f = this.filter;
    const all = keys().filter((k) => !f || k.keys.includes(f) || label(k.action).toLowerCase().includes(f) || keyLabel(k.keys, mac).toLowerCase().includes(f));
    const seen = new Set();
    const groups = GROUPS.map(([name, re]) => [name, all.filter((k) => !seen.has(k) && re.test(k.action) && seen.add(k))])
      .filter(([, rows]) => rows.length);
    const d = dialog(t, "help-crew", { title: "Keybinds" });
    let i = 0;
    return d.root.size_full().track_focus(this.handle)
      .on_key_down((e) => { if (e.key === "escape") closeOverlay(props().overlay); })
      .child(d.header)
      .child(d.body.pb(8).child(field(t, h_flex().gap(8).items_center()
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(SIZE.body).text_color(t.foreground)), true)))
      .child(h_flex().id("help-list").flex_1().min_h(0).overflow_y_scrollbar().items_start().px(8).pb(12).gap(16)
        .when(!groups.length, (el) => el.child(div().px(8).py(16).text_size(SIZE.body).text_color(t.dim).child("No keybind matches")))
        .children(this.columns(groups).filter((c) => c.length).map((col, ci) => v_flex().id(`col-${ci}`).flex_1().min_w(0).gap(12)
          .children(col.map(([name, rows]) => v_flex().gap(2)
            .child(h_flex().px(8).h(24).gap(8).items_center()
              .child(div().text_size(SIZE.meta).font_medium().text_color(t.muted).child(name))
              .child(div().text_size(SIZE.micro).text_color(t.dim).child(String(rows.length))))
            .children(rows.map((k) => this.row(t, k, i++, mac))))))));
  }
}
