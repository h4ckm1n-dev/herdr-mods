import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { theme, exec, appHome, props, closeOverlay } from "herdr";
import { dialog, field, tag, kbd, kbdHint, SIZE } from "./kit.js";

export default class ModManager extends View {
  init(_props, cx) {
    this.mods = [];
    this.busy = true;
    this.status = "Loading mods…";
    this.filter = "";
    this.at = 0;
    this.scroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Search mods" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value().toLowerCase();
      this.at = 0;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.flip(this.rows()[this.at], cx));
    this.input.focus();
    this.load(cx, ["list"]);
  }

  rows() {
    return this.mods.filter(m => `${m.id} ${m.desc}`.toLowerCase().includes(this.filter));
  }

  flip(m, cx) {
    if (!m || this.busy || !m.installed || m.id === "mod-manager") return;
    this.load(cx, ["set", m.id, m.on ? "off" : "on"]);
  }

  load(cx, args) {
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const result = await exec("python3", ["-I", `${appHome()}/mods/mod-manager/manage.py`, appHome(), ...args]);
        if (result.code !== 0) throw new Error(result.stderr.trim() || "Could not switch mod");
        this.mods = JSON.parse(result.stdout);
        this.scroll.scroll_to_item(this.at);
        this.status = null;
      } catch (error) {
        this.status = String(error.message ?? error);
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const installed = this.mods.filter(m => m.installed);
    const d = dialog(t, "mod-manager", {
      title: "OhMyHerdr Mods",
      glyph: image("mods/mod-manager/ohmyherdr-icon.png").size(30).flex_none(),
      status: h_flex().flex_none().gap(12).items_center()
        .when(installed.length > 0, el => el.child(div().text_size(SIZE.meta).text_color(t.dim)
          .child(`${installed.filter(m => m.on).length} of ${installed.length} on`)))
        .child(kbd(t, "Esc")),
    });
    return d.root.size_full().track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") closeOverlay(props().overlay);
        if (e.key === "up" || e.key === "down") {
          this.at = Math.max(0, Math.min(rows.length - 1, this.at + (e.key === "down" ? 1 : -1)));
          this.scroll.scroll_to_item(this.at);
          cx.stop_propagation();
          cx.notify();
        }
      })
      .child(d.header)
      .child(d.body.child(field(t, Input.new(this.input).w_full().h(28).text_size(SIZE.body), true)))
      .child(v_flex().relative().w(1008).mx(16).flex_1().min_h(0)
        .when(!rows.length && !this.busy, el => el.child(div().p(12).text_color(t.dim).child("No mods found")))
        .when(rows.length > 0, el => el.child(v_virtual_list("mods-list", rows.length, 48, i => rows[i].id,
          range => rows.slice(range.start, range.end).map((m, offset) => {
          const i = range.start + offset;
          const locked = this.busy || !m.installed || m.id === "mod-manager";
          return h_flex().w(1000).h(48).flex_none().px(12).gap(12).items_center().rounded(8)
            .when(i === this.at, el => el.bg(t.selected ?? t.hover))
            .accessibility_label(`${m.id}: ${m.installed ? m.on ? "enabled" : "disabled" : "not installed"}`)
            .when(!locked, el => el.cursor_pointer().hover(s => s.bg(t.hover)))
            .child(v_flex().flex_1().min_w(0).gap(4)
              .child(div().text_size(SIZE.body).text_color(t.foreground).child(m.id))
              .child(div().truncate().text_size(SIZE.meta).text_color(t.muted).child(m.desc)))
            // the switch already says on / off; a tag only for the rows it can't explain
            .when(!m.installed || m.id === "mod-manager", el => el.child(tag(t, m.installed ? "Always on" : "Not installed")))
            .child(h_flex().w(28).h(16).flex_none().p(2).rounded(8).bg(m.on && m.installed ? t.accent : t.border)
              .opacity(locked ? 0.5 : 1).when(m.on && m.installed, el => el.justify_end())
              .child(div().size(12).rounded(6).bg(t.foreground)));
        })).track_scroll(this.scroll).size_full().on_item_click((name, cx) => {
          this.at = this.rows().findIndex(m => m.id === name);
          this.flip(this.rows()[this.at], cx);
        })).child(Scrollbar.vertical("mods-list").absolute().inset_0())))
      .when(Boolean(this.status), el => el.child(div().px(16).pt(8).text_size(SIZE.meta)
        .text_color(this.busy ? t.muted : t.blocked).child(this.status)))
      .child(h_flex().mt(8).px(16).py(12).gap(16).items_center().border_t(1).border_color(t.border)
        .child(kbdHint(t, "↵", "switch"))
        .child(kbdHint(t, "↑↓", "select"))
        .child(kbdHint(t, "Esc", "close"))
        .child(div().flex_1())
        .child(div().text_size(SIZE.meta).text_color(t.dim).child("Applies live, a mod turned off keeps its files")));
  }
}
