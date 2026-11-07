// Claude Manager: every skill, agent and MCP server Claude Code loads from ~/.claude, on or off.
// manage.py reads them and writes the switch into ~/.claude/settings.json the native way
// (skillOverrides / permissions.deny Agent(name) / deniedMcpServers), so turning one back on
// leaves the file as it was. Type to filter, Tab for the kind, ↑/↓ and Enter (or click) to flip.
// New Claude Code sessions pick a change up; a session already running keeps what it loaded.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { header, field, kbd, kbdHint, chip, SIZE } from "./kit.js";
import { theme, exec, appHome, props, closeOverlay } from "herdr";

const ROW = 30;
// ponytail: fixed list width (dialog 1040 - padding 32); a virtual list takes its width from a row.
const LIST_W = 1008;
const KINDS = [["skills", "Skills", "skill"], ["agents", "Agents", "agent"], ["mcp", "MCP", "mcp"]];

export default class ClaudeManager extends View {
  init(_props, cx) {
    this.data = null;
    this.kind = "skills";
    this.offOnly = false;
    this.filter = "";
    this.at = 0;
    this.busy = new Set(); // "kind:name" being written
    this.status = "Reading ~/.claude…";
    this.queue = Promise.resolve(); // one write at a time: each is read-modify-write of settings.json
    this.script = `${appHome()}/mods/claude-manager/manage.py`;
    this.scroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Search skills, agents, MCP servers…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.flip(this.rows()[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    cx.spawn((cx) => this.load(cx));
  }

  async load(cx) {
    try {
      const r = await exec("python3", ["-I", this.script, "list"]);
      if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").at(-1) || `manage.py exited ${r.code}`);
      this.data = JSON.parse(r.stdout);
      this.status = null;
    } catch (e) {
      this.status = `Couldn't read Claude Code's config: ${e.message ?? e}`;
    }
    cx.notify();
  }

  rows() {
    const f = this.filter.toLowerCase();
    return (this.data?.[this.kind] ?? []).filter((x) => (!this.offOnly || !x.on)
      && (!f || x.name.toLowerCase().includes(f) || x.desc.toLowerCase().includes(f)));
  }

  flip(item, cx) {
    if (!item) return;
    const kind = KINDS.find(([k]) => k === this.kind)[2];
    const key = `${kind}:${item.name}`;
    if (this.busy.has(key)) return;
    const want = !item.on;
    item.on = want; // optimistic; load() below puts back what the file really says
    this.busy.add(key);
    cx.notify();
    this.queue = this.queue.then(async () => {
      try {
        const r = await exec("python3", ["-I", this.script, "set", kind, item.name, want ? "on" : "off"]);
        this.status = r.code === 0 ? null : `Couldn't turn ${item.name} ${want ? "on" : "off"}: ${r.stderr.trim().split("\n").at(-1)}`;
      } catch (e) {
        this.status = `Couldn't write settings.json: ${e.message ?? e}`;
      }
      this.busy.delete(key);
      await this.load(cx);
    });
  }

  setKind(k, cx) {
    this.kind = k;
    this.at = 0;
    this.scroll.scroll_to_item(0);
    cx.notify();
  }

  step(d, cx) {
    const n = this.rows().length;
    if (!n) return;
    this.at = Math.max(0, Math.min(n - 1, this.at + d));
    this.scroll.scroll_to_item(this.at);
    cx.notify();
  }

  toggle(c, on, busy) {
    return h_flex().w(28).h(16).flex_none().rounded(8).p(2).when(on, (el) => el.justify_end())
      .bg(on ? c.accent : c.border).opacity(busy ? 0.5 : 1)
      .child(div().size(12).rounded(6).bg(on ? c.popover : c.muted));
  }

  row(x, sel) {
    const c = theme();
    const kind = KINDS.find(([k]) => k === this.kind)[2];
    // No handlers in here: a virtual list's rows can't hold any (the list's on_item_click does clicks).
    return h_flex().h(ROW).w(LIST_W - 8).mx(4).px(8).gap(12).items_center().rounded(8).cursor_pointer().text_size(SIZE.body)
      .when(sel, (el) => el.bg(c.selected ?? c.hover))
      .child(this.toggle(c, x.on, this.busy.has(`${kind}:${x.name}`)))
      .child(div().w(260).flex_none().truncate().text_color(x.on ? c.foreground : c.dim).when(sel, (d) => d.font_medium()).child(x.name))
      .child(div().flex_1().min_w(0).truncate().text_size(SIZE.meta).text_color(c.dim).child(x.desc || " "))
      .when(Boolean(x.mode) && x.mode !== "off", (el) => el.child(div().flex_none().text_size(SIZE.micro).text_color(c.muted).child(x.mode)));
  }

  render() {
    const c = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const d = this.data;
    const off = (k) => (d?.[k] ?? []).filter((x) => !x.on).length;
    const allOff = KINDS.reduce((n, [k]) => n + off(k), 0);
    const kindChip = ([k, label]) => chip(c, `cm-kind-${k}`, `${label} ${d?.[k]?.length ?? 0}${off(k) ? ` · ${off(k)} off` : ""}`,
      { on: this.kind === k, onClick: (_e, cx) => this.setKind(k, cx) });

    return v_flex().id("claude-manager").track_focus(this.handle).size_full().min_h(0).bg(c.popover).text_color(c.foreground).text_size(SIZE.title)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return closeOverlay(props().overlay);
        if (k === "down") this.step(1, cx);
        else if (k === "up") this.step(-1, cx);
        else if (k === "pagedown") this.step(10, cx);
        else if (k === "pageup") this.step(-10, cx);
        else if (k === "tab") { const i = KINDS.findIndex(([x]) => x === this.kind); this.setKind(KINDS[(i + (e.modifiers.shift ? 2 : 1)) % 3][0], cx); }
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(header(c, { title: "Claude Manager", count: allOff ? `${allOff} off` : undefined, status: kbd(c, "Esc") }))
      .child(v_flex().flex_1().min_h(0).p(16).gap(12)
        .child(h_flex().gap(8).items_center()
          .child(field(c, Input.new(this.input).flex_1().min_w(0), true))
          .child(h_flex().flex_none().gap(2).children(KINDS.map(kindChip)))
          .child(chip(c, "cm-off", "Off only", { on: this.offOnly, onClick: (_e, cx) => { this.offOnly = !this.offOnly; this.at = 0; cx.notify(); } })))
        .when(Boolean(this.status), (el) => el.child(div().text_size(SIZE.meta).text_color(d ? c.blocked : c.dim).child(this.status)))
        .child(v_flex().relative().w(LIST_W).flex_1().min_h(0)
          .when(rows.length > 0, (el) => el
            .child(v_virtual_list("cm-list", rows.length, ROW, (i) => rows[i].name,
              (range) => rows.slice(range.start, range.end).map((x, j) => this.row(x, range.start + j === this.at)))
              .track_scroll(this.scroll).size_full()
              .on_item_click((name, cx) => {
                const i = this.rows().findIndex((x) => x.name === name);
                if (i < 0) return;
                this.at = i;
                this.flip(this.rows()[i], cx);
              }))
            .child(Scrollbar.vertical("cm-list").absolute().inset_0()))
          .when(Boolean(d) && rows.length === 0, (el) => el.child(v_flex().items_center().gap(8).pt(48)
            .child(div().text_size(SIZE.title).text_color(c.muted).child(this.offOnly ? "Nothing is off here" : "Nothing matches"))
            .child(div().text_size(SIZE.meta).text_color(c.dim).child("Try another word, or another kind")))))
        .child(h_flex().flex_none().gap(16).items_center().text_size(SIZE.meta).text_color(c.dim)
          .child(kbdHint(c, "↵", "on / off"))
          .child(kbdHint(c, "Tab", "kind"))
          .child(div().flex_1())
          .child(div().child("New Claude Code sessions pick changes up"))));
  }
}
