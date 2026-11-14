// Go to a tab. Drops from the Terminals layout's space chip (popup, at: "top"). Spaces with
// something that needs you come first, quiet spaces (no agent running)
// fold into "earlier". Type to filter, ↑/↓ and Enter to go, ctrl+d to close
// a tab, Esc to leave. Last rows: new work (a tab here, a space on this
// computer or on each connected machine).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { SIZE, ICON, dialog, field, kbd, tag, gutter, section, footer } from "./kit.js";
import { agents, spaces, terminals, run, hc, theme, settings, props, closeOverlay, openOverlay, shared, setShared } from "herdr";

const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// Space colors, kept by space id in shared "space.colors": a theme
// color name ("ansi6") or a picked #rrggbb. A space seen without one gets
// the theme color fewest spaces use, once; every mod does the same in the
// same order, so they agree, and adding or renaming spaces moves nothing.
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  if (p.name === "~") return t.dim;
  const c = spaceColors()[p.id] ?? PROJECT_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

export default class Picker extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Go to a tab, space or agent…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; this.chose = false; cx.notify(); });
    this.input.on("submit", () => {
      const pickable = this.rows().filter(r => r.kind === "ctx" || r.kind === "new" || r.kind === "space");
      // A search that found no tab: Enter does nothing rather than open a new tab, unless you arrowed to a row.
      if (this.filter && !this.chose && !pickable.some((r) => r.kind === "ctx")) return;
      this.go(pickable[this.at]);
    });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.at = null;
    this.scroll = 0;
    this.showEarlier = false;
    this.machines = [];
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "connected" && !m.temporary).map((m) => m.name);
      } catch {}
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  rows() {
    const f = this.filter.toLowerCase();
    const all = agents();
    const live = terminals().filter((x) => x.state === "live");
    const teamOf = (addrs) => {
      let n = 0;
      const walk = (a) => live.filter((x) => x.parent === a).forEach((k) => (n++, walk(k.address)));
      addrs.forEach(walk);
      return n;
    };
    const groups = spaces().map((w) => {
      const ctxs = w.tabs
        .map((ctx) => {
          const mine = all.filter((a) => a.tab === ctx.id);
          return { w, ctx, mine, team: teamOf(mine.map((a) => a.address)) };
        })
        .filter((c) => !f || [w.name, c.ctx.name, ...c.mine.map((a) => a.program?.name ?? "")].join(" ").toLowerCase().includes(f));
      return { w, ctxs };
    });
    const busy = groups.filter((p) => p.w.status && p.ctxs.length);
    const quiet = groups.filter((p) => !p.w.status && p.ctxs.length);
    busy.sort((a, b) => (b.w.status === "blocked") - (a.w.status === "blocked"));
    const out = [];
    const add = (p) => {
      out.push({ kind: "head", w: p.w });
      for (const c of p.ctxs) out.push({ kind: "ctx", ...c });
    };
    busy.forEach(add);
    if (!busy.length) quiet.forEach(add); // nothing running: no point folding every space away
    else if (quiet.length) {
      out.push({ kind: "earlier", count: quiet.length });
      if (this.showEarlier || f) quiet.forEach(add);
    }
    out.push({ kind: "new" });
    out.push({ kind: "space", machine: null });
    for (const m of this.machines) out.push({ kind: "space", machine: m });
    return out;
  }

  go(r) {
    if (!r) return;
    this.close();
    if (r.kind === "ctx") run("tab.select", { id: r.ctx.id });
    else if (r.kind === "new") run("tab.new");
    else if (r.kind === "space") run("space.new", { machine: r.machine ?? "" });
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const pickable = rows.filter((r) => r.kind === "ctx" || r.kind === "new" || r.kind === "space");
    // Opens on where you are.
    if (this.at === null) this.at = Math.max(0, pickable.findIndex((r) => r.kind === "ctx" && r.w.active && r.ctx.active));
    this.at = Math.min(this.at, pickable.length - 1);
    const sel = pickable[this.at];
    // One continuous strip: each row (and the group title before it) at a fixed
    // y. Scrolling moves the strip only as far as it takes to keep the selected
    // row in view, so the arrows can't run the selection off the list.
    const H = { head: 30, earlier: 34, new: 36, ctx: 32, space: 32 };
    const tops = [];
    let y = 0;
    rows.forEach((r) => { tops.push(y); y += H[r.kind] ?? 32; });
    const total = y;
    const height = Math.min(320, this.listHeight ?? 320);
    const fixed = total > height;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const si = rows.indexOf(sel);
    if (si >= 0) {
      if (tops[si] < this.scroll) this.scroll = tops[si];
      if (tops[si] + (H[sel.kind] ?? 32) > this.scroll + height) this.scroll = tops[si] + (H[sel.kind] ?? 32) - height;
    }
    const place = (el, i) =>
      fixed
        ? el.absolute().left(0).right(0).top(tops[i] - this.scroll).bottom(height - (tops[i] + (H[rows[i].kind] ?? 32) - this.scroll))
        : el;
    const visible = (i) => !fixed || (tops[i] + (H[rows[i].kind] ?? 32) > this.scroll && tops[i] < this.scroll + height);

    const row = (r) => {
      if (r.kind === "head") {
        return h_flex().h(H.head).px(12).pt(6).gap(8).items_center().text_size(SIZE.meta).font_semibold().text_color(t.muted)
          .child(h_flex().size(16).flex_none().rounded(4).bg(spaceColor(t, r.w) + "26").items_center().justify_center().text_size(SIZE.micro).font_semibold().text_color(spaceColor(t, r.w)).child([...r.w.name][0]?.toUpperCase() ?? "?")) // tinted, as in the spaces sidebar
          .child(div().min_w(0).truncate().child(r.w.name));
      }
      if (r.kind === "earlier") {
        return section(t, "pk-earlier", "Earlier", `${r.count} quiet ${r.count > 1 ? "spaces" : "space"}`, {
          open: this.showEarlier,
          onClick: (_e, cx) => { this.showEarlier = !this.showEarlier; cx.notify(); },
        }).h(H.earlier).mx(4).px(8).pt(10).items_center();
      }
      const on = r === sel;
      if (r.kind === "new" || r.kind === "space") {
        const label = r.kind === "new" ? "New tab" : r.machine ? `New space on ${r.machine}` : "New space";
        return h_flex()
          .id(r.kind === "new" ? "pk-new" : `pk-space-${r.machine ?? "here"}`)
          .mx(8).h(32).px(8).gap(8).items_center().rounded(8).text_size(SIZE.body).text_color(t.muted).cursor_pointer()
          .when(on, (el) => el.bg(t.selected))
          .hover((s) => s.bg(on ? t.selected : t.hover).text_color(t.foreground))
          .on_click(() => this.go(r))
          .child(gutter(t, svg(ICON("plus")).size(12).flex_none().text_color(t.dim)))
          .child(label);
      }
      const who = r.mine.map((a) => a.program?.name ?? "agent").join(" · ");
      const here = r.w.active && r.ctx.active;
      return h_flex()
        .id(`pk-${r.ctx.id}`)
        .mx(8).h(32).px(8).gap(8).rounded(8).items_center().cursor_pointer().text_size(SIZE.body)
        .when(on, (el) => el.bg(t.selected))
        .hover((s) => s.bg(on ? t.selected : t.hover))
        .on_click(() => this.go(r))
        .child(gutter(t, r.ctx.status))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(here ? t.foreground : t.muted).child(r.ctx.name))
        .when(r.ctx.status === "blocked", (el) => el.child(tag(t, "Needs you", t.blocked)))
        .when(r.ctx.status === "done", (el) => el.child(tag(t, "Finished", t.done)))
        .child(div().flex_none().max_w(200).truncate().text_size(SIZE.meta).text_color(t.dim).child(who + (r.team ? `  +${r.team}` : "")));
    };

    const d = dialog(t, "picker", { title: "Go to…", glyph: svg(ICON("search")).size(14).flex_none().text_color(t.muted) });
    return d.root.size_full()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") { this.at = (this.at + 1) % pickable.length; this.chose = true; }
        else if (k === "up") { this.at = (this.at + pickable.length - 1) % pickable.length; this.chose = true; }
        else if (k === "d" && e.modifiers.control) {
          if (sel?.kind === "ctx") {
            this.close();
            run("tab.close", { id: sel.ctx.id });
          }
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(d.header)
      .child(d.body.pb(8)
        .child(field(t, h_flex().gap(8).items_center()
          .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(SIZE.body).text_color(t.foreground)), true)))
      .child(
        v_flex()
          .id("pk-list")
          .on_size_change((size, cx) => {
            this.listHeight = size.height / settings().zoom;
            cx.notify();
          })
          .flex_1()
          .min_h(0)
          .mb(8)
          .when(fixed, (el) =>
            el.overflow_hidden().on_scroll_wheel((e, cx) => {
              this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
              // The selection follows the wheel, so the next frame doesn't scroll back to it.
              while (this.at < pickable.length - 1 && tops[rows.indexOf(pickable[this.at])] < this.scroll) this.at++;
              while (this.at > 0 && tops[rows.indexOf(pickable[this.at])] + (H[pickable[this.at].kind] ?? 32) > this.scroll + height) this.at--;
              cx.notify();
            }))
          .children(rows.map((r, i) => (visible(i) ? place(row(r), i) : null)).filter(Boolean)),
      )
      .child(footer(t, "pk-foot").child(h_flex().gap(12).items_center().children([["↑↓", "Move"], ["↵", "Go"], ["⌃D", "Close tab"]]
        .map(([k, w]) => h_flex().gap(4).items_center().child(kbd(t, k)).child(div().text_size(SIZE.meta).text_color(t.dim).child(w))))));
  }
}
