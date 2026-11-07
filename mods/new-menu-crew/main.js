import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { SIZE, ICON, menuItem, menuSeparator, section, keyLabel } from "./kit.js";
import { theme, spaces, panes, knownAgents, run, openOverlay, closeOverlay, props, window, keys, shared, setShared } from "herdr";

// The last agents each machine reported, shown at once while knownAgents() checks again.
const KNOWN = "new-menu.agents";

function shortcut(name) {
  const k = keys().find(b => b.section === "global" && b.action === name);
  return keyLabel(k?.keys, window()?.platform === "macos");
}

export default class NewMenu extends View {
  init(_props, cx) {
    const machine = spaces().find(s => s.active)?.machine;
    const where = machine ?? "";
    this.agents = shared(KNOWN)?.[where] ?? [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async cx => {
      try {
        this.agents = await knownAgents({ on: machine });
        setShared(KNOWN, { ...shared(KNOWN), [where]: this.agents });
      }
      catch { this.failed = true; }
      cx.notify();
    });
  }
  row(id, icon, name, action, hint = "", enabled = true) {
    const t = theme();
    return menuItem(t, id, {
      icon, label: name, disabled: !enabled,
      // keys are caps (kit); words like "Not installed" stay plain dim text
      hint: hint ? (/^[1-9]$/.test(hint) || /[⌘⌃⌥⇧]|\+/.test(hint) ? hint : div().flex_none().text_size(SIZE.micro).text_color(t.dim).child(hint)) : undefined,
      onClick: () => { closeOverlay(props().overlay); action(); },
    }).flex_none();
  }
  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const installed = this.agents.filter(a => a.installed);
    const choices = [...installed, ...this.agents.filter(a => !a.installed).slice(0, 2)];
    const glyph = (name) => svg(ICON(name)).size(14).text_color(t.muted);
    return v_flex().min_h(0).w_full().h(Math.min(491, 166 + Math.max(1, choices.length) * 30)).bg(t.popover).p(4).text_size(SIZE.body)
      .id("new-menu").track_focus(this.handle)
      .on_key_down((e) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (!agent) return;
        closeOverlay(props().overlay);
        run("tab.new", { name: agent.name, space: space?.id, argv: agent.run });
      })
      .child(this.row("terminal", svg("icons/shell.svg").size(14).text_color(t.muted), "Terminal", () => run("tab.new", { space: space?.id }), shortcut("tab.new")))
      .child(section(t, "agents-label", "Start an agent"))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
        .children(choices.map((a, i) => this.row(a.key, a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14), a.name,
          () => run("tab.new", { name: a.name, space: space?.id, argv: a.run }), a.installed ? (i < 9 ? String(i + 1) : "") : "Not installed", a.installed)))
        .when(this.agents.length === 0, el => el.child(div().px(8).py(6).text_size(SIZE.meta).text_color(t.dim).child(this.failed ? "Could not load agents" : "Checking installed agents…"))))
      .child(menuSeparator(t))
      .child(this.row("space", glyph("plus"), "New space", () => run("space.new"), shortcut("space.new")))
      .child(this.row("worktree", glyph("git-branch"), "New worktree…", () => openOverlay({ mod: "worktree-crew", kind: "dialog", width: 460, height: 280, props: { space: space?.id, folder: panes().find(p => p.focused)?.cwd, action: "new" } }), "", Boolean(space)))
      .child(this.row("worktree-open", glyph("git-branch"), "Open worktree…", () => openOverlay({ mod: "worktree-crew", kind: "dialog", width: 560, height: 480, props: { space: space?.id, folder: panes().find(p => p.focused)?.cwd, action: "open" } }), "", Boolean(space)));
  }
}
