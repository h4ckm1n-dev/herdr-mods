import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme } from "herdr";
import { SIZE, ICON, spinner, dot, tag, plural } from "./kit.js";

export default class WorkspaceStatus extends View {
  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const working = list.filter(a => a.status === "working").length;
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().text_color(t.muted)
      .child(svg(ICON(icon)).size(12).flex_none().text_color(t.dim)).child(div().truncate().child(text));
    return h_flex().size_full().px(12).gap(12).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(SIZE.meta).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(h_flex().gap(6).items_center().child(svg(ICON("branch")).size(12).flex_none().text_color(t.dim)).child(tag(t, space.branch))))
      .child(h_flex().gap(12).items_center()
        .when(working > 0, el => el.child(h_flex().gap(6).items_center().child(spinner(t.working, 11)).child(div().text_color(t.working).child(`${working} working`))))
        .when(needs > 0, el => el.child(h_flex().gap(6).items_center().child(dot(t.blocked)).child(div().text_color(t.blocked).child(`${needs} ${needs === 1 ? "needs" : "need"} you`))))
        .when(working === 0 && needs === 0, el => el.child(div().text_color(t.dim).child(list.length ? plural(list.length, "agent") : "No agents"))))
      .child(div().flex_1());
  }
}
