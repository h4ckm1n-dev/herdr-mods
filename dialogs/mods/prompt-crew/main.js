// A text prompt. Enter saves, Esc cancels.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, theme } from "herdr";
// "↵ run": a key cap and what it does, as the Crew kit's kbdHint draws it (a mod can't import another's files).
const hint = (t, k, what) => h_flex().flex_none().gap(4).items_center()
  .child(div().flex_none().min_w(18).px(5).h(18).flex().items_center().justify_center().rounded(4).border_1().border_color(t.input).bg(t.surface).text_size(10.5).font_medium().text_color(t.foreground).child(k))
  .child(div().text_size(11).text_color(t.muted).child(what));
// The dialog's last line: a hairline, the keys on the left, then whatever goes right.
const footer = (t, keys, right) => h_flex().flex_none().pt(12).gap(16).items_center().border_t(1).border_color(t.border)
  .children(keys.map(([k, what]) => hint(t, k, what))).child(div().flex_1()).children(right);


export default class Prompt extends View {
  init(_props, cx) {
    this.text = props()?.value ?? "";
    this.input = InputState.new({ value: this.text });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", () => this.submit());
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  submit() {
    const p = props();
    closeOverlay(p.overlay);
    run(p.command.name, { ...(p.command.args ?? {}), name: this.text });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const label = (text) => div().pt(16).pb(7).text_size(11.5).text_color(t.dim).child(text);
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("prompt").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().min_h(0).rounded(8).border_1().border_color(t.accent).p(18).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(15).font_semibold().child((p.title ?? "").replace(/^./, (c) => c.toUpperCase())))
      .child(label("Name"))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .when(Boolean(p.hint), el => el.child(div().pt(6).text_size(11.5).text_color(t.dim).child(p.hint)))
      .child(div().flex_1())
      .child(footer(t, [["↵", "save"], ["Esc", "cancel"]], [
        button("pm-cancel", "Cancel", false, () => closeOverlay(p.overlay)),
        button("pm-save", "Save", true, () => this.submit()),
      ]).gap(8));
  }
}
