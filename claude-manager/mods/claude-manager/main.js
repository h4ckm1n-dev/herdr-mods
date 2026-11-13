// Claude Manager: every skill, command, agent, MCP server, hook and plugin Claude Code loads
// from ~/.claude, on or off. manage.py reads them and writes the switch into ~/.claude/settings.json
// the native way (skillOverrides, permissions.deny Agent(name), deniedMcpServers, enabledPlugins,
// disableAllHooks); one hook, which has no native switch, is stashed and put back in place. Type to filter, Tab for the kind, ↑/↓ and Enter (or click) to flip.
// New Claude Code sessions pick a change up; a session already running keeps what it loaded.

// Same dialog as OhMyHerdr Mods: its shell, two-line rows with the switch at the right, its keycap footer.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { dialog, field, kbd, kbdHint, chip, tag, SIZE, CORAL } from "./kit.js";
import { theme, exec, appHome, props, closeOverlay } from "herdr";

const ROW = 48;
// ponytail: fixed list width (dialog 1040 - padding 32); a virtual list takes its width from a row.
const LIST_W = 1008;
// [list key, label, manage.py kind]; each has icons/<list key>.svg
const KINDS = [["skills", "Skills", "skill"], ["commands", "Commands", "command"], ["agents", "Agents", "agent"],
  ["mcp", "MCP", "mcp"], ["hooks", "Hooks", "hook"], ["plugins", "Plugins", "plugin"]];
const icon = (k) => svg(`mods/claude-manager/icons/${k}.svg`).size(12).flex_none();

export default class ClaudeManager extends View {
  init(_props, cx) {
    this.data = null;
    this.kind = "skills";
    this.offOnly = false;
    this.filter = "";
    this.at = 0;
    this.busy = new Set(); // "kind:id" being written
    this.status = "Reading ~/.claude…";
    this.lock = Promise.resolve(); // one write at a time: each is read-modify-write of settings.json
    this.script = `${appHome()}/mods/claude-manager/manage.py`;
    this.scroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Search" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.flip(this.rows()[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    // Naming a profile: this field takes the search field's place until Enter or Esc.
    this.naming = false;
    this.nameInput = InputState.new({ placeholder: "Profile name, Enter to save what is off now" });
    this.nameInput.on("submit", (_e, cx) => this.saveProfile(cx));
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
      && (!f || x.name.toLowerCase().includes(f) || (x.event ?? "").toLowerCase().includes(f) || x.desc.toLowerCase().includes(f)));
  }

  flip(item, cx) {
    if (!item) return;
    const kind = KINDS.find(([k]) => k === this.kind)[2];
    const key = `${kind}:${item.id}`;
    if (this.busy.has(key)) return;
    const want = !item.on;
    item.on = want; // optimistic; load() below puts back what the file really says
    this.busy.add(key);
    cx.notify();
    this.write(cx, key, ["set", kind, item.id, want ? "on" : "off"], (ok, err) =>
      ok ? null : `Couldn't turn ${item.name} ${want ? "on" : "off"}: ${err}`);
  }

  // Runs manage.py in its own task (its own cx: a handler's cx is dead once it returns), one at a
  // time, then reloads what the files say. msg(ok, err) is the status line after.
  write(cx, key, args, msg) {
    cx.spawn(async (cx) => {
      const prev = this.lock;
      let release;
      this.lock = new Promise((r) => (release = r));
      let status;
      try {
        await prev;
        const r = await exec("python3", ["-I", this.script, ...args]);
        status = msg(r.code === 0, r.stderr.trim().split("\n").at(-1));
      } catch (e) {
        status = msg(false, e.message ?? String(e));
      } finally {
        release(); // never left pending or rejected: the next write always runs
      }
      this.busy.delete(key);
      await this.load(cx); // clears the status line
      this.status = status;
      cx.notify();
    });
  }

  // ⌘⌫ once names what goes, ⌘⌫ again moves it to the Trash (Finder's Put Back undoes it).
  trash(cx) {
    const x = this.rows()[this.at];
    const kind = KINDS.find(([k]) => k === this.kind)[2];
    if (!x || !["skill", "agent"].includes(kind)) return;
    if (this.confirm !== `${kind}:${x.id}`) {
      this.confirm = `${kind}:${x.id}`;
      this.status = `⌘⌫ again moves ${x.name} to the Trash${kind === "skill" ? ", its whole folder" : ""}`;
      return cx.notify();
    }
    this.confirm = null;
    this.busy.add(`${kind}:${x.id}`);
    this.status = `Moving ${x.name} to the Trash…`;
    cx.notify();
    this.write(cx, `${kind}:${x.id}`, ["delete", kind, x.id], (ok, err) =>
      ok ? `${x.name} is in the Trash` : `Couldn't trash ${x.name}: ${err}`);
  }

  // A profile is a named set of what is off, across every kind (manage.py profile ...).
  profiles() { return this.data?.profiles ?? []; }

  applyProfile(p, cx) {
    if (!p || this.busy.has("profile")) return;
    this.confirm = null;
    this.busy.add("profile");
    this.status = `Applying ${p.name}…`;
    cx.notify();
    this.write(cx, "profile", ["profile", "apply", p.name], (ok, err) => ok ? `Profile ${p.name} applied` : `Couldn't apply ${p.name}: ${err}`);
  }

  name(on, cx) {
    this.naming = on;
    this.confirm = null;
    this.status = null;
    if (on) this.nameInput.set_value("");
    (on ? this.nameInput : this.input).focus();
    cx.notify();
  }

  saveProfile(cx) {
    const n = this.nameInput.value().trim();
    if (!n) return;
    this.name(false, cx);
    this.busy.add("profile");
    this.write(cx, "profile", ["profile", "save", n], (ok, err) => ok ? `Profile ${n} saved` : `Couldn't save ${n}: ${err}`);
  }

  // Right-click once names what goes, again deletes it (the profile only: no switch moves).
  dropProfile(p, cx) {
    if (this.confirm !== `profile:${p.name}`) {
      this.confirm = `profile:${p.name}`;
      this.status = `Right-click ${p.name} again to delete the profile`;
      return cx.notify();
    }
    this.confirm = null;
    this.busy.add("profile");
    this.write(cx, "profile", ["profile", "delete", p.name], (ok, err) => ok ? `Profile ${p.name} deleted` : `Couldn't delete ${p.name}: ${err}`);
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
    return h_flex().w(28).h(16).flex_none().p(2).rounded(8).bg(on ? c.accent : c.border)
      .opacity(busy ? 0.5 : 1).when(on, el => el.justify_end())
      .child(div().size(12).rounded(6).bg(c.foreground));
  }

  // The OhMyHerdr Mods row: name over its description, the switch at the right edge. The switch says
  // on / off; a tag only for what it can't (a skill's mode, the event a group of hooks answers).
  row(x, sel, prev) {
    const c = theme();
    const kind = KINDS.find(([k]) => k === this.kind)[2];
    const mode = x.on && x.mode && x.mode !== "on" ? x.mode : null;
    const event = this.kind === "hooks" && x.event && x.event !== prev?.event ? x.event : null;
    // No handlers in here: a virtual list's rows can't hold any (the list's on_item_click does clicks).
    return h_flex().w(LIST_W - 8).h(ROW).flex_none().px(12).gap(12).items_center().rounded(8).cursor_pointer()
      .when(sel, (el) => el.bg(c.selected ?? c.hover))
      .accessibility_label(`${x.name}: ${x.on ? "on" : "off"}`)
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(div().truncate().text_size(SIZE.body).text_color(x.on ? c.foreground : c.dim).child(x.name))
        .child(div().truncate().text_size(SIZE.meta).text_color(x.on ? c.muted : c.dim).child(x.desc || " ")))
      .when(Boolean(event), (el) => el.child(tag(c, event)))
      .when(Boolean(mode), (el) => el.child(tag(c, mode)))
      .child(this.toggle(c, x.on, this.busy.has(`${kind}:${x.id}`)));
  }

  render() {
    const c = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const data = this.data;
    const all = data?.[this.kind] ?? [];
    // each kind's chip carries how many of it load: what the footer gauges used to say
    const kindChip = ([k, label]) => chip(c, `cm-kind-${k}`,
      h_flex().gap(6).items_center().child(icon(k).text_color(this.kind === k ? c.foreground : c.muted)).child(label)
        .when(Boolean(data), (el) => el.child(div().text_color(c.dim).child(`${data[k].filter((x) => x.on).length}/${data[k].length}`))),
      { on: this.kind === k, onClick: (_e, cx) => this.setKind(k, cx) });
    const d = dialog(c, "claude-manager", {
      title: "Claude Manager",
      glyph: svg("mods/claude-manager/claude.svg").size(20).flex_none().text_color(CORAL),
      status: h_flex().flex_none().gap(12).items_center()
        .when(all.length > 0, (el) => el.child(div().text_size(SIZE.meta).text_color(c.dim)
          .child(`${all.filter((x) => x.on).length} of ${all.length} on`)))
        .child(kbd(c, "Esc")),
    });

    return d.root.size_full().track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") { if (!this.naming) return closeOverlay(props().overlay); this.name(false, cx); return cx.stop_propagation(); }
        if (this.naming) return;
        if (k === "backspace" && e.modifiers.platform) { this.trash(cx); return cx.stop_propagation(); }
        if (k === "s" && e.modifiers.platform) { this.name(true, cx); return cx.stop_propagation(); }
        if (/^[1-9]$/.test(k) && e.modifiers.platform) { this.applyProfile(this.profiles()[Number(k) - 1], cx); return cx.stop_propagation(); }
        if (this.confirm) { this.confirm = null; this.status = null; }
        if (k === "down") this.step(1, cx);
        else if (k === "up") this.step(-1, cx);
        else if (k === "pagedown") this.step(10, cx);
        else if (k === "pageup") this.step(-10, cx);
        else if (k === "tab") { const i = KINDS.findIndex(([x]) => x === this.kind); this.setKind(KINDS[(i + (e.modifiers.shift ? KINDS.length - 1 : 1)) % KINDS.length][0], cx); }
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(d.header)
      .child(d.body
        .child(field(c, Input.new(this.naming ? this.nameInput : this.input).w_full().h(28).text_size(SIZE.body), true))
        .child(h_flex().gap(2).items_center()
          .children(KINDS.map(kindChip))
          .child(div().flex_1())
          .child(chip(c, "cm-off", "Off only", { on: this.offOnly, onClick: (_e, cx) => { this.offOnly = !this.offOnly; this.at = 0; cx.notify(); } })))
        // profiles: the lit one is what the switches say now; ⌘1-9 applies, right-click deletes
        .when(Boolean(data), (el) => el.child(h_flex().gap(2).items_center()
          .child(div().flex_none().mr(6).text_size(SIZE.meta).text_color(c.dim).child("Profiles"))
          .children(this.profiles().map((p, i) => div().flex_none()
            .on_mouse_down("right", (_e, cx) => { this.dropProfile(p, cx); cx.stop_propagation(); })
            .child(chip(c, `cm-profile-${i}`,
              h_flex().gap(6).items_center().child(p.name).child(div().text_color(c.dim).child(i < 9 ? `⌘${i + 1}` : "")),
              { on: p.active, tip: p.off ? `${p.off} off` : "Everything on", onClick: (_e, cx) => this.applyProfile(p, cx) }))))
          .when(!this.profiles().length, (d) => d.child(div().mr(6).text_size(SIZE.meta).text_color(c.muted).child("None yet: set the switches, then save them as one")))
          .child(div().flex_1())
          .child(chip(c, "cm-profile-save", "Save as…", { on: this.naming, tip: "Save what is off now as a profile (⌘S)", onClick: (_e, cx) => this.name(!this.naming, cx) })))))
      .child(v_flex().relative().w(LIST_W).mx(16).flex_1().min_h(0)
        .when(Boolean(data) && !rows.length, (el) => el.child(div().p(12).text_color(c.dim)
          .child(this.offOnly && !this.filter ? "Nothing is off here" : "Nothing matches")))
        .when(rows.length > 0, (el) => el
          .child(v_virtual_list("cm-list", rows.length, ROW, (i) => rows[i].id,
            (range) => rows.slice(range.start, range.end).map((x, j) => this.row(x, range.start + j === this.at, rows[range.start + j - 1])))
            .track_scroll(this.scroll).size_full()
            .on_item_click((name, cx) => {
              const i = this.rows().findIndex((x) => x.id === name);
              if (i < 0) return;
              this.at = i;
              this.confirm = null;
              this.flip(this.rows()[i], cx);
            }))
          .child(Scrollbar.vertical("cm-list").absolute().inset_0())))
      .when(Boolean(this.status), (el) => el.child(div().px(16).pt(8).text_size(SIZE.meta)
        .text_color(/^Couldn't/.test(this.status) ? c.blocked : this.confirm ? c.working : c.muted).child(this.status)))
      .child(h_flex().mt(8).px(16).py(12).gap(16).items_center().border_t(1).border_color(c.border)
        .child(kbdHint(c, "↵", "switch"))
        .child(kbdHint(c, "↑↓", "select"))
        .child(kbdHint(c, "Tab", "kind"))
        .when(this.kind === "skills" || this.kind === "agents", (el) => el.child(kbdHint(c, "⌘⌫", "trash")))
        .child(kbdHint(c, "⌘1-9", "profile"))
        .child(kbdHint(c, "⌘S", "save profile"))
        .child(kbdHint(c, "Esc", "close"))
        .child(div().flex_1())
        .child(div().text_size(SIZE.meta).text_color(c.dim).child("New Claude Code sessions pick a change up")));
  }
}
