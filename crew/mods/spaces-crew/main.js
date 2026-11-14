// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, agents, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, nextCommand } from "herdr";
import { ICON, SIZE, dot, spinner, iconButton, surfaceless, tag, header, foldOnClick, navKey, trackTerminal, keyHints } from "./kit.js";

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

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
// one line, or two when the space has git meta to say (repo · branch ↑↓ under the name, as an agent's activity sits under it)
const rowHeight = ({ tree, meta }) => (meta ? 44 : tree ? 28 : 30);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
// (Fixed hexes, not theme(): an avatar is the space's identity, shared with other mods, and
// white initials need a strong fill in light themes too.)
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };


// A space's avatar, sized for the 16px gutter every Crew row starts with.
// Tinted, not filled: the hue still names the space at a glance, but six spaces no longer read as a rainbow.
const avatar = (fill, name) => h_flex().size(16).flex_none().rounded(4).bg(fill + "26").items_center().justify_center()
  .text_size(SIZE.micro).font_semibold().text_color(fill).child([...name][0]?.toUpperCase() ?? "?");

// Next agent waiting for the person, any space; cycles from the shown one (what ⌘J does).
const nextBlocked = () => {
  const b = agents().filter((a) => a.status === "blocked");
  if (b.length) run("agent.focus", { terminal: b[(b.findIndex((a) => a.focused) + 1) % b.length].address });
};

// Header right side, as the Agents header says it: spaces that need you, else spaces working.
function spacesStatus(t) {
  const sp = spaces(), blocked = sp.filter((w) => w.status === "blocked").length, working = sp.filter((w) => w.status === "working").length;
  if (blocked) return h_flex().flex_shrink(1).min_w(0).gap(6).items_center().id("sp-blocked").cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(nextBlocked).tooltip(`${blocked} space${blocked === 1 ? "" : "s"} need you · click for the next agent`)
    .child(dot(t.blocked, 6)).child(div().text_size(SIZE.meta).text_color(t.blocked).child(String(blocked)));
  if (working) return h_flex().flex_shrink(1).min_w(0).gap(6).items_center().id("sp-working").tooltip(`${working} space${working === 1 ? "" : "s"} working`)
    .child(spinner(t.working, 11)).child(div().text_size(SIZE.meta).text_color(t.working).child(String(working)));
  return null;
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.kb = cx.focus_handle(); // keyboard focus (DESIGN.md "Keyboard")
    this.cur = null; // the cursor, as an item id (follows the data)
    this.items = [];
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") { this.kb.focus(); cx.notify(); }
      }
    });
    this.machines = [];
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, dirty: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
        else if (line && !line.startsWith("#")) info.dirty++; // every other line is one changed or untracked path
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu-crew", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    // Simulate the batch so later indexes include earlier moves. An attempted
    // write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  foldMachine(m, want) {
    const open = want ?? this.folded.has(m);
    open ? this.folded.delete(m) : this.folded.add(m);
    localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
  }

  // The rows, under a header per machine once one isn't this computer. Each entry is
  // { id?, w?, m?, head?, make(cursor) }: entries with an id are what the keyboard walks.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => ({ id: `space-${r.w.id}`, w: r.w, m: r.w.machine ?? null, make: (cur) => (collapsed ? this.compact(r, t, cur) : this.row(r, t, cur)) });
    const plain = (el) => ({ make: () => el });
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().flex().items_center()
      .when(collapsed, el => el.justify_center()).when(!collapsed, el => el.pl(32).pr(8))
      .text_size(SIZE.meta).text_color(t.dim).child(collapsed ? "\u2026" : "Loading\u2026");
    if (!remote.length) return loading(null) && !rows.length ? [plain(loadingRow(null))] : rows.map(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const machineLabel = m ?? "This computer";
      // A machine's group label: Crew section anatomy (11px muted, sentence case, chevron), with
      // its icon in the row gutter so names line up with the space names under it.
      const head = (cur) => h_flex().id(`machine-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 2 : 8).gap(8).items_center().rounded(6)
        .text_size(SIZE.meta).text_color(t.muted)
        .cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
        .when(cur, el => el.bg(t.selected).border_1().border_color(t.accent))
        .when(collapsed, el => el.justify_center().tooltip(machineLabel).accessibility_label(machineLabel))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(h_flex().w(16).flex_none().justify_center().child(svg(ICON(m ? "server" : "monitor")).size(13).text_color(t.dim)))
        .when(!collapsed, el => el.child(div().flex_1().min_w(0).truncate().child(machineLabel))
          .when(!connected && !rebuilt, el => el.child(div().flex_none().text_color(t.dim).child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(4).items_center()
            .child(div().max_w(140).truncate().text_color(t.dim).child(repair?.error || "rebuilt \u00b7"))
            .child(div().id(`machine-connect-${m}`).px(4).rounded(4).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.bg(t.hover).text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting\u2026" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).size(20).flex_none().flex().items_center().justify_center().rounded(6)
            .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
            .tooltip(`New space on ${m ?? "this computer"}`).accessibility_label(`New space on ${m ?? "this computer"}`)
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); })
            .child(svg(ICON("plus")).size(12))))
          // connected: the theme's green, as before; else dim
          .child(dot(connected ? t.ansi2 : t.dim, 6))
          .child(svg(ICON(`chevron-${folded ? "right" : "down"}`)).size(12).flex_none().text_color(t.dim)));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(8).items_center().rounded(8)
        .when(collapsed, el => el.justify_center().tooltip("New space there").accessibility_label("New space there"))
        .cursor_pointer().text_size(SIZE.body).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .child(h_flex().w(16).flex_none().justify_center().child(svg(ICON("plus")).size(12)))
        .when(!collapsed, el => el.child("New space there"));
      const headEntry = { id: `machine-${m ?? "local"}`, m, head: true, make: head };
      if (!collapsed && rebuilt) return [headEntry];
      return [headEntry, ...(folded ? [] : mine.length ? mine.map(draw) : [plain(loading(m) ? loadingRow(m) : empty)])];
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitMeta(g, tree, name) {
    if (!g) return null;
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    return repo || branch || g.ahead > 0 || g.behind > 0 ? { repo, branch, ahead: g.ahead, behind: g.behind, dirty: g.dirty } : null;
  }

  gitTail({ repo, branch, ...g }, t) {
    return h_flex()
      .min_w(0)
      .gap(4)
      .items_center()
      .text_size(SIZE.meta)
      .text_color(t.dim)
      // the repo gives way first (it shrinks 4x faster, down to nothing); the branch keeps ~5 letters
      // repo and branch as one quiet line of meta ("Infra · production"): no box, so every row keeps one height
      .when(Boolean(repo), (el) => el.child(div().min_w(0).flex_shrink(4).truncate().child(repo)))
      .when(Boolean(repo) && Boolean(branch), (el) => el.child(div().flex_none().child("·")))
      .when(Boolean(branch), (el) => el.child(div().flex_shrink(1).min_w(40).truncate().text_color(t.muted).child(branch)))
      // uncommitted work, before a space is closed or a worktree removed: "±3" = three changed paths
      .when(g.dirty > 0, (el) => el.child(div().flex_none().text_size(SIZE.micro).text_color(t.working).child(`\u00b1${g.dirty}`)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_size(SIZE.micro).text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_size(SIZE.micro).text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  // A space's agents, said the way the Agents list says them: a spinner while one works, a dot when
  // one needs you or is done, then how many; idle ones are a quiet number. Same column on every row.
  agentMark(w, t) {
    const list = agents().filter((a) => a.space === w.id);
    if (!list.length) return null;
    const rank = { blocked: 4, done: 3, working: 2, idle: 1 };
    const top = list.reduce((m, a) => ((rank[a.status] ?? 0) > (rank[m] ?? 0) ? a.status : m), "idle");
    const color = top === "idle" ? t.dim : t[top] ?? t.dim;
    return h_flex().id(`sp-ag-${w.id}`).flex_none().pl(4).gap(4).items_center().justify_end()
      .tooltip(`${list.length} agent${list.length === 1 ? "" : "s"} · ${list.map((a) => a.status).join(", ")}`)
      .when(top === "working", (el) => el.child(spinner(t.working, 10)))
      .when(top === "blocked" || top === "done", (el) => el.child(dot(color, 6)))
      .child(div().flex_none().text_size(SIZE.micro).text_color(color).child(String(list.length)));
  }

  row({ w, i, g, tree }, t, cur = false) {
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const meta = this.gitMeta(g, tree, w.name), mark = this.agentMark(w, t);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree, meta }))
      .gap(2)
      .flex_none()
      .justify_center()
      .rounded(8)
      .cursor_pointer()
      .when(on || cur, (el) => el.bg(t.selected))
      .when(cur, (el) => el.border_1().border_color(t.accent))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .on_hover((h, cx) => { if (h) this.hoverId = w.id; else if (this.hoverId === w.id) this.hoverId = null; cx.notify(); })
      // Crew row anatomy: avatar in the 16px gutter, 12px semibold name, dim 11px meta right.
      // A worktree hangs one gutter in, its branch glyph where the avatar would be.
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .text_size(SIZE.body)
          .when(Boolean(tree), el => el.pl(24).child(h_flex().w(16).flex_none().justify_center().child(svg(ICON("branch")).size(12).text_color(t.dim))))
          .when(!tree, el => el.child(avatar(fill, w.name)))
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(on ? t.foreground : tree ? t.muted : t.foreground).child(w.name))
          // uncommitted paths ride on the name row when there is no git line under it: dirty alone never adds a line
          .when(!meta && g?.dirty > 0, (el) => el.child(div().flex_none().text_size(SIZE.micro).text_color(t.working).child(`\u00b1${g.dirty}`)))
          .when(Boolean(mark), (el) => el.child(mark))
          // close: on hover (and on the shown space), in a slot kept so names never shift.
          // space.close without `confirmed` lets Herdr ask first when the space has running terminals.
          .child(div().w(20).flex_none().flex().justify_end()
            .when(this.hoverId === w.id || on, (el) => el.child(iconButton(t, `sp-close-${w.id}`, "x",
              () => run("space.close", { id: w.id }), { tip: `Close ${w.name}`, size: 12 }).size(20)))),
      )
      // second line, under the name: repo · branch ↑↓ (the gutter stays empty, as under an agent)
      .when(Boolean(meta), (el) => el.child(h_flex().pl(tree ? 48 : 24).min_w(0).child(this.gitTail(meta, t))));
  }

  // The rail: number, and a dot only when the space needs you (glyph()). Tooltip names it.
  compact({ w, i }, t, cur = false) {
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .mx(4)
      .flex_none()
      .justify_center()
      .items_center()
      .gap(4)
      .rounded(6)
      .cursor_pointer()
      .when(w.active || cur, (el) => el.bg(t.selected))
      .when(cur, (el) => el.border_1().border_color(t.accent))
      .hover((s) => s.bg(w.active ? t.selected : t.hover))
      .tooltip(w.name)
      .accessibility_label(w.name)
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_size(SIZE.meta).text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .when(glyph(w.status) === "\u25cf", (el) => el.child(dot(tone(t, w.status), 6)));
  }

  render() {
    const t = theme();
    trackTerminal();
    const kb = this.kb.is_focused();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    const newSpace = iconButton(t, "space-new", ICON("plus"), () => run("space.new"), { tip: "New space" });
    const entries = this.grouped(t, collapsed);
    const items = entries.filter((e) => e.id);
    this.items = items;
    const found = items.findIndex((e) => e.id === this.cur);
    const index = found >= 0 ? found
      : this.curIndex != null ? Math.min(this.curIndex, Math.max(0, items.length - 1))
      : Math.max(0, items.findIndex((e) => e.w?.active));
    this.curIndex = index;
    const curItem = items[index];
    if (curItem) this.cur = curItem.id;
    // folding acts on the machine group of the cursor; the cursor lands on its header
    const hasGroups = items.some((e) => e.head);
    const kbFold = (want) => {
      if (!hasGroups || !curItem) return;
      this.foldMachine(curItem.m, want);
      this.cur = `machine-${curItem.m ?? "local"}`;
    };
    // A hairline above: the agents list and this one are two sections of one sidebar.
    return surfaceless(t, "spaces").border_t(1).border_color(t.border)
      .when(kb && !collapsed, (el) => el.border_1().border_color(t.accent))
      .track_focus(this.kb).on_key_down((e, cx) => navKey(e, cx, {
        count: items.length, index,
        set: (i) => { this.cur = items[i].id; this.curIndex = i; },
        enter: () => (curItem?.w ? run("space.select", { id: curItem.w.id }) : kbFold()),
        space: () => kbFold(),
        right: () => kbFold(true),
        left: () => kbFold(false),
        keys: {
          n: () => run("space.new"),
          m: () => curItem?.w && this.menu(curItem.w),
        },
      }))
      .child(collapsed
        ? h_flex().h(42).flex_none().items_center().justify_center().child(newSpace)
        : header(t, { rule: false, dense: true, status: spacesStatus(t), glyph: svg(ICON("folder")).size(14).flex_none().text_color(t.muted), title: "Spaces", onClick: foldOnClick("spaces", "agents", "sidebar-gap"), count: sp.length ? String(sp.length) : null, actions: [newSpace] }))
      .child(v_flex().id("space-list").flex_1().min_h(0).px(collapsed ? 0 : 8).pb(8).gap(2).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(entries.map((e) => e.make(kb && e.id === curItem?.id))))
      .when(kb && !collapsed, (el) => el.child(keyHints(t, "sp-keys", [["↑↓", "move"], ["↵", "open"], ...(hasGroups ? [["Space", "fold"]] : []), ["n", "new"], ["m", "menu"], ["Esc", "terminal"]])));
  }
}
