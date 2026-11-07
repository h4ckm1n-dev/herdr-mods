import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings, nextCommand, agents, notify } from "herdr";
import { SIZE, ICON, spinner, dot, tag, iconButton, askPanelFocus } from "./kit.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Next agent waiting for the person, any space; cycles from the shown one.
function nextBlocked() {
  const b = agents().filter((a) => a.status === "blocked");
  if (!b.length) return notify({ title: "No agent is waiting for you", level: "info", timeout: 2000 });
  run("agent.focus", { terminal: b[(b.findIndex((a) => a.focused) + 1) % b.length].address });
}

// Which mod each side panel shows: a key on a panel button sends it "focus".
const PANEL_MOD = { files: "files-crew", graph: "git", ops: "ops", cost: "cost" };

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    // Keys open a panel as its button does: "cmd-g": "tabs-crew.graph" in keys.json.
    // A key opens the panel *and* hands it the keyboard (a click only opens it: mouse users keep theirs).
    cx.spawn(async (cx) => {
      for (;;) {
        const id = await nextCommand();
        // tabs-crew is always shown, so the blocked-inbox key lives here (claude-crew's only works while its panel is open)
        if (id === "next-blocked") { nextBlocked(); continue; }
        // the panel takes the keyboard on its next render (kit askPanelFocus), loaded or still loading
        if (this.togglePanel(id) && PANEL_MOD[id]) askPanelFocus(PANEL_MOD[id]);
        cx.notify();
      }
    });
  }

  /** Shows or hides a side panel; true when it is now shown. */
  togglePanel(id) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    if (!panel || !body?.children?.some((c) => c.id === id)) return false;
    if (!panel.hidden && body.active === id) { run("layout.hide", { id: "panel" }); return false; }
    run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" });
    return true;
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const win = window();
    const winIcon = (file, size = 16) => svg(`mods/tabs-crew/${file}.svg`).size(size);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      const label = c.zoomed ? `${name} (zoomed)` : name;
      return h_flex().id(`tab-${c.id}`).h(24).px(8).gap(6).rounded(6).items_center().flex_none().text_size(SIZE.body)
        .border_1().border_color(c.active ? t.border : t.chrome).bg(c.active ? t.background : t.chrome)
        .text_color(c.active ? t.foreground : t.muted).cursor_pointer()
        .hover(s => s.bg(c.active ? t.background : t.hover).text_color(t.foreground))
        .accessibility_label(label)
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu-crew", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(c.status === "working", el => el.child(spinner(t.working)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(dot(t[c.status])))
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).flex_none().text_color(c.active ? t.foreground : t.muted) : image(program.icon).size(14).flex_none()))
        .child(div().max_w(170).truncate().font_medium().child(name))
        .when(c.zoomed, el => el.child(tag(t, "Zoom")))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).size(16).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.dim)
          .hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Close tab").accessibility_label("Close tab")
          .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); })
          .child(svg(ICON("x")).size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = win;
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = [...(shared("workspace.panels") ?? ["files"]).filter((id) => id !== "changes"), "graph", "ops", "cost"];
    // ponytail: the side panel is one window-wide layout block, so it stays as it is across spaces (no per-space restore).
    const panelButton = (id, icon, tip) => {
      const on = Boolean(panel && !panel.hidden && body?.active === id);
      return iconButton(t, `panel-${id}`, icon, () => {
        if (on) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
      }, { tip, on }).accessibility_label(tip.replace(/ ⌘G$/, ""));
    };
    const winBtn = (id, tip, icon, action) => iconButton(t, id, icon, action, { tip });
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(SIZE.body)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar().children(shown.map(item)))
      .child(iconButton(t, "tab-new", "plus", () => openOverlay({ mod: "new-menu-crew", kind: "popup", width: 250, height: 512 }), { tip: "New tab or agent" }))
      .child(div().w(1).h(14).flex_none().mx(4).bg(t.border))
      // code (Files, Git) · cluster and spend (Ops, Cost)
      .when(enabled.includes("files"), el => el.child(panelButton("files", "mods/files/file.svg", "Files")))
      .child(panelButton("graph", "mods/git/icons/graph.svg", "Git ⌘G"))
      .child(div().w(1).h(14).flex_none().mx(4).bg(t.border))
      .when(Boolean(find(root, "ops")), el => el.child(panelButton("ops", "mods/ops/ops.svg", "Ops")))
      .when(Boolean(find(root, "cost")), el => el.child(panelButton("cost", "mods/cost/cost.svg", "Cost")))
      .when(w?.buttons, el => el.child(div().w(1).h(14).flex_none().mx(4).bg(t.border))
        .child(winBtn("minimize", "Minimize", w.platform === "windows" ? winIcon("win-min") : ICON("minus"), () => run("window.minimize")))
        .child(winBtn("maximize", w.maximized ? "Restore" : "Maximize", w.platform === "windows" ? winIcon(w.maximized ? "win-restore" : "win-max") : ICON("square"), () => run("window.maximize")))
        .child(winBtn("close-window", "Close window", w.platform === "windows" ? winIcon("win-close") : ICON("x"), () => run("window.close"))));
  }
}
