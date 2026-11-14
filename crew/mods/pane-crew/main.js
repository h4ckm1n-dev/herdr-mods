// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane-crew" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.
// Crew anatomy: status gutter, program icon, 12px title, 11px dim folder; actions on hover.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home } from "herdr";
import { SIZE, ICON, gutter, tag, iconButton } from "./kit.js";

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, file, tip, command, args) {
    return iconButton(t, id, `mods/pane-crew/${file}.svg`, (_e, cx) => { cx.stop_propagation(); run(command, args); }, { tip, size: 14 }).size(24);
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    const where = folder(p.cwd);
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(12)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(SIZE.body)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      // double-click the header to zoom the pane, and again to bring the others back
      .on_mouse_down("left", (e) => { if (e.click_count === 2) run("pane.zoom", { pane }); })
      .when(Boolean(st) && st !== "idle", (el) => el.child(gutter(t, st)))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_semibold().text_color(t.foreground).child(name))
      .child(h_flex().flex_1().min_w(0).gap(4).items_center().text_color(t.dim)
        .when(Boolean(where), (el) => el.child(svg(ICON("folder")).size(11).flex_none()).child(div().min_w(0).truncate().text_size(SIZE.meta).child(where))))
      .when(st === "blocked", (el) => el.child(tag(t, "Needs you", t.blocked)))
      .when(p.zoomed, (el) => el.child(tag(t, "Zoomed")))
      .when(this.hovered, (el) => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "Split right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "Split down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", p.zoomed ? "Unzoom" : "Zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "Close pane", "pane.close", { pane })));
  }
}
