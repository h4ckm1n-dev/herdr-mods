// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, nextCommand } from "herdr";
import { ICON, SIZE, dot, empty, gutter, iconButton, menuItem, plural, section, spinner, statusColor, surfaceless, tag, header as panelHeader, foldOnClick, navKey, trackTerminal, keyHints } from "./kit.js";
import { startCrew, crewLines, conflictBand, nextBlocked, hasTasks } from "./crew.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working", 1: "idle" };
const SECTION_ICON = { done: "check", idle: "minus" };


function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The color of an agent's space (shared "space.colors": a theme color name or #rrggbb, as the
// Spaces list draws it); the home space ("~") has none.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
function spaceFill(t, a) {
  const c = (shared("space.colors") ?? {})[a.space];
  return c ? (c.startsWith("#") ? c : MARK[c] ?? t[c]) : null;
}
// A 3px bar on the row's left edge, in its space's color; absolute, so nothing moves.
const spaceBar = (fill) => div().absolute().left(0).top(8).bottom(8).w(3).rounded(2).bg(fill);

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    this.kb = cx.focus_handle(); // keyboard focus (DESIGN.md "Keyboard")
    this.cur = null; // the cursor, as an item id (follows the data)
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") { this.kb.focus(); cx.notify(); }
      }
    });
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
    startCrew(this, cx); // what Crew showed: activity, context, subagents, conflicts
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  // The sort popup: a Crew menu (popover, p 4, 30px items, a dim 11px caption).
  sortMenu(t) {
    const on = sortOf().id;
    return v_flex().w_full().p(4).bg(t.popover).text_color(t.foreground).text_size(SIZE.body)
      .child(div().px(8).pt(4).pb(4).text_size(SIZE.meta).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => menuItem(t, `sort-${s.id}`, {
        icon: s.icon,
        label: s.label,
        onClick: () => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        },
      }).when(s.id === on, (el) => el.child(svg(ICON("check")).size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  // A sub-agent: tree lines from under its parent's icon, then its own status gutter.
  subRow(t, s, shown, cur = false) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.muted);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39) // the parent's icon is centred at 40: the tree hangs from it
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .items_center()
      .cursor_pointer()
      .text_size(SIZE.body)
      .when(on || cur, (el) => el.bg(t.selected))
      .when(cur, (el) => el.border_1().border_color(t.accent))
      .hover((s) => s.bg(on || cur ? t.selected : t.hover))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .child(gutter(t, st))
      .when(Boolean(pic), el => el.child(div().ml(4).flex_none().child(pic)))
      .child(div().ml(8).flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address));
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    trackTerminal();
    const kb = this.kb.is_focused();
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, kb && curId === `sub-${s.t.address}`))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      const tip = open ? "Fold" : subs.length ? `Show tasks and ${plural(subs.length, "sub-agent")}` : "Show tasks";
      return h_flex()
        .id(`fold-${a.address}`)
        .h(20)
        .px(4)
        .gap(4)
        .flex_none()
        .items_center()
        .rounded(6)
        .text_size(SIZE.micro)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(tip)
        .accessibility_label(tip)
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(ICON(`chevron-${open ? "down" : "right"}`)).size(12).flex_none())
        .when(!open && subs.length > 0, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabLabels = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, title(tab, leads.get(tab.id))]));
    const labels = new Map(list.map(a => [a.address, tabLabels.get(a.tab) ?? (a.title || a.program?.name || "")]));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        // The rail: number + status gutter. Icon-less, so the tooltip names the agent.
        const tip = [a.space_name, label(a)].filter(Boolean).join(" \u00b7 ");
        const railFill = spaceFill(t, a);
        return h_flex()
          .id(`ag-${a.address}`)
          .relative()
          .when(Boolean(railFill), (el) => el.child(spaceBar(railFill)))
          .h(26)
          .mx(4)
          .px(4)
          .flex_none()
          .items_center()
          .gap(4)
          .rounded(6)
          .cursor_pointer()
          .when(a.focused, (el) => el.bg(t.selected))
          .hover((s) => s.bg(a.focused ? t.selected : t.hover))
          .when(Boolean(tip), (el) => el.tooltip(tip).accessibility_label(tip))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_size(SIZE.meta).text_color(a.focused ? t.foreground : t.muted).child(String(i + 1)))
          .child(gutter(t, a.status));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pinTip = isPinned ? "Unpin" : "Pin to the top";
      const pin = div()
        .id(`pin-${a.address}`)
        .size(20)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(6)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(pinTip)
        .accessibility_label(pinTip)
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(ICON(isPinned ? "pin-off" : "pin")).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      // the home space ("~") names nothing: such a row leads with what the agent is on instead
      const sp = a.space_name && a.space_name !== "~" ? a.space_name : null;
      const name = full ? sp ?? more ?? label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      // Where a "Needs you" section header already says it, the gutter's dot is enough.
      const needsYou = a.status === "blocked" && !(byPriority && !isPinned);
      // Crew row anatomy: 16px status gutter (spinner / 8px dot), 12px semibold name, dim 11px meta right.
      // Claude/Codex agents may carry lines under the row (crew.js): then the selection, hover and click
      // belong to the block holding both, so they read as one item.
      const lines = crewLines(this, t, a, now), sel = a.focused || (kb && curId === `ag-${a.address}`);
      const fill = spaceFill(t, a);
      const top = h_flex()
        .id(`ag-${a.address}`)
        .relative()
        .when(Boolean(fill), (el) => el.child(spaceBar(fill)))
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(8)
        .when(!lines.length && sel, (el) => el.bg(t.selected))
        .when(!lines.length && kb && curId === `ag-${a.address}`, (el) => el.border_1().border_color(t.accent))
        .cursor_pointer()
        .when(!lines.length, (el) => el.hover((s) => s.bg(a.focused ? t.selected : t.hover)))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        // right-click: the files this agent's session read and wrote (Session recap, when installed)
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "session-recap", kind: "dialog", frame: "none", width: 1040, height: 585, props: { session: this.crew?.[a.address]?.id } });
        })
        .child(gutter(t, a.status))
        // The program's icon; with sub-agents it also folds them (as the chevron does).
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`).flex_none()
          .when(subs.length > 0 || hasTasks(this, a, now), el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(4).items_center().text_size(SIZE.body)
          .child(div().min_w(0).max_w(full && sp && more ? 120 : 200).truncate().font_semibold().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(sp) && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(machine), el => el.child(tag(t, machine)))
        .when(needsYou, el => el.child(tag(t, "Needs you", t.blocked)))
        .when(subs.length > 0 || hasTasks(this, a, now), el => el.child(fold(a, subs))) // one chevron: tasks + sub-terminals
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(SIZE.meta).text_color(t.dim).child(duration(now - when))));
      if (!lines.length) return top;
      return v_flex().id(`agb-${a.address}`).flex_none().pb(4).gap(2).rounded(8).cursor_pointer()
        .when(sel, (el) => el.bg(t.selected))
        .when(kb && curId === `ag-${a.address}`, (el) => el.border_1().border_color(t.accent))
        .hover((s) => s.bg(a.focused ? t.selected : t.hover))
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .child(top).children(lines);
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header (kit section: sentence case, count right, chevron); it folds the group.
    // The label keeps its section's status color (Needs you, Working, Done): that's information.
    // Folded in grouped view, a small status mark says the most urgent state inside.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      const label = h_flex().gap(6).items_center()
        .when(Boolean(g.status), (el) => el.child(g.status === "working"
          ? spinner(t.working, 10)
          : div().size(10).flex_none().flex().items_center().justify_center().child(g.status === "blocked"
            ? dot(t.blocked, 5)
            : svg(ICON(SECTION_ICON[g.status])).size(10).text_color(t[g.status] ?? t.muted))))
        .child(div().min_w(0).truncate().when(Boolean(g.status), (el) => el.text_color(t[g.status] ?? t.muted)).child(g.label))
        .when(!open && !byPriority && Boolean(top) && top !== "idle", (el) =>
          el.child(top === "working" ? spinner(t.working, 10) : dot(statusColor(t, top), 6)));
      return section(t, g.id, label, g.members.length, {
        open,
        onClick: (_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        },
      }).when(kb && curId === g.id, (el) => el.rounded(6).bg(t.selected).border_1().border_color(t.accent));
    };

    // The keyboard's items, in the order they are drawn: group headers, agents, sub-agents.
    const items = (collapsed
      ? list.map((a) => [{ id: `ag-${a.address}`, a }])
      : groups.map((g) => [{ id: g.id, g }, ...(this.folded.has(g.id) ? [] : g.members.flatMap((a) => [
        { id: `ag-${a.address}`, a },
        ...(this.folded.has(a.address) ? [] : this.tree(all, a.address).map((s) => ({ id: `sub-${s.t.address}`, k: s.t, parent: a.address }))),
      ]))])).flat();
    const found = items.findIndex((x) => x.id === this.cur);
    const index = found >= 0 ? found
      : this.curIndex != null ? Math.min(this.curIndex, Math.max(0, items.length - 1))
      : Math.max(0, items.findIndex((x) => x.a?.focused));
    this.curIndex = index;
    const curItem = items[index];
    if (curItem) this.cur = curItem.id;
    const curId = curItem?.id;
    const hasSubs = (a) => this.tree(all, a.address).length > 0 || hasTasks(this, a, now);
    // fold(want): true opens, false folds, undefined toggles; a group, or an agent's sub-agents
    const kbFold = (want) => {
      const key = curItem?.g ? curItem.g.id : curItem?.a && hasSubs(curItem.a) ? curItem.a.address : null;
      if (!key) return;
      const open = want ?? this.folded.has(key);
      open ? this.folded.delete(key) : this.folded.add(key);
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    // Header right side, as in Crew: live → spinner + "n working"; else one quiet word.
    const working = list.filter((a) => a.status === "working").length;
    const blocked = list.filter((a) => a.status === "blocked").length;
    const done = list.filter((a) => a.status === "done").length;
    const status = blocked
      // needs you beats working: it is the one thing to act on; a click goes to the next one (⌘J too)
      ? h_flex().id("ag-blocked").flex_shrink(1).min_w(0).gap(6).items_center().cursor_pointer().rounded(4)
        .tooltip("Go to the next agent that needs you (⌘J)").on_click(() => nextBlocked())
        .child(dot(t.blocked, 6)).child(div().min_w(0).truncate().text_size(SIZE.meta).text_color(t.blocked).child(`${blocked} need${blocked === 1 ? "s" : ""} you`))
      : working
      // kit liveStatus, but able to shrink: at ~220px the header is a few px short of fitting it
      ? h_flex().flex_shrink(1).min_w(0).gap(6).items_center()
        .id("ag-working").tooltip(`${working} working`)
        // at 268px the header can't hold "n working" beside the count and the sort button: spinner + n says it
        .child(spinner(t.working, 11)).child(div().min_w(0).truncate().text_size(SIZE.meta).text_color(t.working).child(String(working)))
      : list.length
        ? div().flex_none().text_size(SIZE.meta).text_color(blocked ? t.blocked : t.dim)
          .child(blocked ? `${blocked} need${blocked === 1 ? "s" : ""} you` : done ? `${done} done` : "idle")
        : null;

    return surfaceless(t, "agents")
      .border_t(1)
      .border_color(t.border)
      .when(kb && !collapsed, (el) => el.border_1().border_color(t.accent))
      .track_focus(this.kb).on_key_down((e, cx) => navKey(e, cx, {
        count: items.length, index,
        set: (i) => { this.cur = items[i].id; this.curIndex = i; },
        enter: () => {
          if (curItem?.a) run("pane.focus", { pane: curItem.a.pane });
          else if (curItem?.k) this.peek(curItem.k.address);
          else kbFold();
        },
        space: () => kbFold(),
        right: () => kbFold(true),
        left: () => kbFold(false),
        keys: {
          p: () => curItem?.a && run("terminal.pin", { terminal: curItem.a.address, pinned: !curItem.a.pinned }),
          s: () => openOverlay({ mod: "agents-crew", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }),
        },
      }))
      .when(!collapsed, (el) => el.child(panelHeader(t, { rule: false, dense: true, 
        glyph: svg(ICON("terminal")).size(14).flex_none().text_color(t.muted),
        title: "Agents",
        onClick: foldOnClick("agents", "spaces", "sidebar-gap"),
        count: list.length ? String(list.length) : null,
        status,
        actions: [iconButton(t, "ag-sort", ICON(sort.icon), () => openOverlay({ mod: "agents-crew", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }), { tip: `Sort agents: ${sort.label}` })],
      })))
      .when(!collapsed, (el) => el.child(conflictBand(this, t) ?? div()))
      .child(list.length === 0 && !collapsed
        ? empty(t, {
          glyph: svg(ICON("terminal")).size(20).text_color(t.dim),
          title: "No agents yet",
          hint: "They show up here once they report their status. Older versions and agents inside tmux may not.",
        }).text_center()
        : v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).pb(8).gap(2).overflow_y_scrollbar().mode("always").children(rows))
      .when(kb && !collapsed, (el) => el.child(keyHints(t, "ag-keys", [["↑↓", "move"], ["⏎", "open"], ["Space", "fold"], ["p", "pin"], ["s", "sort"], ["Esc", "terminal"]])))
      .when(collapsed, (el) =>
        el.child(h_flex().h(34).flex_none().items_center().justify_center()
          .child(iconButton(t, "collapse", ICON("sidebar"), toggleSidebar, { tip: "Expand sidebar" }))));
  }
}
