import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run } from "herdr";

// Next agent waiting for the person, any space; cycles from the shown one (what ⌘J does).
const nextBlocked = () => {
  const b = agents().filter((a) => a.status === "blocked");
  if (b.length) run("agent.focus", { terminal: b[(b.findIndex((a) => a.focused) + 1) % b.length].address });
};
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
        .when(needs > 0, el => el.child(h_flex().id("st-needs").gap(6).items_center().cursor_pointer().on_click(nextBlocked).tooltip("Go to the next agent that needs you").child(dot(t.blocked)).child(div().text_color(t.blocked).child(`${needs} ${needs === 1 ? "needs" : "need"} you`))))
        .when(working === 0 && needs === 0, el => el.child(div().text_color(t.dim).child(list.length ? plural(list.length, "agent") : "No agents"))))
      .child(div().flex_1());
  }
}
