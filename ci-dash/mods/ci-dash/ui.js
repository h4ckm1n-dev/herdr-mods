// CI-specific pieces use Crew's neutral controls and its compact type scale.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { settings } from "herdr";
import * as K from "./kit.js";

export const MOD = "ci-dash";
export const icon = (name) => `mods/${MOD}/${name}.svg`;
export const tint = (color, alpha = "24") => (/^#[0-9a-f]{6}$/i.test(color || "") ? color + alpha : color);
const mono = () => settings().font_family ?? "JetBrains Mono";

// Neutral metadata is plain text; only a semantic state gets a restrained fill.
export function pill(t, { label, color, glyph, symbol, spin = false, code = false }) {
  return h_flex().h(18).gap(4).flex_none().items_center().rounded(4).text_size(K.SIZE.micro)
    .when(Boolean(color), e => e.px(6).bg(tint(color, "18"))).text_color(color || t.dim)
    .when(code, e => e.font_family(mono()))
    .when(Boolean(glyph) && !spin, e => e.child(K.dot(color || t.dim, 5)))
    .when(Boolean(symbol) && !spin, e => e.child(svg(icon(symbol)).size(11).flex_none()))
    .when(spin, e => e.child(K.spinner(color || t.working, 11)))
    .child(div().truncate().child(label));
}

export function section(t, label, count, color, meta = "") {
  return h_flex().flex_none().w_full().px(16).pt(12).pb(4).gap(8).items_center().text_size(K.SIZE.meta)
    .child(div().flex_none().font_medium().text_color(color || t.muted).child(label))
    .child(div().flex_none().text_color(t.dim).child(String(count)))
    .when(Boolean(meta), e => e.child(div().flex_1().min_w(0).truncate().text_right().text_color(t.dim).child(meta)));
}

export function searchBox(t, id, state, { right = "", onClear } = {}) {
  const typed = state.value().length > 0;
  return h_flex().id(id).h(32).flex_none().px(8).gap(8).items_center().rounded(8).bg(t.background)
    .border_1().border_color(t.input).cursor_text()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(svg(icon("search")).size(14).flex_none().text_color(t.dim))
    .child(Input.new(state).h_full().flex_1().min_w(0).text_size(K.SIZE.body).text_color(t.foreground))
    .when(Boolean(right), e => e.child(div().flex_none().text_size(K.SIZE.micro).text_color(t.dim).child(right)))
    .when(typed && Boolean(onClear), e => e.child(K.iconButton(t, `${id}-clear`, icon("close"), (_e, cx) => onClear(cx), { tip: "Clear filter", size: 11 }).size(20)));
}

export function busy(t, title, detail = "") {
  return K.empty(t, { glyph: K.spinner(t.dim, 16), title, hint: detail });
}

export function iconTile(t, name, _color, _size = 28) {
  return div().w(16).flex_none().flex().items_center().justify_center()
    .child(svg(icon(name)).size(14).text_color(t.dim));
}

export function segmented(t, id, options, value, onPick) {
  return K.segmented(t, id, options.map(option => [option, option]), value, onPick);
}

export function stepper(t, id, steps, current, wide, onGo) {
  const items = [];
  steps.forEach((label, i) => {
    const n = i + 1, done = n < current, active = n === current;
    if (i > 0) items.push(div().flex_1().min_w(4).h(1).bg(t.border));
    items.push(h_flex().id(`${id}-${n}`).flex_none().gap(4).items_center()
      .when(done, e => e.cursor_pointer().on_click((_e, cx) => onGo(n, cx)))
      .child(div().size(18).rounded(4).flex_none().flex().items_center().justify_center().text_size(K.SIZE.micro)
        .bg(active ? t.selected : t.chrome).text_color(active ? t.foreground : t.dim)
        .child(done ? svg(icon("check")).size(11) : String(n)))
      .when(wide || active, e => e.child(div().text_size(K.SIZE.meta).text_color(active ? t.foreground : t.dim).child(label))));
  });
  return h_flex().id(id).flex_none().w_full().px(16).py(8).gap(8).items_center().border_b(1).border_color(t.border).children(items);
}

export function filterChip(t, id, label, count, active, onClick, color) {
  return h_flex().id(id).h(22).px(8).gap(4).flex_none().items_center().rounded(6).text_size(K.SIZE.meta).cursor_pointer()
    .when(active, e => e.bg(t.selected)).text_color(active ? t.foreground : t.muted)
    .hover(s => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => onClick(cx))
    .when(Boolean(color), e => e.child(K.dot(color, 5)))
    .child(label).child(div().text_size(K.SIZE.micro).text_color(t.dim).child(String(count)));
}
