import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";
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

export default class WorkspaceChrome extends View {
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
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(ready, el => el.child(div().id("update-ready").flex_none().tooltip("Update ready").child(dot(t.accent, 6)))))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    // Brand bar: logo + 13px semibold name, then the kit's 26px icon buttons (tooltips included).
    return h_flex().id("brand").size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(SIZE.title)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().min_w(0).gap(8).items_center()
        .child(image("frame/welcome/herdr.png").size(20).rounded(4))
        .child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(iconButton(t, "search", OWN("search"), () => run("mod.open", { name: "picker" }), { tip: "Search" })))
      // On the macOS rail the traffic lights fill the row; the agents list's button unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(iconButton(t, "sidebar-toggle", OWN("sidebar"), toggleSidebar, { tip: collapsed ? "Expand sidebar" : "Collapse sidebar" })));
  }
}
