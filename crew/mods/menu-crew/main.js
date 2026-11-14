// Context menus (Herdr's items). Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "global", target }.
// ↑/↓ move, Enter runs, Esc closes. An item is [label, command, args];
// a command "worktree" opens the worktree dialog instead.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec, window, shared, setShared } from "herdr";
import { SIZE, menuItem, menuSeparator, keyLabel } from "./kit.js";

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  // A linked worktree has its own git dir under the common one; a main checkout
  // or a submodule (git dir in super/.git/modules) shares it.
  const dirs = await exec("git", ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || dirs.code !== 0) return null;
  const [dir, common] = dirs.stdout.trim().split("\n");
  return dir === common ? "main" : "linked";
}

function items(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "pane": {
      // A kept sub-agent can go back under its parent, still running.
      const all = terminals();
      const term = all.find((t) => t.address === tg.terminal);
      const parent = term?.parent && all.find((t) => t.address === term.parent);
      // Once they go to the program, Shift+right-click still opens this menu.
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      return [
        ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
        ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
        ["Zoom", "pane.zoom", { pane: tg.pane }],
        ...(term
          ? [
              toProgram
                ? ["Use Herdr right-click menu", "terminal.right_click", { terminal: term.address, to: "menu" }]
                : ["Send right-clicks to pane", "terminal.right_click", { terminal: term.address, to: "program" }],
            ]
          : []),
        ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]] : []),
        ["Close pane", "pane.close", { pane: tg.pane }],
      ];
    }
    case "tab":
      return [
        ["Rename", "tab.rename", { id: tg.id }],
        ["New tab", "tab.new", { space: tg.space }],
        ["Close", "tab.close", { id: tg.id }],
      ];
    case "space":
      return [
        ["Rename", "space.rename", { id: tg.id }],
        ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : []),
        ...(git === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []),
        ["Close", "space.close", { id: tg.id }],
      ];
    default:
      return [
        ["New space", "space.new", {}],
        ["Keybinds", "mod.open", { name: "help-crew" }],
        ["Theme: graphite", "app.theme", { name: "graphite" }],
        ["Theme: ink", "app.theme", { name: "ink" }],
        ["Theme: moss", "app.theme", { name: "moss" }],
        ["Theme: atom one dark", "app.theme", { name: "atom-one-dark" }],
      ];
  }
}

function menuIcon(command) {
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : command === "app.help" ? "terminal" : command === "app.theme" ? "settings" : command === "pane.split" ? "panel-right" : command === "pane.zoom" ? "square" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}

// A space's color (shared "space.colors", read by every mod that draws spaces or
// their agents): the six theme-named marks spaces get by default, then two more.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const SWATCHES = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1", "#d6a83a", "#8a919c"];
const fillOf = (c) => (c.startsWith("#") ? c : MARK[c]);

function swatches(t, id) {
  const now = (shared("space.colors") ?? {})[id];
  return h_flex().px(8).py(6).gap(6).items_center().children(SWATCHES.map((c) =>
    div().id(`sw-${c}`).size(16).flex_none().rounded(8).cursor_pointer().bg(fillOf(c))
      .when(c === now, (el) => el.border_2().border_color(t.foreground))
      .hover((s) => s.border_2().border_color(t.foreground))
      .tooltip(c === now ? "Current color" : "Use this color")
      .on_click(() => {
        setShared("space.colors", { ...(shared("space.colors") ?? {}), [id]: c });
        closeOverlay(props()?.overlay);
      })));
}

// The key bound to a command, for the hint on the right.
function shortcut(name, args) {
  // `pane.split:right` binds pane.split with { direction: "right" }.
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? k.keys : "";
}

export default class Menu extends View {
  init(_props, cx) {
    this.at = 0;
    this.git = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props();
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const folder = space && place(space);
    if (folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
  }

  choose(i, cx) {
    const it = items(props(), this.git)[i];
    if (!it) return;
    closeOverlay(props()?.overlay);
    if (it[1] === "worktree") openOverlay({ mod: "worktree-crew", kind: "dialog", width: 1040, height: 585, props: it[2] });
    else run(it[1], it[2]);
  }

  render(cx) {
    const t = theme();
    const list = items(props(), this.git);
    return v_flex()
      .id("menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(4)
      .bg(t.popover)
      .text_size(SIZE.body)
      .when(props()?.tab === "space" && Boolean(props()?.target?.id), (el) => el.child(swatches(t, props().target.id)).child(menuSeparator(t)))
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at, cx);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((it, i) => {
          const danger = it[1].endsWith(".close");
          return v_flex()
            .when(i > 0 && (danger || it[1] === "app.help" || (it[1] === "app.theme" && list[i - 1][1] !== "app.theme")), el => el.child(menuSeparator(t)))
            .child(menuItem(t, `mi-${i}`, { icon: menuIcon(it[1]), label: it[0], hint: keyLabel(shortcut(it[1], it[2]), window()?.platform === "macos"), danger, onClick: (_e, cx) => this.choose(i, cx) })
              .when(i === this.at, (el) => el.bg(t.selected)));
        }),
      );
  }
}
