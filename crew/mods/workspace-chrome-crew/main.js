import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, exec, appHome, notify, readTextFile, keys } from "herdr";
import { SIZE, dot, iconButton } from "./kit.js";

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

// This mod's own icon copies (the kit's ICON() points at the shipped workspace-chrome set).
const OWN = (name) => `mods/workspace-chrome-crew/${name}.svg`;

// The picker ⌘P opens: picker-crew once its key is bound, Herdr's own otherwise.
const picker = () => keys().some(k => k.action === "mod.open:picker-crew") ? "picker-crew" : "picker";

export default class WorkspaceChrome extends View {
  init(_props, cx) {
    this.outlines = Boolean(props()?.footer);
    // The centered Settings / Add machine copies are opt-in: Herdr's own unless installed and on
    // (OhMyHerdr Mods leaves a stand-in main.js and parks the original in disabled-mods).
    // ponytail: checked once per mount; installing them while the footer shows takes a reload
    this.own = {};
    if (this.outlines) cx.spawn(async cx => {
      for (const m of ["settings-crew", "machine-add-crew"]) this.own[m] = Boolean(await readTextFile(`${appHome()}/mods/${m}/main.js`).catch(() => null))
        && !(await readTextFile(`${appHome()}/disabled-mods/${m}/main.js`).catch(() => null));
      cx.notify();
    });
    if (this.outlines) setShared("ohmyherdr.peek", null);
    if (this.outlines) cx.spawn(async () => {
      const r = await exec("python3", [appHome() + "/mods/workspace-chrome-crew/dialog_outlines.py", appHome()]);
      if (r.code !== 0) notify({ title: "Dialog outlines could not be applied", body: r.stderr, level: "error" });
    });
  }

  close() {
    if (this.outlines) return exec("python3", [appHome() + "/mods/workspace-chrome-crew/dialog_outlines.py", appHome(), "restore"]);
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      // Footer rows: Crew row anatomy (px 8, rounded 8, hover fill) with the icon in the 16px
      // gutter and 12px labels. In the rail only the icon shows, so it carries a tooltip.
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(8).items_center().rounded(8)
        .when(collapsed, el => el.justify_center().tooltip(label))
        .accessibility_label(label)
        .text_size(SIZE.body).text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action)
        .child(h_flex().w(16).flex_none().justify_center().child(svg(OWN(icon)).size(14)))
        .when(!collapsed, el => el.child(div().flex_1().min_w(0).truncate().child(label)));
      const ready = Boolean(updates().app.ready);
      return v_flex().id("sidebar-footer").size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(SIZE.title)
        // An update waiting: the accent dot, explained on hover.
        .child(row("settings", "settings", "Settings", false, () => this.own["settings-crew"] ? run("mod.open", { name: "settings-crew" }) : run("app.settings"))
          .when(ready, el => el.child(div().id("update-ready").flex_none().tooltip("Update ready").child(dot(t.accent, 6)))))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: this.own["machine-add-crew"] ? "machine-add-crew" : "machine-add" })));
    }
    // Brand bar: no logo or name, just the kit's 26px icon buttons (tooltips included).
    return h_flex().id("brand").size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(SIZE.title)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(div().flex_1()))
      .when(!collapsed, el => el.child(iconButton(t, "search", OWN("search"), () => run("mod.open", { name: picker() }), { tip: "Search" })))
      // On the macOS rail the traffic lights fill the row; the agents list's button unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(iconButton(t, "sidebar-toggle", OWN("sidebar"), toggleSidebar, { tip: collapsed ? "Expand sidebar" : "Collapse sidebar" })));
  }
}
